import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { staticSecurityHeaders } from "./server/securityHeaders";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2,webmanifest}"],
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: [],
      },
      manifest: {
        name: "CONDUIT V3.0",
        short_name: "Conduit",
        start_url: ".",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#000000",
        icons: [
          {
            src: "/icons/conduit-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/conduit-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/conduit-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
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
