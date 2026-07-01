import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "API_KEY");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: ["localhost", "nginx", ".localhost"],
      proxy: {
        "/api": {
          target: "http://backend:8000",
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              const apiKey = env.API_KEY || process.env.API_KEY;
              if (apiKey) {
                proxyReq.setHeader("X-API-Key", apiKey);
              }
            });
          },
        },
        "/ws": {
          target: "ws://backend:8000",
          ws: true,
        },
      },
    },
  };
});
