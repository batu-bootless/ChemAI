import type { Metadata, Viewport } from "next";
import { Google_Sans, Inter, Playfair_Display, Poppins } from "next/font/google";
import { AuthProvider } from "@/lib/AuthContext";
import AppShell from "@/mobile/AppShell";
import AppPreferences from "@/mobile/AppPreferences";
import { PREFERENCES_BOOT_SCRIPT } from "@/mobile/preferencesBoot";
import "./globals.css";
import "./app-dark.css";
import "./app-paper.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// ChemAI: Iris's screens use Google Sans, the Gemini app's typeface (latin-ext for Turkish).
const googleSans = Google_Sans({
  variable: "--font-gsans",
  subsets: ["latin", "latin-ext"],
  // Next has no metrics for Google Sans; without this it warns on every build.
  adjustFontFallback: false,
});

// ChemAI's wordmark: a heavy geometric sans, the shape of the "C" in the logo.
const brand = Poppins({
  variable: "--font-brand",
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ChemAI",
  description: "İris, yapay zekâ kimya asistanın: kesin hesaplar, molekül yapıları, fotoğraftan soru ve sesli sohbet.",
  icons: {
    icon: "/seo/favicon.png",
    apple: "/seo/apple-touch-icon.png",
  },
};

// ChemAI: draw under the status and gesture bars; pages pad themselves with the safe-area
// insets (src/app/globals.css).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // ChemAI: the boot script sets the theme class and lang before React hydrates.
    <html
      lang="tr"
      className={`${inter.variable} ${googleSans.variable} ${brand.variable} ${playfairDisplay.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* ChemAI: native bridges (API, downloads, printing, back button). */}
        <AppShell />
        <AuthProvider>
          {/* ChemAI: theme and language (light/dark/system, Türkçe/English). */}
          <AppPreferences>{children}</AppPreferences>
        </AuthProvider>
      </body>
    </html>
  );
}
