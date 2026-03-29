import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/** Dev-only Vite plugin that serves configs/ directory via /__dev/configs endpoints. */
export function configSyncPlugin(): Plugin {
    const configDir = join(import.meta.dirname, 'configs')

    return {
        name: 'config-sync',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (!req.url?.startsWith('/__dev/configs')) return next()

                if (req.method === 'GET' && req.url === '/__dev/configs') {
                    const files = readdirSync(configDir)
                        .filter((f) => f.endsWith('.json'))
                        .sort()
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify(files))
                    return
                }

                const match = req.url.match(/^\/__dev\/configs\/(.+)$/)
                if (!match) return next()
                const filename = decodeURIComponent(match[1])

                if (filename.includes('..') || filename.includes('/')) {
                    res.statusCode = 400
                    res.end(JSON.stringify({ error: 'Invalid filename' }))
                    return
                }

                if (req.method === 'GET') {
                    const content = readFileSync(
                        join(configDir, filename),
                        'utf-8',
                    )
                    res.setHeader('Content-Type', 'application/json')
                    res.end(content)
                    return
                }

                if (req.method === 'PUT') {
                    let body = ''
                    req.on('data', (chunk: string) => {
                        body += chunk
                    })
                    req.on('end', () => {
                        writeFileSync(join(configDir, filename), body, 'utf-8')
                        res.setHeader('Content-Type', 'application/json')
                        res.end(JSON.stringify({ ok: true }))
                    })
                    return
                }

                next()
            })
        },
    }
}
