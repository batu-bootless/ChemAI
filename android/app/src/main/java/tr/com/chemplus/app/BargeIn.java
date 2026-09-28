package tr.com.chemplus.app;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;

/**
 * Hears the user start talking while ChemPlus AI is speaking, so they can interrupt it with their
 * voice the way they would a person (Voice.java starts it only with headphones on: through the
 * phone's speaker the microphone would hear the answer itself).
 *
 * Nothing is recorded or kept. Each 20 ms of sound is reduced to its loudness and dropped; speech
 * is a loudness well above the room's own noise floor, held for about a quarter of a second.
 */
final class BargeIn {

    interface Listener {
        void onSpeech();
    }

    private static final int RATE = 16000;
    private static final int FRAME = 320; // 20 ms
    /** Frames spent learning the room before listening for speech. */
    private static final int WARM_UP = 15;
    /** Speech frames (net of gaps) that count as the user talking. */
    private static final int TRIGGER = 13;

    private final Listener listener;
    private AudioRecord record;
    private Thread thread;
    private volatile boolean running;

    BargeIn(Listener listener) {
        this.listener = listener;
    }

    /** False when the microphone cannot be opened (no permission, busy, no such source). */
    boolean start() {
        int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (min <= 0) return false;
        try {
            record = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(min, FRAME * 2 * 8)
            );
            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                release();
                return false;
            }
            record.startRecording();
        } catch (RuntimeException e) {
            release();
            return false;
        }
        running = true;
        thread = new Thread(this::listen, "chemplus-barge-in");
        thread.start();
        return true;
    }

    private void listen() {
        short[] frame = new short[FRAME];
        double floor = 0;
        int frames = 0;
        int voiced = 0;
        while (running) {
            AudioRecord source = record;
            if (source == null) break;
            int read;
            try {
                read = source.read(frame, 0, FRAME);
            } catch (RuntimeException e) {
                break; // released under us
            }
            if (read < 0) break;
            if (read == 0) continue;
            double sum = 0;
            for (int i = 0; i < read; i++) sum += (double) frame[i] * frame[i];
            double db = 10 * Math.log10(sum / read / (32768.0 * 32768.0) + 1e-12);
            frames++;
            if (frames <= WARM_UP) {
                floor = frames == 1 ? db : Math.min(floor, db);
                continue;
            }
            // The floor follows quiet quickly and loud slowly, so talking does not raise it.
            floor = db < floor ? Math.max(-90, db) : floor + (db - floor) * 0.002;
            boolean speech = db > floor + 15 && db > -48;
            voiced = speech ? voiced + 1 : Math.max(0, voiced - 1);
            if (voiced >= TRIGGER) {
                running = false;
                listener.onSpeech();
                break;
            }
        }
    }

    void stop() {
        running = false;
        Thread current = thread;
        thread = null;
        if (current != null && current != Thread.currentThread()) {
            try {
                current.join(300);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        release();
    }

    private void release() {
        AudioRecord current = record;
        record = null;
        if (current == null) return;
        try {
            current.stop();
        } catch (RuntimeException ignored) {
            // never started
        }
        current.release();
    }
}
