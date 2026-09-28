package tr.com.chemplus.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.PlaybackParams;
import android.media.audiofx.Visualizer;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Speech in and out for ChemPlus AI's voice mode (src/lib/ai/voice.ts): Android's own speech
 * recognizer and text-to-speech engine. Nothing is recorded or stored by the app - the recognizer
 * hands back text, and the text goes to the AI like a typed question.
 *
 * The voice matters as much as the words. Speech is asked of Google's engine when it is installed
 * (the phone's default engine otherwise) and, unless the user picked one, spoken in the most
 * natural voice the phone has for the language: Google's network voices (the neural ones) when the
 * phone is online, the best installed one when it is not.
 *
 * An answer arrives in blocks - sentences to be said in one breath - each with its rate, pitch and
 * the silence after it (the voice personality, src/lib/ai/personality.ts, grouped by voice.ts).
 * Each block is one utterance and each silence a silent utterance. While it speaks:
 *   · ttsSegment says which block started, ttsRange which words (where the engine reports them);
 *   · ttsLevel carries the voice's loudness, measured on the speech's own audio session with a
 *     Visualizer, so Robert's face on the voice screen speaks with the actual voice;
 *   · other audio (music) is ducked;
 *   · with headphones on, BargeIn.java listens for the user talking over the answer (bargeIn).
 * Every speech event carries the caller's token, so a late event of an earlier answer is ignored.
 *
 * Robert's natural voice (Gemini, voiced by the website's /api/ai/tts) arrives as WAV clips, which
 * playAudio() plays through the same pipeline: the same events, focus, interruption and Bluetooth
 * timing, with loudness taken from the samples and progress from the playback position.
 *
 * Recognizer events reach JavaScript as plugin events (speechReady, speechPartial, speechFinal,
 * speechLevel, speechEnd, speechError). SpeechRecognizer must live on the main thread, so every
 * call into it is posted there.
 */
final class Voice {

    interface Events {
        void emit(String name, JSObject data);
    }

    /** A part of an answer said in one breath, as the voice personality wants it said. */
    static final class Segment {
        final String text;
        final float rate;
        final float pitch;
        final int pauseMs;

        Segment(String text, float rate, float pitch, int pauseMs) {
            this.text = text;
            this.rate = rate;
            this.pitch = pitch;
            this.pauseMs = pauseMs;
        }
    }

    private static final String GOOGLE_TTS = "com.google.android.tts";
    private static final String PREFIX = "chemplus-";

    private final Activity activity;
    private final Events events;
    private final AudioManager audio;
    private SpeechRecognizer recognizer;
    /** When the last recognizer was torn down, and the start waiting for it to settle. */
    private long destroyedAt;
    private Runnable pendingStart = () -> {};
    private static final long RESTART_GAP_MS = 300;
    private TextToSpeech tts;
    private boolean ttsReady;
    private boolean ttsStarting;
    private final List<Runnable> waitingForTts = new ArrayList<>();
    private PluginCall speaking;
    private volatile String speakingToken = "";
    private volatile int utterance;
    /** Character offset of each queued piece within its sentence (for sentences split to fit). */
    private final Map<String, Integer> pieceOffsets = new ConcurrentHashMap<>();
    /** The audio session speech plays in, so its loudness can be measured. */
    private int session = AudioManager.ERROR;
    private Visualizer visualizer;
    private float levelPeak = 0.05f;
    /** An AudioFocusRequest (API 26+), kept untyped so older phones never load the class. */
    private Object focusRequest;
    private boolean hasFocus;
    private final Handler main = new Handler(Looper.getMainLooper());
    /** Music comes back a moment after an answer, not between its parts ("Hemen hesaplıyorum." … result). */
    private final Runnable releaseFocus = this::dropFocus;
    private BargeIn bargeIn;
    /** The voice "Automatic" settled on this session. */
    private String automaticVoice;
    /** A natural-voice clip being played (playAudio). */
    private AudioTrack player;
    private volatile boolean playerFeeding;
    private Runnable playerTick;
    /**
     * How long sound takes to reach the ear after the engine plays it: about a fifth of a second
     * over Bluetooth. Loudness and word events wait that long, so Robert's face and the captions move
     * with what is heard, not ahead of it.
     */
    private volatile long outputDelayMs;

