import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH || "./",
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
} as Parameters<typeof defineConfig>[0]);
