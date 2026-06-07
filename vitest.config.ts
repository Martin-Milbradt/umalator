import { defineConfig } from 'vitest/config'

export default defineConfig({
    define: {
        CC_GLOBAL: 'true',
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            exclude: ['**/node_modules/**', '**/uma-tools/**'],
        },
    },
})
