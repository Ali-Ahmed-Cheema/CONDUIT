import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { staticSecurityHeaders } from "./frontend/conduit/server/securityHeaders";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "CONDUIT V3.0",
        short_name: "Conduit",
        start_url: ".",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#000000",
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    host: process.env.CONDUIT_EXPOSE === "1" ? "0.0.0.0" : "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: staticSecurityHeaders,
  },
});
