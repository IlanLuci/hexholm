import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    proxy: {
      // During `vite` dev, forward the game socket to `wrangler dev` on :8787.
      "/api": { target: "http://localhost:8787", changeOrigin: true, ws: true },
    },
  },
});
