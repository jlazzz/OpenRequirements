import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      ["/api", "/help"].map((path) => [path, `http://localhost:${process.env.API_PORT ?? 3000}`]),
    ),
  },
});
