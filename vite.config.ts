import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    root: "public",
    resolve: {
        alias: {
            "/app.js": resolve(__dirname, "public/app.ts"),
        },
    },
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: ".",
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
            output: {
                entryFileNames: "app.js",
                chunkFileNames: "[name].js",
                assetFileNames: "[name][extname]",
            },
        },
    },
});
