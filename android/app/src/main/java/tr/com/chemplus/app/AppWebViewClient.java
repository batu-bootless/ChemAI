package tr.com.chemplus.app;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Map;

/** Capacitor's WebView client, with app requests first mapped onto the exported files (AppRoutes). */
final class AppWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;
    private final AppRoutes routes;

    AppWebViewClient(Bridge bridge, AppRoutes routes) {
        super(bridge);
        this.bridge = bridge;
        this.routes = routes;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (bridge.getScheme().equals(url.getScheme()) && bridge.getHost().equals(url.getHost())) {
            String target = routes.resolve(url.getPath());
            if (target != null) {
                request = new RoutedRequest(request, url.buildUpon().path(target).build());
            }
        }
        return super.shouldInterceptRequest(view, request);
    }

    /** The original request with another URL. */
    private static final class RoutedRequest implements WebResourceRequest {

        private final WebResourceRequest original;
        private final Uri url;

        RoutedRequest(WebResourceRequest original, Uri url) {
            this.original = original;
            this.url = url;
        }

        @Override
        public Uri getUrl() {
            return url;
        }

        @Override
        public boolean isForMainFrame() {
            return original.isForMainFrame();
        }

        @Override
        public boolean isRedirect() {
            return original.isRedirect();
        }

        @Override
        public boolean hasGesture() {
            return original.hasGesture();
        }

        @Override
        public String getMethod() {
            return original.getMethod();
        }

        @Override
        public Map<String, String> getRequestHeaders() {
            return original.getRequestHeaders();
        }
    }
}
