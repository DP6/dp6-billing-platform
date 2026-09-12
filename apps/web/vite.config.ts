import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // dev: encaminha /api para o apps/api local (modo mock ou BigQuery)
      "/api": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
});
