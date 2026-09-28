package tr.com.chemplus.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Calls the live website's API routes (AI, PDF search, account deletion) for the dashboard.
 *
 * <p>The website sits behind Vercel's bot protection, which answers requests that do not come
 * from a browser with a "Security Checkpoint" page. So the calls run inside a hidden browser view
 * that has opened a small file of the website (and passed the check like any browser tab): from
 * there they are ordinary same-origin fetches. The routes read the Supabase session from cookies,
 * so the app's session cookies are copied to the website's cookie jar before each call. Nothing on
 * the website is changed.
 *
 * <p>A call made with {@code stream: true} hands its answer over as it arrives: "apiStream" events
 * with the call's {@code streamId} ("head" with the status, then "chunk"s of text, then "end" or
 * "error"), so a streamed answer (server-sent events) can be shown word by word.
 */
final class ApiBridge {

    static final String WEBSITE = "https://chemplus.com.tr";

    private static final String TAG = "ChemPlusApi";
    private static final String ANCHOR_URL = WEBSITE + "/favicon.ico";
    private static final String CHECKPOINT_MARKER = "Vercel Security Checkpoint";
    private static final String JS_RECEIVER = "ChemPlusApiBridge";
    private static final long LOAD_TIMEOUT_MS = 45_000;
    private static final int DEFAULT_TIMEOUT_MS = 120_000;

    /** What the bridge did (the anchor, the website's check, retries, timeouts), for the app's log. */
    interface Trace {
        void note(String text);
    }

    /** Events to the JavaScript side (the pieces of streamed answers). */
    interface Events {
        void emit(String name, JSObject data);
    }

    private final Activity activity;
    private final String appOrigin;
    private final Trace trace;
    private final Events events;
    private long anchorStartedAt;
    private final Handler main = new Handler(Looper.getMainLooper());
    // Everything below is used on the main thread only.
    private final Map<String, Pending> inFlight = new HashMap<>();
    private final List<Pending> waiting = new ArrayList<>();
    private final Runnable loadTimeout = () -> {
        note("site sayfası " + LOAD_TIMEOUT_MS / 1000 + " sn'de açılamadı (güvenlik kontrolü geçilemedi?)");
        failWaiting("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
    };
    private WebView view;
    private boolean ready;
    private boolean loading;
    private int lastId;

    private static final class Pending {

        final PluginCall call;
        final boolean retried;
        Runnable timeout;
        /** A streamed call whose answer has begun: its status and headers, kept for the end. */
        boolean streaming;
        int status;
        JSObject headers;

        Pending(PluginCall call, boolean retried) {
            this.call = call;
            this.retried = retried;
        }
    }

    ApiBridge(Activity activity, String appOrigin, Trace trace, Events events) {
        this.activity = activity;
        this.appOrigin = appOrigin;
        this.trace = trace;
        this.events = events;
    }

    private void note(String text) {
        try {
            trace.note(text);
        } catch (RuntimeException ignored) {
            // the log is a nicety
        }
    }

    void request(PluginCall call) {
        String path = call.getString("path", "");
        if (!path.startsWith("/api/")) {
            call.reject("Only /api/ paths are allowed.", "INVALID_PATH");
            return;
        }
        main.post(() -> enqueue(new Pending(call, false)));
    }

    /**
     * Opens the website's page ahead of the first call (the AI screen or voice mode opened), so a
     * question does not wait for it - or for the website's check.
     */
    void warm() {
        main.post(() -> {
            if (!ready && !loading) loadAnchor();
        });
    }

    void destroy() {
        main.post(() -> {
            failWaiting("Uygulama kapatıldı.");
            for (Pending pending : new ArrayList<>(inFlight.values())) {
                pending.call.reject("Uygulama kapatıldı.", "CLOSED");
            }
            inFlight.clear();
            if (view != null) {
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
                view.destroy();
                view = null;
            }
        });
    }

    private void enqueue(Pending pending) {
        if (ready) {
            send(pending);
            return;
        }
        waiting.add(pending);
        loadAnchor();
    }

    private void loadAnchor() {
        if (loading) return;
        if (view == null) view = createView();
        loading = true;
        ready = false;
        anchorStartedAt = android.os.SystemClock.uptimeMillis();
        note("site sayfası açılıyor (" + waiting.size() + " istek bekliyor)");
        view.loadUrl(ANCHOR_URL);
        main.postDelayed(loadTimeout, LOAD_TIMEOUT_MS);
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private WebView createView() {
        WebView webView = new WebView(activity);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                webView,
                JS_RECEIVER,
                Collections.singleton(WEBSITE),
                (source, message, origin, isMainFrame, reply) -> onResult(message.getData())
            );
        } else {
            webView.addJavascriptInterface(new LegacyReceiver(), JS_RECEIVER);
        }

        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                    // The checkpoint only reloads the same page; nothing else may open here.
                    return !WEBSITE.equals(origin(request.getUrl()));
                }

