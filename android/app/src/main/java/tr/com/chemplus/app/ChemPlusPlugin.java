package tr.com.chemplus.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.view.HapticFeedbackConstants;
import android.view.WindowManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.mlkit.common.MlKitException;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native features of the Chem+ app; the JavaScript side is src/mobile/native.ts. */
@CapacitorPlugin(
    name = "ChemPlus",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class ChemPlusPlugin extends Plugin {

    private final ExecutorService fileWriter = Executors.newSingleThreadExecutor();
    private ApiBridge apiBridge;
    private Voice voice;
    private TextRecognizer textRecognizer;

    @Override
    public void load() {
        apiBridge = new ApiBridge(
            getActivity(),
            bridge.getLocalUrl(),
            text -> {
                JSObject data = new JSObject();
                data.put("text", text);
                notifyListeners("apiTrace", data);
            },
            this::notifyListeners
        );
        voice = new Voice(getActivity(), this::notifyListeners);
    }

    @Override
    protected void handleOnDestroy() {
        apiBridge.destroy();
        fileWriter.shutdown();
        voice.destroy();
        if (textRecognizer != null) textRecognizer.close();
    }

    // --- ChemPlus AI: voice (Voice.java) and reading text off a photo (ML Kit, on the device) ----

    @PluginMethod
    public void speechAvailable(PluginCall call) {
        JSObject out = new JSObject();
        out.put("recognition", voice.recognitionAvailable());
        out.put("permission", getPermissionState("microphone").toString().toLowerCase());
        call.resolve(out);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermission");
            return;
        }
        listen(call);
    }

    @PermissionCallback
    private void microphonePermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) listen(call);
        else call.reject("Mikrofon izni verilmedi.", "PERMISSION_DENIED");
    }

    private void listen(PluginCall call) {
        if (!voice.recognitionAvailable()) {
            call.reject("Bu cihazda konuşma tanıma hizmeti yok.", "UNAVAILABLE");
            return;
        }
        Integer silence = call.getInt("silenceMs", 2000);
        voice.startListening(call.getString("language", "tr-TR"), silence == null ? 2000 : silence);
        call.resolve();
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        if (call.getBoolean("cancel", false)) voice.cancelListening();
        else voice.finishListening();
        call.resolve();
    }

    /**
     * Speaks an answer sentence by sentence: `segments` of {text, rate, pitch, pauseMs} from the
     * voice personality (src/lib/ai/personality.ts), or a plain `text` as one sentence.
     */
    @PluginMethod
    public void speak(PluginCall call) {
        List<Voice.Segment> segments = new ArrayList<>();
        JSArray raw = call.getArray("segments");
        if (raw != null) {
            for (int i = 0; i < raw.length(); i++) {
                JSONObject item = raw.optJSONObject(i);
                if (item == null) continue;
                String text = item.optString("text", "").trim();
                if (text.isEmpty()) continue;
                segments.add(new Voice.Segment(
                    text,
                    clamp((float) item.optDouble("rate", 1), 0.5f, 2f),
                    clamp((float) item.optDouble("pitch", 1), 0.5f, 2f),
                    Math.max(0, Math.min(item.optInt("pauseMs", 0), 3000))
                ));
            }
        }
        String text = call.getString("text");
        if (segments.isEmpty() && text != null && !text.trim().isEmpty()) {
            Float rate = call.getFloat("rate", 1.0f);
            Float pitch = call.getFloat("pitch", 1.0f);
            segments.add(new Voice.Segment(text, rate == null ? 1f : clamp(rate, 0.5f, 2f), pitch == null ? 1f : clamp(pitch, 0.5f, 2f), 0));
        }
        if (segments.isEmpty()) {
            call.reject("text is required.", "INVALID_REQUEST");
            return;
        }
        voice.speak(
            call,
            segments,
            call.getString("language", "tr-TR"),
            call.getString("voice"),
            Boolean.TRUE.equals(call.getBoolean("bargeIn", false)),
            call.getString("token", "")
        );
    }

    /** Plays a natural-voice clip: `audio` is a base64 WAV from the website's /api/ai/tts. */
    @PluginMethod
    public void playAudio(PluginCall call) {
        String audio = call.getString("audio");
        if (audio == null || audio.isEmpty()) {
            call.reject("audio is required.", "INVALID_REQUEST");
            return;
        }
        Float speed = call.getFloat("speed", 1.0f);
        voice.playAudio(
            call,
            audio,
            call.getString("token", ""),
            Boolean.TRUE.equals(call.getBoolean("bargeIn", false)),
            speed == null ? 1f : clamp(speed, 0.5f, 2f)
        );
    }

    @PluginMethod
    public void listVoices(PluginCall call) {
        voice.listVoices(call, call.getString("language", "tr-TR"));
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        voice.stopSpeaking();
        call.resolve();
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    /** A light tap through the WebView, so the user's "touch feedback" setting decides. */
    @PluginMethod
    public void haptic(PluginCall call) {
        String kind = call.getString("kind", "tick");
        getActivity().runOnUiThread(() -> {
            int feedback;
            if ("confirm".equals(kind)) {
                feedback = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.CONTEXT_CLICK;
            } else if ("reject".equals(kind)) {
                feedback = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
            } else {
                feedback = HapticFeedbackConstants.CLOCK_TICK;
            }
            bridge.getWebView().performHapticFeedback(feedback);
            call.resolve();
        });
    }

    @PluginMethod
    public void audioRoute(PluginCall call) {
        JSObject out = new JSObject();
        out.put("headphones", voice.headphones());
        call.resolve(out);
    }

    @PluginMethod
    public void recognizeText(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null) {
            call.reject("base64 is required.", "INVALID_REQUEST");
            return;
        }
        fileWriter.execute(() -> {
            Bitmap bitmap;
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            } catch (IllegalArgumentException e) {
                call.reject("Görsel okunamadı.", "INVALID_IMAGE");
                return;
            }
            if (bitmap == null) {
                call.reject("Görsel okunamadı.", "INVALID_IMAGE");
                return;
            }
            if (textRecognizer == null) textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            textRecognizer
                .process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener(result -> {
                    JSObject out = new JSObject();
                    out.put("text", result.getText());
                    out.put("blocks", result.getTextBlocks().size());
                    call.resolve(out);
                })
                .addOnFailureListener(e -> {
                    // Until Play services has fetched the model (right after install, or offline),
                    // ML Kit reports UNAVAILABLE; say so instead of "could not read".
                    if (e instanceof MlKitException && ((MlKitException) e).getErrorCode() == MlKitException.UNAVAILABLE) {
                        call.reject("Metin okuma modeli indiriliyor; birkaç saniye sonra tekrar deneyin.", "OCR_MODEL_DOWNLOADING", e);
                    } else {
                        call.reject("Fotoğraftaki metin okunamadı.", "OCR_FAILED", e);
                    }
                });
        });
    }

    @PluginMethod
    public void apiRequest(PluginCall call) {
        apiBridge.request(call);
    }

    @PluginMethod
    public void warmApi(PluginCall call) {
        apiBridge.warm();
        call.resolve();
    }

    /** The soft keyboard for the field the page focused (a page alone cannot bring it up without a tap). */
    @PluginMethod
    public void showKeyboard(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            android.view.View webView = getBridge().getWebView();
            webView.requestFocus();
            androidx.core.view.WindowCompat.getInsetsController(getActivity().getWindow(), webView).show(androidx.core.view.WindowInsetsCompat.Type.ime());
            android.view.inputmethod.InputMethodManager keyboard = (android.view.inputmethod.InputMethodManager) getContext().getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
            if (keyboard != null) keyboard.showSoftInput(webView, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
            call.resolve();
        });
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64");
        if (fileName == null || base64 == null) {
            call.reject("fileName and base64 are required.", "INVALID_REQUEST");
            return;
        }
        fileWriter.execute(() -> {
            try {
                call.resolve(Files.save(getContext(), fileName, mimeType, base64));
            } catch (Exception e) {
                call.reject("Dosya kaydedilemedi.", "SAVE_FAILED", e);
            }
        });
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        Uri uri = ownFile(call);
        if (uri == null) return;
        try {
            Files.open(getContext(), uri, call.getString("mimeType", "*/*"));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Bu dosyayı açabilecek bir uygulama bulunamadı.", "NO_APP");
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        Uri uri = ownFile(call);
        if (uri == null) return;
        try {
            Files.share(getContext(), uri, call.getString("mimeType", "*/*"), call.getString("title", ""));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Paylaşım açılamadı.", "NO_APP");
        }
    }

    @PluginMethod
    public void printPage(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Printing.printWebView(getActivity(), bridge.getWebView(), call.getString("title"));
            call.resolve();
        });
    }

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        if (html == null) {
            call.reject("html is required.", "INVALID_REQUEST");
            return;
        }
        getActivity().runOnUiThread(() -> {
            Printing.printHtml(getActivity(), bridge, html, call.getString("title"));
            call.resolve();
        });
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        Uri uri = Uri.parse(call.getString("url", ""));
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme) && !"mailto".equals(scheme) && !"tel".equals(scheme)) {
            call.reject("Unsupported link.", "INVALID_URL");
            return;
        }
        try {
            getContext().startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Bağlantıyı açabilecek bir uygulama bulunamadı.", "NO_APP");
        }
    }

    @PluginMethod
    public void googleSignIn(PluginCall call) {
        getActivity().runOnUiThread(() -> GoogleSignIn.start(getActivity(), call));
    }

    private Uri ownFile(PluginCall call) {
        Uri uri = Uri.parse(call.getString("uri", ""));
        if (!Files.isOwnFile(getContext(), uri)) {
            call.reject("Unknown file.", "INVALID_URI");
            return null;
        }
        return uri;
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    @SuppressWarnings("unused")
    private static JSObject empty() {
        return new JSObject();
    }
}
