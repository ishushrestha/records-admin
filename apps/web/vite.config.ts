import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("../..", import.meta.url)), "");
  const host = env.HOST?.trim() ? env.HOST.trim() : "127.0.0.1";
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@records/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
      },
    },
    server: {
      host,
      port: 5174,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3002",
          changeOrigin: true,
        },
      },
    },
    preview: {
      host,
      port: 5174,
      strictPort: true,
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      include: ["src/**/*.test.tsx"],
    },
  };
});
