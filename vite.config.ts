import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    root: resolve(__dirname, 'public'),
    publicDir: false,
    plugins: [tailwindcss()],
    resolve: {
        alias: {
            '/app.js': resolve(__dirname, 'public/app.ts'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: resolve(__dirname, 'dist'),
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
            input: resolve(__dirname, 'public/index.html'),
            output: {
                entryFileNames: 'app.js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name][extname]',
            },
        },
    },
})
