import path from "node:path";
import type { NextConfig } from "next";

// Chem AI Android app build. `next build` exports the app as static files
// (out/), which Capacitor bundles into the app and serves from https://localhost.
// The website's server-only parts (API routes, proxy, auth callback) are not in
// this project: the app reaches the live API through its native bridge
// (src/mobile/bridges.ts), and the website's security headers do not apply to
// files served from inside the app.
const nextConfig: NextConfig = {
  output: "export",
  // Every route becomes <route>/index.html, which the app's route resolver
  // (android/.../AppRoutes.java) maps request paths onto.
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
