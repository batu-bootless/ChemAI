package tr.com.chemplus.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ChemPlusPlugin.class);
        super.onCreate(savedInstanceState);
        // Capacitor serves one index.html for every page; the exported dashboard has one per route.
        bridge.setWebViewClient(new AppWebViewClient(bridge, AppRoutes.load(this)));
    }
}
