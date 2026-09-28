import type { CapacitorConfig } from "@capacitor/cli";

// ChemAI Android app. `npm run build` exports the app to out/, and Capacitor bundles it into the
// app, which serves it from https://localhost and opens straight into Iris (/dashboard/).
const config: CapacitorConfig = {
  appId: "com.chemai.app",
  appName: "ChemAI",
  webDir: "out",
  server: {
    androidScheme: "https",
    appStartPath: "/dashboard/",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      // AppShell hides it as soon as the app is up; this is the upper bound.
      launchShowDuration: 3000,
      launchFadeOutDuration: 200,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    LocalNotifications: {
      // Timer alarms show ChemAI's "C" in the status bar (scripts/brand_icons.py).
      smallIcon: "ic_notification",
      iconColor: "#000000",
    },
    SystemBars: {
      insetsHandling: "css",
      // The app sets viewport-fit=cover (src/app/layout.tsx).
      initialViewportFitValueHint: "cover",
      // Dark status bar icons on the app's light background.
      style: "LIGHT",
    },
  },
};

export default config;
