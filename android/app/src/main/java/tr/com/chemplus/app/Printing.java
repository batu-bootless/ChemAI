package tr.com.chemplus.app;

import android.app.Activity;
import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Bridge;

/** window.print() for the dashboard: Android's print dialog, which can also save a PDF. */
final class Printing {

    // A print view must stay alive until the print dialog has laid its pages out.
    private static WebView pendingView;

    private Printing() {}

    static void printWebView(Activity activity, WebView webView, String title) {
        PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
        String jobName = title == null || title.trim().isEmpty() ? activity.getString(R.string.print_job_name) : title.trim();
        printManager.print(jobName, webView.createPrintDocumentAdapter(jobName), new PrintAttributes.Builder().build());
    }

    /** Prints an HTML document (a report or chart the dashboard built for a print window). */
    static void printHtml(Activity activity, Bridge bridge, String html, String title) {
        WebView view = new WebView(activity);
        view.getSettings().setJavaScriptEnabled(false);
        view.setWebViewClient(
            new WebViewClient() {
                private boolean printed;

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                    // Images and styles of the dashboard come from the app itself.
                    return bridge.getLocalServer().shouldInterceptRequest(request);
                }

                @Override
                public void onPageFinished(WebView v, String url) {
                    if (printed) return;
                    printed = true;
                    printWebView(activity, v, title);
                }
            }
        );
        pendingView = view;
        view.loadDataWithBaseURL(bridge.getLocalUrl() + "/", html, "text/html", "UTF-8", null);
    }
}
