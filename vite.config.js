import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "client",
  // Built files are served from /client/ (public/client).
  base: "/client/",
  build: {
    outDir: "../public/client",
    emptyOutDir: true,
    // Content-hashed filenames, mapped back to entries by manifest.json for
    // app/helpers/vite_helper.rb.
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "client/src/main.jsx"),
      },
      output: {
        entryFileNames: "[name]-[hash].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
  plugins: [react()],
});
