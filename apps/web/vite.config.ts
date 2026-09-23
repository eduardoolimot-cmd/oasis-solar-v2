import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Versão exibida no rodapé: vem do package.json da raiz (fonte única — para lançar uma nova versão,
// basta alterar o campo "version" lá).
const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8")) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3333",
    },
  },
});