    Voice(Activity activity, Events events) {
        this.activity = activity;
        this.events = events;
        this.audio = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
    }

    boolean recognitionAvailable() {
        return SpeechRecognizer.isRecognitionAvailable(activity);
    }

    /**
     * @param silenceMs how long a pause ends the question. Recognizers that honour the extras wait
     *                  this long instead of cutting in at the first breath; the voice mode also
     *                  keeps listening after an early result (src/mobile/ai/voiceEngine.ts).
     */
    void startListening(String language, int silenceMs) {
        activity.runOnUiThread(() -> {
            destroyRecognizer();
            main.removeCallbacks(pendingStart);
            // A recognizer started right after another was torn down can answer "busy" on some
            // phones, which looked like listening that stops and starts by itself.
            long wait = Math.max(0, RESTART_GAP_MS - (android.os.SystemClock.uptimeMillis() - destroyedAt));
            pendingStart = () -> createRecognizer(language, silenceMs);
            if (wait == 0) pendingStart.run();
            else main.postDelayed(pendingStart, wait);
        });
    }

    private void createRecognizer(String language, int silenceMs) {
        SpeechRecognizer created = SpeechRecognizer.createSpeechRecognizer(activity);
        recognizer = created;
        // Every callback checks it still belongs to the current recognizer: a late error from one
        // that was just cancelled must not end the next one.
        created.setRecognitionListener(new RecognitionListener() {
            private boolean current() {
                return recognizer == created;
            }

            @Override
            public void onReadyForSpeech(Bundle params) {
                if (current()) events.emit("speechReady", new JSObject());
            }

            @Override
            public void onBeginningOfSpeech() {
                if (current()) events.emit("speechBegin", new JSObject());
            }

            @Override
            public void onRmsChanged(float rmsdB) {
                if (!current()) return;
                // Roughly -2 dB (silence) to 10 dB (speaking up close), mapped to 0…1.
                JSObject data = new JSObject();
                data.put("level", Math.max(0f, Math.min(1f, (rmsdB + 2f) / 12f)));
                events.emit("speechLevel", data);
            }

            @Override
            public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {
                if (current()) events.emit("speechEnd", new JSObject());
            }

            @Override
            public void onError(int error) {
                if (!current()) return;
                JSObject data = new JSObject();
                data.put("code", errorCode(error));
                destroyRecognizer();
                events.emit("speechError", data);
            }

            @Override
            public void onResults(Bundle results) {
                if (!current()) return;
                JSObject data = new JSObject();
                data.put("text", firstResult(results));
                destroyRecognizer();
                events.emit("speechFinal", data);
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                if (!current()) return;
                JSObject data = new JSObject();
                data.put("text", firstResult(partialResults));
                events.emit("speechPartial", data);
            }

            @Override
            public void onEvent(int eventType, Bundle params) {}
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, activity.getPackageName());
        // A question about chemistry has pauses in it ("0,1 molar… asetik asidin… pH'ı").
        int silence = Math.max(800, Math.min(silenceMs, 6000));
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, silence);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, silence);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 2000);
        created.startListening(intent);
    }

    /** Stops listening and delivers what was heard so far. */
    void finishListening() {
        activity.runOnUiThread(() -> {
            if (recognizer != null) recognizer.stopListening();
        });
    }

    /** Stops listening and throws away what was heard. */
    void cancelListening() {
        activity.runOnUiThread(() -> {
            main.removeCallbacks(pendingStart);
            destroyRecognizer();
        });
    }

    // --- speaking ---------------------------------------------------------------------------------

    /** Runs `then` on the main thread once the engine is up (starting it on first use). */
    private void withTts(Runnable then) {
        activity.runOnUiThread(() -> {
            if (ttsReady) {
                then.run();
                return;
            }
            waitingForTts.add(then);
            if (ttsStarting) return;
            ttsStarting = true;
            // Google's engine has the neural network voices; the constructor falls back to the
            // phone's default engine when it is not installed.
            tts = new TextToSpeech(activity, status -> activity.runOnUiThread(() -> {
                ttsStarting = false;
                ttsReady = status == TextToSpeech.SUCCESS;
                if (ttsReady) {
                    tts.setOnUtteranceProgressListener(progress());
                    if (audio != null) session = audio.generateAudioSessionId();
                }
                List<Runnable> waiting = new ArrayList<>(waitingForTts);
                waitingForTts.clear();
                for (Runnable runnable : waiting) runnable.run();
            }), GOOGLE_TTS);
        });
    }

    void listVoices(PluginCall call, String language) {
        withTts(() -> {
            if (!ttsReady) {
                call.reject("Metin okuma motoru kullanılamıyor.", "TTS_UNAVAILABLE");
                return;
            }
            Locale wanted = Locale.forLanguageTag(language);
            boolean online = isOnline();
            List<android.speech.tts.Voice> matches = voicesFor(wanted, online);
            JSArray list = new JSArray();
            for (android.speech.tts.Voice voice : matches) {
                JSObject item = new JSObject();
                item.put("name", voice.getName());
                item.put("quality", voice.getQuality());
                item.put("network", voice.isNetworkConnectionRequired());
                item.put("locale", voice.getLocale().toLanguageTag());
                list.put(item);
            }
            JSObject out = new JSObject();
            out.put("voices", list);
            out.put("engine", tts.getDefaultEngine());
            out.put("online", online);
            out.put("best", matches.isEmpty() ? null : matches.get(0).getName());
            call.resolve(out);
        });
    }

    /**
     * Queues the blocks: each one utterance with its rate and pitch (the engine reads both when an
     * utterance is queued), then the silence the personality asked for.
     */
    void speak(PluginCall call, List<Segment> segments, String language, String voiceName, boolean allowBargeIn, String token) {
        withTts(() -> {
            if (!ttsReady) {
                call.reject("Metin okuma motoru kullanılamıyor.", "TTS_UNAVAILABLE");
                return;
            }
            Locale wanted = Locale.forLanguageTag(language);
            int result = tts.setLanguage(wanted);
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                call.reject("Bu dil için ses verisi yüklü değil (Ayarlar → Metin okuma).", "TTS_LANGUAGE");
                return;
            }
            android.speech.tts.Voice chosen = pickVoice(wanted, voiceName);
            if (chosen != null) {
                try {
                    tts.setVoice(chosen);
                } catch (RuntimeException ignored) {
                    // a voice that vanished between listing and speaking: the language voice stays
                }
            }
            finishSpeaking(true);
            speaking = call;
            speakingToken = token == null ? "" : token;
            outputDelayMs = bluetoothOutput() ? 220 : 0;
            utterance += 1;
            pieceOffsets.clear();
            int limit = Math.max(200, TextToSpeech.getMaxSpeechInputLength() - 100);
            boolean first = true;
            for (int i = 0; i < segments.size(); i++) {
                Segment segment = segments.get(i);
                tts.setSpeechRate(segment.rate);
                tts.setPitch(segment.pitch);
                List<String> pieces = chunks(segment.text, limit);
                int offset = 0;
                for (int p = 0; p < pieces.size(); p++) {
                    boolean last = i == segments.size() - 1 && p == pieces.size() - 1;
                    String id = PREFIX + utterance + "-" + i + "-" + p + (last ? "-last" : "");
                    pieceOffsets.put(id, offset);
                    offset += pieces.get(p).length() + 1;
                    tts.speak(pieces.get(p), first ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, params(), id);
                    first = false;
                }
                if (segment.pauseMs > 0 && i < segments.size() - 1) {
                    tts.playSilentUtterance(Math.min(segment.pauseMs, 2500), TextToSpeech.QUEUE_ADD, PREFIX + utterance + "-" + i + "-pause");
                }
            }
            // Leave the engine neutral for anything queued without a personality.
            tts.setSpeechRate(1f);
            tts.setPitch(1f);
            gainFocus();
            startLevels();
            if (allowBargeIn) startBargeIn();
        });
    }

    void stopSpeaking() {
        activity.runOnUiThread(() -> {
            if (tts != null) tts.stop();
            finishSpeaking(true);
        });
    }

    // --- Robert's natural voice: a WAV from the website's /api/ai/tts, played here ---------------

    /**
     * Plays a WAV clip (base64) the way speak() plays speech: the same events (ttsStart, ttsLevel,
     * ttsProgress, ttsDone, bargeIn), audio focus and interruption, so voice mode treats both
     * alike. Loudness comes from the samples themselves and progress from the playback position,
     * so Robert's face and the captions follow exactly what is heard. `speed` changes the pace without
     * changing the pitch.
     */
    void playAudio(PluginCall call, String base64, String token, boolean allowBargeIn, float speed) {
        new Thread(() -> {
            Wav wav;
            try {
                wav = Wav.parse(android.util.Base64.decode(base64, android.util.Base64.DEFAULT));
            } catch (IllegalArgumentException | OutOfMemoryError e) {
                wav = null;
            }
            if (wav == null) {
                call.reject("Ses çözülemedi.", "AUDIO_INVALID");
                return;
            }
            Wav clip = wav;
            float[] levels;
            float[][] shapes;
            try {
                levels = clip.levels();
                shapes = clip.shapes();
            } catch (RuntimeException | OutOfMemoryError e) {
                call.reject("Ses çözülemedi.", "AUDIO_INVALID");
                return;
            }
            activity.runOnUiThread(() -> startPlayer(call, clip, levels, shapes, token, allowBargeIn, speed));
        }, "chemplus-audio-decode").start();
    }

    private void startPlayer(PluginCall call, Wav wav, float[] levels, float[][] shapes, String token, boolean allowBargeIn, float speed) {
        if (tts != null) tts.stop();
        finishSpeaking(true);
        // A late "done" from speech that was stopped must not end this clip.
        utterance += 1;
        int channelMask = wav.channels == 2 ? AudioFormat.CHANNEL_OUT_STEREO : AudioFormat.CHANNEL_OUT_MONO;
        int minBuffer = AudioTrack.getMinBufferSize(wav.sampleRate, channelMask, AudioFormat.ENCODING_PCM_16BIT);
        AudioTrack track;
        try {
            track = new AudioTrack.Builder()
                .setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setAudioFormat(
                    new AudioFormat.Builder()
                        .setSampleRate(wav.sampleRate)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(channelMask)
                        .build()
                )
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setBufferSizeInBytes(Math.max(minBuffer, wav.sampleRate / 4 * 2 * wav.channels))
                .build();
        } catch (RuntimeException e) {
            call.reject("Ses çalınamadı.", "AUDIO_FAILED");
            return;
        }
        if (Math.abs(speed - 1f) > 0.01f) {
            try {
                track.setPlaybackParams(new PlaybackParams().setSpeed(speed).setPitch(1f));
            } catch (RuntimeException ignored) {
                // this phone cannot stretch time: the voice keeps its own pace
            }
        }
        speaking = call;
        speakingToken = token == null ? "" : token;
        outputDelayMs = bluetoothOutput() ? 220 : 0;
        player = track;
        gainFocus();
        if (allowBargeIn) startBargeIn();
        int total = wav.frames();
        playerFeeding = true;
        try {
            track.play();
        } catch (RuntimeException e) {
            // The phone would not start the track: say so, so the phone's voice can take over.
            playerFeeding = false;
            player = null;
            speaking = null;
            try {
                track.release();
            } catch (RuntimeException ignored) {
                // already gone
            }
            call.reject("Ses çalınamadı.", "AUDIO_FAILED");
            return;
        }
        emitHeard("ttsStart", tokenData());
        new Thread(() -> {
            int offset = wav.dataOffset;
            int end = wav.dataOffset + wav.dataLength;
            while (playerFeeding && offset < end) {
                int written;
                try {
                    written = track.write(wav.bytes, offset, Math.min(8192, end - offset));
                } catch (RuntimeException e) {
                    break; // released under us: stopped
                }
                if (written <= 0) break;
                offset += written;
            }
            playerFeeding = false;
        }, "chemplus-audio").start();
        long[] stalledSince = { 0 };
        int[] lastPosition = { -1 };
        playerTick = new Runnable() {
            @Override
            public void run() {
                if (player != track) return;
                int position;
                try {
                    position = track.getPlaybackHeadPosition();
                } catch (RuntimeException e) {
                    position = total;
                }
                int index = (int) ((long) position * 1000L / wav.sampleRate / Wav.LEVEL_FRAME_MS);
                JSObject level = tokenData();
                level.put("level", index < levels.length ? levels[index] : 0f);
                if (index < shapes[0].length) {
                    level.put("bright", shapes[0][index]);
                    level.put("f1", shapes[1][index]);
                    level.put("f2", shapes[2][index]);
                }
                emitHeard("ttsLevel", level);
                JSObject progress = tokenData();
                progress.put("fraction", Math.min(1.0, position / (double) Math.max(1, total)));
                emitHeard("ttsProgress", progress);
                // Done when every frame has played, or when feeding ended and the head stopped.
                long now = android.os.SystemClock.uptimeMillis();
                if (position != lastPosition[0]) {
                    lastPosition[0] = position;
                    stalledSince[0] = now;
                }
                boolean stalled = !playerFeeding && now - stalledSince[0] > 400;
                if (position >= total || stalled) {
                    finishSpeaking(false);
                    return;
                }
                main.postDelayed(this, 40);
            }
        };
        main.postDelayed(playerTick, 40);
    }

    private void stopPlayer() {
        AudioTrack track = player;
        player = null;
        playerFeeding = false;
        if (playerTick != null) main.removeCallbacks(playerTick);
        playerTick = null;
        if (track == null) return;
        try {
            track.pause();
            track.flush();
            track.stop();
        } catch (RuntimeException ignored) {
            // never started
        }
        track.release();
    }

    /** Headphones of any kind: the answer does not reach the microphone, so barge-in is safe. */
    boolean headphones() {
        if (audio == null) return false;
        for (AudioDeviceInfo device : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int type = device.getType();
            if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET
                || type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                || type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                || type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && type == AudioDeviceInfo.TYPE_USB_HEADSET) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && type == AudioDeviceInfo.TYPE_BLE_HEADSET) return true;
        }
        return false;
    }

    void destroy() {
        activity.runOnUiThread(() -> {
            main.removeCallbacks(pendingStart);
            destroyRecognizer();
            stopPlayer();
            stopBargeIn();
            releaseLevels();
            main.removeCallbacks(releaseFocus);
            dropFocus();
            if (tts != null) {
                tts.stop();
                tts.shutdown();
                tts = null;
                ttsReady = false;
            }
        });
    }

    private Bundle params() {
        Bundle params = new Bundle();
        if (session > 0) params.putInt(TextToSpeech.Engine.KEY_PARAM_SESSION_ID, session);
        return params;
    }

    /**
     * The named voice if it is usable, else the most natural one for the language. "Automatic"
     * keeps the voice it chose while that voice stays usable, so the voice never changes between
     * the parts of an answer ("Hemen hesaplıyorum." … the result … the explanation).
     */
    private android.speech.tts.Voice pickVoice(Locale wanted, String name) {
        boolean online = isOnline();
        List<android.speech.tts.Voice> matches = voicesFor(wanted, online);
        if (name != null && !name.isEmpty()) {
            for (android.speech.tts.Voice voice : matches) {
                if (voice.getName().equals(name) && (online || !voice.isNetworkConnectionRequired())) return voice;
            }
        }
        if (automaticVoice != null) {
            for (android.speech.tts.Voice voice : matches) {
                if (voice.getName().equals(automaticVoice)) return voice;
            }
        }
        android.speech.tts.Voice best = matches.isEmpty() ? null : matches.get(0);
        if (best != null) automaticVoice = best.getName();
        return best;
    }

    /** Installed voices for the language, most natural first; network voices only when online. */
    private List<android.speech.tts.Voice> voicesFor(Locale wanted, boolean online) {
        List<android.speech.tts.Voice> out = new ArrayList<>();
        Set<android.speech.tts.Voice> all;
        try {
            all = tts.getVoices();
        } catch (RuntimeException e) {
            return out;
        }
        if (all == null) return out;
        for (android.speech.tts.Voice voice : all) {
            if (voice.getLocale() == null || !voice.getLocale().getLanguage().equals(wanted.getLanguage())) continue;
            Set<String> features = voice.getFeatures();
            if (features != null && features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
            if (voice.isNetworkConnectionRequired() && !online) continue;
            out.add(voice);
        }
        Collections.sort(out, (a, b) -> Integer.compare(score(b, wanted), score(a, wanted)));
        return out;
    }

    private static int score(android.speech.tts.Voice voice, Locale wanted) {
        int score = voice.getQuality();
        // Google's network voices are its neural ones: the closest to a person talking.
        if (voice.isNetworkConnectionRequired()) score += 80;
        if (wanted.getCountry().equalsIgnoreCase(voice.getLocale().getCountry())) score += 20;
        if (voice.getLatency() <= android.speech.tts.Voice.LATENCY_NORMAL) score += 5;
        return score;
    }

    private boolean isOnline() {
        ConnectivityManager manager = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        Network network = manager.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : manager.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private boolean micGranted() {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    /** A speech event, timed to when its sound is heard rather than when it is played. */
    private void emitHeard(String name, JSObject data) {
        long delay = outputDelayMs;
        if (delay <= 0) events.emit(name, data);
        else main.postDelayed(() -> events.emit(name, data), delay);
    }

    /** Bluetooth output, where sound reaches the ear noticeably after it is played. */
    private boolean bluetoothOutput() {
        if (audio == null) return false;
        for (AudioDeviceInfo device : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int type = device.getType();
            if (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && (type == AudioDeviceInfo.TYPE_BLE_HEADSET || type == AudioDeviceInfo.TYPE_BLE_SPEAKER)) return true;
        }
        return false;
    }

    private JSObject tokenData() {
        JSObject data = new JSObject();
        data.put("token", speakingToken);
        return data;
    }

    /** "chemplus-<utterance>-<sentence>-<piece>[-last]" → sentence and piece, or null for pauses. */
    private int[] parse(String id) {
        if (id == null || !id.startsWith(PREFIX) || id.endsWith("-pause")) return null;
        String[] parts = id.substring(PREFIX.length()).split("-");
        if (parts.length < 3) return null;
        try {
            int number = Integer.parseInt(parts[0]);
            if (number != utterance) return null;
            return new int[] { Integer.parseInt(parts[1]), Integer.parseInt(parts[2]) };
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private UtteranceProgressListener progress() {
        return new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                int[] at = parse(utteranceId);
                if (at == null || at[1] != 0) return;
                if (at[0] == 0) emitHeard("ttsStart", tokenData());
                JSObject data = tokenData();
                data.put("index", at[0]);
                emitHeard("ttsSegment", data);
            }

            @Override
            public void onRangeStart(String utteranceId, int start, int end, int frame) {
                int[] at = parse(utteranceId);
                if (at == null) return;
                Integer offset = pieceOffsets.get(utteranceId);
                int shift = offset == null ? 0 : offset;
                JSObject data = tokenData();
                data.put("index", at[0]);
                data.put("start", start + shift);
                data.put("end", end + shift);
                emitHeard("ttsRange", data);
            }

            @Override
            public void onDone(String utteranceId) {
                if (utteranceId != null && utteranceId.endsWith("-last") && utteranceId.startsWith(PREFIX + utterance + "-")) {
                    activity.runOnUiThread(() -> finishSpeaking(false));
                }
            }

            @Override
            public void onError(String utteranceId) {
                // One sentence failing (a network voice losing the network) does not end the
                // answer; the last one ending, well or not, does.
                if (utteranceId != null && utteranceId.endsWith("-last") && utteranceId.startsWith(PREFIX + utterance + "-")) {
                    activity.runOnUiThread(() -> finishSpeaking(false));
                }
            }
        };
    }

    private void finishSpeaking(boolean interrupted) {
        stopPlayer();
        stopBargeIn();
        pauseLevels();
        main.removeCallbacks(releaseFocus);
        if (hasFocus) main.postDelayed(releaseFocus, 1500);
        if (speaking == null) return;
        JSObject data = tokenData();
        data.put("interrupted", interrupted);
        speaking.resolve(data);
        speaking = null;
        events.emit("ttsDone", data);
    }

    // --- the voice's loudness and shape, for Robert's face ----------------------------------------

    private void startLevels() {
        if (session <= 0 || !micGranted()) return;
        try {
            if (visualizer == null) {
                visualizer = new Visualizer(session);
                // About 20 ms of the output: long enough to tell the voice's shape (VoiceShape).
                int[] sizes = Visualizer.getCaptureSizeRange();
                visualizer.setCaptureSize(Math.max(sizes[0], Math.min(sizes[1], 1024)));
                visualizer.setScalingMode(Visualizer.SCALING_MODE_AS_PLAYED);
                visualizer.setDataCaptureListener(new Visualizer.OnDataCaptureListener() {
                    @Override
                    public void onWaveFormDataCapture(Visualizer v, byte[] waveform, int samplingRate) {
                        emitLevel(waveform, samplingRate);
                    }

                    @Override
                    public void onFftDataCapture(Visualizer v, byte[] fft, int samplingRate) {}
                }, Visualizer.getMaxCaptureRate(), true, false);
            }
            visualizer.setEnabled(true);
        } catch (RuntimeException e) {
            // no effect engine for this session on this phone: the screen animates on its own
            releaseLevels();
        }
    }

    private void emitLevel(byte[] waveform, int samplingRate) {
        if (waveform == null || waveform.length == 0 || speaking == null) return;
        // The output's rate comes in milliHertz.
        double rate = samplingRate > 0 ? samplingRate / 1000.0 : 44100.0;
        VoiceShape.LowPass filter = new VoiceShape.LowPass(rate);
        VoiceShape.Frame shape = new VoiceShape.Frame(rate);
        // The filter starts from silence: its first few samples are left out of the shape.
        int settle = Math.min(48, waveform.length / 4);
        double sum = 0;
        for (int i = 0; i < waveform.length; i++) {
            int value = (waveform[i] & 0xFF) - 128;
            sum += value * value;
            double x = value / 128.0;
            double low = filter.next(x);
            if (i >= settle) shape.add(x, low);
        }
        float rms = (float) (Math.sqrt(sum / waveform.length) / 128.0);
        // Relative to the recent peak, so the movement is the same at any volume.
        levelPeak = Math.max(rms, levelPeak * 0.985f);
        float level = rms < 0.004f || levelPeak <= 0f ? 0f : Math.min(1f, rms / levelPeak);
        JSObject data = tokenData();
        data.put("level", level);
        if (sum > 0) {
            data.put("bright", shape.bright());
            data.put("f1", shape.f1());
            data.put("f2", shape.f2());
        }
        emitHeard("ttsLevel", data);
    }

    private void pauseLevels() {
        if (visualizer == null) return;
        try {
            visualizer.setEnabled(false);
        } catch (RuntimeException e) {
            releaseLevels();
        }
    }

    private void releaseLevels() {
        if (visualizer == null) return;
        try {
            visualizer.setEnabled(false);
        } catch (RuntimeException ignored) {
            // already gone
        }
        visualizer.release();
        visualizer = null;
    }

    // --- other audio steps back while ChemPlus talks ------------------------------------------------

    @SuppressWarnings("deprecation") // the pre-Android 8 focus call, for phones that still run it
    private void gainFocus() {
        main.removeCallbacks(releaseFocus);
        if (audio == null || hasFocus) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioFocusRequest request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .build();
            focusRequest = request;
            hasFocus = audio.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } else {
            hasFocus = audio.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
    }

    @SuppressWarnings("deprecation")
    private void dropFocus() {
        if (audio == null || !hasFocus) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) audio.abandonAudioFocusRequest((AudioFocusRequest) focusRequest);
        else audio.abandonAudioFocus(null);
        focusRequest = null;
        hasFocus = false;
    }

    // --- talking over an answer (headphones only) ---------------------------------------------------

    private void startBargeIn() {
        stopBargeIn();
        if (!micGranted() || !headphones()) return;
        String token = speakingToken;
        BargeIn monitor = new BargeIn(() -> activity.runOnUiThread(() -> {
            if (speaking == null || !token.equals(speakingToken)) return;
            JSObject data = new JSObject();
            data.put("token", token);
            events.emit("bargeIn", data);
        }));
        if (monitor.start()) bargeIn = monitor;
    }

    private void stopBargeIn() {
        if (bargeIn == null) return;
        bargeIn.stop();
        bargeIn = null;
    }

    private void destroyRecognizer() {
        SpeechRecognizer old = recognizer;
        // Cleared first: anything the old recognizer still says is no longer "current".
        recognizer = null;
        if (old == null) return;
        old.cancel();
        old.destroy();
        destroyedAt = android.os.SystemClock.uptimeMillis();
    }

    private static String firstResult(Bundle bundle) {
        if (bundle == null) return "";
        ArrayList<String> list = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return list == null || list.isEmpty() ? "" : list.get(0);
    }

    /** Splits at sentence ends so each piece stays under the engine's input limit. */
    private static List<String> chunks(String text, int limit) {
        List<String> out = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String sentence : text.split("(?<=[.!?…])\\s+")) {
            if (current.length() + sentence.length() + 1 > limit && current.length() > 0) {
                out.add(current.toString());
                current.setLength(0);
            }
            if (sentence.length() > limit) {
                for (int i = 0; i < sentence.length(); i += limit) out.add(sentence.substring(i, Math.min(sentence.length(), i + limit)));
            } else {
                if (current.length() > 0) current.append(' ');
                current.append(sentence);
            }
        }
        if (current.length() > 0) out.add(current.toString());
        if (out.isEmpty()) out.add(" ");
        return out;
    }

    private static String errorCode(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "NO_MATCH";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "SPEECH_TIMEOUT";
            case SpeechRecognizer.ERROR_AUDIO:
                return "AUDIO";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "NETWORK";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "PERMISSION";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "BUSY";
            case SpeechRecognizer.ERROR_CLIENT:
                return "CLIENT";
            default:
                return "ERROR_" + error;
        }
    }
}
