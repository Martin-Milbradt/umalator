import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { configSyncPlugin } from './vite-plugin-config-sync'

export default defineConfig({
    base: process.env.VITE_BASE ?? '/',
    root: resolve(__dirname, 'public'),
    publicDir: resolve(__dirname, 'static'),
    plugins: [tailwindcss(), configSyncPlugin()],
    resolve: {
        alias: {
            '/app.js': resolve(__dirname, 'public/app.ts'),
        },
    },
    server: {
        port: 5173,
    },
    build: {
        outDir: resolve(__dirname, 'dist'),
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'public/index.html'),
                help: resolve(__dirname, 'public/help.html'),
            },
            output: {
                entryFileNames: (chunk) =>
                    chunk.name === 'index' ? 'app.js' : '[name].js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name][extname]',
            },
        },
    },
})
