// scripts/gen-icons.mjs
// Rasterize the hex logo (public/favicon.svg) into the PWA icon set.
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url));
const bg = { r: 0x1a, g: 0x2a, b: 0x32, alpha: 1 }; // #1A2A32 to match background_color

const targets = [
  { file: "pwa-192x192.png", size: 192, pad: 24 },
  { file: "pwa-512x512.png", size: 512, pad: 64 },
  { file: "maskable-icon-512x512.png", size: 512, pad: 110 }, // extra safe-zone padding
  { file: "apple-touch-icon-180x180.png", size: 180, pad: 22 },
];

for (const { file, size, pad } of targets) {
  const inner = size - pad * 2;
  const logo = await sharp(svg, { density: 384 }).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(new URL(`../public/${file}`, import.meta.url).pathname);
  console.log("wrote public/" + file);
}
