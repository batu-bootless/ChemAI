// Starts the dev server so a phone on the same Wi-Fi can open the app in its browser, with live
// reload - no APK needed while working on the interface.
//
//   npm run dev:mobile    -> prints http://<this computer's Wi-Fi address>:3001/dashboard/
//
// Next.js blocks its dev resources for pages opened from any host but localhost, so the addresses
// found here are passed to next.config.ts (CHEMAI_DEV_ORIGINS -> allowedDevOrigins). The phone's
// browser has no native bridge: Iris's AI answers and Google sign-in only work in the app, and so
// does voice input (browsers allow the microphone only over https or on localhost).

import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT) || 3001;
const ROOT = path.resolve(import.meta.dirname, "..");
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

function isPrivate(address) {
  const [a, b] = address.split(".").map(Number);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

// Wi-Fi and Ethernet adapters first; virtual ones (Hyper-V, WSL, VirtualBox, VMware, Docker) last,
// since a phone cannot reach those.
function rank(name) {
  if (/vethernet|virtual|vmware|vbox|wsl|docker|hyper-v|loopback/i.test(name)) return 2;
  if (/wi-?fi|wlan|wireless|kablosuz|ethernet|^en\d|^eth\d|^wl/i.test(name)) return 0;
  return 1;
}

function lanAddresses() {
  const found = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && isPrivate(entry.address)) {
        found.push({ name, address: entry.address });
      }
    }
  }
  return found.sort((x, y) => rank(x.name) - rank(y.name));
}

const addresses = lanAddresses();

function printBanner() {
  const line = "=".repeat(60);
  console.log(`\n${line}`);
  if (addresses.length === 0) {
    console.log(" Wi-Fi adresi bulunamadı. Bilgisayar bir ağa bağlı mı?");
  } else {
    console.log(" Telefonun tarayıcısında açın (aynı Wi-Fi'de olmalı):\n");
    console.log(`   http://${addresses[0].address}:${PORT}/dashboard/\n`);
    // Virtual adapters stay allowed but are not offered: a phone cannot reach them.
    for (const other of addresses.slice(1).filter((a) => rank(a.name) < 2)) {
      console.log(`   açılmazsa: http://${other.address}:${PORT}/dashboard/  (${other.name})`);
    }
    console.log(" Windows Güvenlik Duvarı sorarsa 'Özel ağlar' için izin verin.");
  }
  console.log(`${line}\n`);
}

const child = spawn(process.execPath, [NEXT_BIN, "dev", "-H", "0.0.0.0", "-p", String(PORT)], {
  cwd: ROOT,
  stdio: ["inherit", "pipe", "inherit"],
  env: { ...process.env, FORCE_COLOR: "1", CHEMAI_DEV_ORIGINS: addresses.map((a) => a.address).join(",") },
});

// Show the phone address once the server is ready, so it is not lost above Next.js's own output.
let shown = false;
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (!shown && /Ready/i.test(chunk.toString())) {
    shown = true;
    printBanner();
  }
});

child.on("exit", (code) => process.exit(code ?? 0));