                @Override
                public void onPageFinished(WebView v, String url) {
                    if (loading && WEBSITE.equals(origin(Uri.parse(url)))) checkAnchor();
                }

                @Override
                public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                    if (loading && request.isForMainFrame()) {
                        note("site sayfası açılamadı: " + error.getDescription());
                        failWaiting("İnternet bağlantısı yok. Bağlantınızı kontrol edip tekrar deneyin.");
                    }
                }
            }
        );

        // Attached, 1 px and drawn - but underneath the app, so nobody sees it - so the checkpoint's
        // script runs as it would in a browser tab (a view that is never drawn gets no animation
        // frames, which a browser check may wait for).
        webView.setFocusable(false);
        webView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        ViewGroup root = activity.findViewById(android.R.id.content);
        root.addView(webView, 0, new ViewGroup.LayoutParams(1, 1));
        return webView;
    }

    private void checkAnchor() {
        view.evaluateJavascript(
            "document.title",
            title -> {
                if (!loading) return;
                if (title != null && title.contains(CHECKPOINT_MARKER)) {
                    // The checkpoint page reloads the file itself once the browser has passed.
                    note("sitenin güvenlik kontrolü çalışıyor");
                    return;
                }
                main.removeCallbacks(loadTimeout);
                loading = false;
                ready = true;
                note("site sayfası hazır (" + (android.os.SystemClock.uptimeMillis() - anchorStartedAt) + " ms), " + waiting.size() + " istek gidiyor");
                List<Pending> queued = new ArrayList<>(waiting);
                waiting.clear();
                for (Pending pending : queued) send(pending);
            }
        );
    }

    private void failWaiting(String message) {
        if (!waiting.isEmpty()) note(waiting.size() + " istek gönderilemedi: " + message);
        main.removeCallbacks(loadTimeout);
        loading = false;
        ready = false;
        for (Pending pending : waiting) pending.call.reject(message, "NETWORK");
        waiting.clear();
        if (view != null) view.stopLoading();
    }

    private void send(Pending pending) {
        String id = String.valueOf(++lastId);
        inFlight.put(id, pending);
        pending.timeout = () -> {
            if (inFlight.remove(id) != null) {
                note(pending.call.getString("path", "") + " zaman aşımı");
                pending.call.reject("Sunucu zamanında yanıt vermedi.", "TIMEOUT");
            }
        };
        main.postDelayed(pending.timeout, timeoutOf(pending));

        String script;
        try {
            script = fetchScript(id, pending.call);
        } catch (JSONException e) {
            finish(id);
            pending.call.reject("İstek hazırlanamadı.", "INVALID_REQUEST", e);
            return;
        }
        copySessionCookies(() -> {
            if (view != null && inFlight.containsKey(id)) view.evaluateJavascript(script, null);
        });
    }

    private static int timeoutOf(Pending pending) {
        return pending.call.getInt("timeoutMs", DEFAULT_TIMEOUT_MS);
    }

    private static String fetchScript(String id, PluginCall call) throws JSONException {
        JSONObject init = new JSONObject();
        init.put("method", call.getString("method", "GET"));
        JSONObject headers = new JSONObject();
        JSObject requested = call.getObject("headers", new JSObject());
        for (Iterator<String> keys = requested.keys(); keys.hasNext(); ) {
            String key = keys.next();
            String lower = key.toLowerCase();
            if (lower.equals("cookie") || lower.equals("host") || lower.equals("content-length")) continue;
            headers.put(key, requested.getString(key));
        }
        init.put("headers", headers);
        String body = call.getString("body");
        if (body != null) init.put("body", body);
        init.put("credentials", "same-origin");
        init.put("cache", "no-store");

        String send = JS_RECEIVER + ".postMessage(JSON.stringify(m))";
        if (Boolean.TRUE.equals(call.getBoolean("stream", false))) {
            // An answer that is not a stream (an error, the website's check) comes back whole.
            return "(function(){var id=" + JSONObject.quote(id) + ";" +
                "function post(m){" + send + ";}" +
                "fetch(" + JSONObject.quote(call.getString("path")) + "," + init + ")" +
                ".then(function(r){var h={};r.headers.forEach(function(v,k){h[k]=v;});" +
                "if(!r.ok||!r.body||!r.body.getReader){return r.text().then(function(t){post({id:id,status:r.status,headers:h,body:t});});}" +
                "post({id:id,head:true,status:r.status,headers:h});" +
                "var reader=r.body.getReader(),dec=new TextDecoder();" +
                "function pump(){return reader.read().then(function(x){" +
                "if(x.done){var tail=dec.decode();if(tail)post({id:id,chunk:tail});post({id:id,end:true});return;}" +
                "var t=dec.decode(x.value,{stream:true});if(t)post({id:id,chunk:t});return pump();});}" +
                "return pump();})" +
                ".catch(function(e){post({id:id,error:String(e)});});})();";
        }
        return "(function(){var id=" + JSONObject.quote(id) + ";" +
            "fetch(" + JSONObject.quote(call.getString("path")) + "," + init + ")" +
            ".then(function(r){return r.text().then(function(t){var h={};" +
            "r.headers.forEach(function(v,k){h[k]=v;});" +
            "var m={id:id,status:r.status,headers:h,body:t};" + send + ";});})" +
            ".catch(function(e){var m={id:id,error:String(e)};" + send + ";});})();";
    }

    private void onResult(String json) {
        JSONObject message;
        try {
            message = new JSONObject(json);
        } catch (JSONException e) {
            Log.w(TAG, "Unreadable API result", e);
            return;
        }
        String id = message.optString("id");
        if (message.optBoolean("head") || message.has("chunk") || message.optBoolean("end") || (message.has("error") && isStreaming(id))) {
            onStreamPart(id, message);
            return;
        }
        Pending pending = finish(id);
        if (pending == null) return;

        if (message.has("error")) {
            note(pending.call.getString("path", "") + " ağ hatası: " + message.optString("error"));
            pending.call.reject("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.", "NETWORK");
            return;
        }
        int status = message.optInt("status");
        String body = message.optString("body");
        if (status == 429 && body.contains(CHECKPOINT_MARKER) && !pending.retried) {
            // The website wants this browser to pass its check again; retry once after that.
            note(pending.call.getString("path", "") + ": site güvenlik kontrolü istedi, yeniden denenecek");
            ready = false;
            enqueue(new Pending(pending.call, true));
            return;
        }
        if (status == 429 && body.contains(CHECKPOINT_MARKER)) note(pending.call.getString("path", "") + ": güvenlik kontrolü ikinci kez de geçilemedi");

        JSObject headers = new JSObject();
        JSONObject received = message.optJSONObject("headers");
        if (received != null) {
            for (Iterator<String> keys = received.keys(); keys.hasNext(); ) {
                String key = keys.next();
                headers.put(key, received.optString(key));
            }
        }
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("headers", headers);
        result.put("body", body);
        pending.call.resolve(result);
    }

    private boolean isStreaming(String id) {
        Pending pending = inFlight.get(id);
        return pending != null && pending.streaming;
    }

    /** A part of a streamed answer: passed on at once, and the call's timeout starts again. */
    private void onStreamPart(String id, JSONObject message) {
        Pending pending = inFlight.get(id);
        if (pending == null) return;
        JSObject event = new JSObject();
        event.put("stream", pending.call.getString("streamId", id));
        if (message.optBoolean("head")) {
            pending.streaming = true;
            pending.status = message.optInt("status");
            pending.headers = new JSObject();
            JSONObject received = message.optJSONObject("headers");
            if (received != null) {
                for (Iterator<String> keys = received.keys(); keys.hasNext(); ) {
                    String key = keys.next();
                    pending.headers.put(key, received.optString(key));
                }
            }
            event.put("kind", "head");
            event.put("status", pending.status);
            event.put("headers", pending.headers);
        } else if (message.has("chunk")) {
            event.put("kind", "chunk");
            event.put("text", message.optString("chunk"));
        } else if (message.optBoolean("end")) {
            finish(id);
            event.put("kind", "end");
            events.emit("apiStream", event);
            JSObject result = new JSObject();
            result.put("status", pending.status);
            result.put("headers", pending.headers == null ? new JSObject() : pending.headers);
            result.put("body", "");
            result.put("streamed", true);
            pending.call.resolve(result);
            return;
        } else {
            finish(id);
            note(pending.call.getString("path", "") + " akış koptu: " + message.optString("error"));
            event.put("kind", "error");
            event.put("message", message.optString("error"));
            events.emit("apiStream", event);
            pending.call.reject("Sunucuyla bağlantı koptu.", "NETWORK");
            return;
        }
        if (pending.timeout != null) {
            main.removeCallbacks(pending.timeout);
            main.postDelayed(pending.timeout, timeoutOf(pending));
        }
        events.emit("apiStream", event);
    }

    private Pending finish(String id) {
        Pending pending = inFlight.remove(id);
        if (pending != null && pending.timeout != null) main.removeCallbacks(pending.timeout);
        return pending;
    }

    /** Makes the website's Supabase session cookies equal to the app's (sb-*), then runs {@code then}. */
    private void copySessionCookies(Runnable then) {
        CookieManager cookies = CookieManager.getInstance();
        Map<String, String> app = parseCookies(cookies.getCookie(appOrigin));
        Map<String, String> site = parseCookies(cookies.getCookie(WEBSITE));

        List<String> updates = new ArrayList<>();
        for (String name : site.keySet()) {
            if (name.startsWith("sb-") && !app.containsKey(name)) {
                updates.add(name + "=; Max-Age=0; Path=/; Secure; SameSite=Lax");
            }
        }
        for (Map.Entry<String, String> cookie : app.entrySet()) {
            if (cookie.getKey().startsWith("sb-") && !cookie.getValue().equals(site.get(cookie.getKey()))) {
                updates.add(cookie.getKey() + "=" + cookie.getValue() + "; Path=/; Secure; SameSite=Lax");
            }
        }
        if (updates.isEmpty()) {
            then.run();
            return;
        }
        // The call goes once every cookie is set - or after a second at the latest, should the cookie
        // store never confirm one (it would otherwise wait for the call's two-minute timeout).
        boolean[] sent = { false };
        Runnable once = () -> {
            if (sent[0]) return;
            sent[0] = true;
            cookies.flush();
            then.run();
        };
        main.postDelayed(once, 1000);
        int[] remaining = { updates.size() };
        for (String update : updates) {
            cookies.setCookie(
                WEBSITE,
                update,
                done -> {
                    if (--remaining[0] == 0) {
                        main.removeCallbacks(once);
                        once.run();
                    }
                }
            );
        }
    }

    private static Map<String, String> parseCookies(String header) {
        Map<String, String> cookies = new LinkedHashMap<>();
        if (header == null) return cookies;
        for (String part : header.split(";")) {
            int eq = part.indexOf('=');
            if (eq > 0) cookies.put(part.substring(0, eq).trim(), part.substring(eq + 1).trim());
        }
        return cookies;
    }

    private static String origin(Uri uri) {
        return uri.getScheme() + "://" + uri.getAuthority();
    }

    /** For WebView versions without WebMessageListener (JavaScript bridge; results only). */
    private final class LegacyReceiver {

        @JavascriptInterface
        public void postMessage(String json) {
            main.post(() -> onResult(json));
        }
    }
}
