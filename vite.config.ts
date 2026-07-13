import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon-180x180.png",
        "og-image.svg",
        "robots.txt",
      ],
      manifest: {
        name: "Hexholm",
        short_name: "Hexholm",
        description: "Build, trade, and outwit the island — a Catan-style strategy game. Play online or offline vs bots.",
        theme_color: "#20323C",
        background_color: "#1A2A32",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//], // never serve the SPA shell for API/WS paths
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts-stylesheets", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts-webfonts", cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      devOptions: { enabled: false }, // no service worker during `vite`/`wrangler dev`
    }),
  ],
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true, ws: true },
    },
  },
});
