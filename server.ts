import express from 'express'
import {
    readFileSync,
    writeFileSync,
    readdirSync,
    type watch,
    existsSync,
} from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
    buildSkillNameLookup,
    normalizeConfigSkillNames,
} from './utils'
import type { SkillMeta, RawCourseData } from './types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = 3000

app.use(express.json())
app.use(express.static(join(__dirname, 'dist')))

const configDir = join(__dirname, 'configs')

const configWatchers = new Map<string, ReturnType<typeof watch>>()
const fileChangeListeners: Set<express.Response> = new Set()

// Cached data for static JSON files (loaded once at startup)
const umaToolsDir = resolve(__dirname, '..', 'uma-tools', 'umalator-global')
let cachedSkillnames: Record<string, string[]> | null = null
let cachedSkillmeta: Record<string, SkillMeta> | null = null
let cachedCourseData: Record<string, RawCourseData> | null = null

// Case-insensitive skill name lookup map (built once after skillnames loads)
let skillNameLookup: Map<string, string> | null = null

function loadStaticData(): void {
    try {
        cachedSkillnames = JSON.parse(
            readFileSync(join(umaToolsDir, 'skillnames.json'), 'utf-8'),
        )
        cachedSkillmeta = JSON.parse(
            readFileSync(join(umaToolsDir, 'skill_meta.json'), 'utf-8'),
        )
        cachedCourseData = JSON.parse(
            readFileSync(join(umaToolsDir, 'course_data.json'), 'utf-8'),
        )
        skillNameLookup = buildSkillNameLookup(cachedSkillnames)
    } catch (error) {
        const err = error as Error
        throw new Error(
            `Failed to load static data from ${umaToolsDir}: ${err.message}`,
        )
    }
}
loadStaticData()

interface ConfigFile {
    name: string
    path: string
}

function getConfigFiles(): ConfigFile[] {
    const files = readdirSync(configDir)
    return files.map((file) => ({
        name: file,
        path: join(configDir, file),
    }))
}

app.get('/api/configs', (_req, res) => {
    try {
        const configs = getConfigFiles()
        res.json(
            configs
                .map((c) => c.name)
                .filter((name) => name !== 'config.example.json'),
        )
    } catch (error) {
        const err = error as Error
        res.status(500).json({ error: err.message })
    }
})

app.get('/api/skillnames', (_req, res) => {
    if (!cachedSkillnames) {
        res.status(500).json({ error: 'Skillnames data not loaded' })
        return
    }
    res.json(cachedSkillnames)
})

app.get('/api/skillmeta', (_req, res) => {
    if (!cachedSkillmeta) {
        res.status(500).json({ error: 'Skillmeta data not loaded' })
        return
    }
    res.json(cachedSkillmeta)
})

app.get('/api/coursedata', (_req, res) => {
    if (!cachedCourseData) {
        res.status(500).json({ error: 'Course data not loaded' })
        return
    }
    res.json(cachedCourseData)
})

app.get('/api/config/:filename', (req, res) => {
    try {
        const filename = req.params.filename
        const filePath = join(configDir, filename)
        const content = readFileSync(filePath, 'utf-8')
        const config = JSON.parse(content)
        res.json(config)
    } catch (error) {
        const err = error as Error
        res.status(500).json({ error: err.message })
    }
})

app.post('/api/config/:filename', (req, res) => {
    try {
        const filename = req.params.filename
        const filePath = join(configDir, filename)
        const normalizedConfig = normalizeConfigSkillNames(
            req.body,
            skillNameLookup || new Map(),
        )
        writeFileSync(
            filePath,
            JSON.stringify(normalizedConfig, null, 4),
            'utf-8',
        )
        notifyFileChange(filename)
        res.json({ success: true })
    } catch (error) {
        const err = error as Error
        res.status(500).json({ error: err.message })
    }
})

app.post('/api/config/:filename/duplicate', (req, res) => {
    try {
        const filename = req.params.filename
        const { newName } = req.body as { newName?: string }

        if (!newName || typeof newName !== 'string' || !newName.trim()) {
            res.status(400).json({
                error: 'newName is required and must be a non-empty string',
            })
            return
        }

        const sourcePath = join(configDir, filename)
        const targetPath = join(configDir, newName.trim())

        if (!existsSync(sourcePath)) {
            res.status(404).json({
                error: `Source config file "${filename}" not found`,
            })
            return
        }

        if (existsSync(targetPath)) {
            res.status(409).json({
                error: `Config file "${newName.trim()}" already exists`,
            })
            return
        }

        const content = readFileSync(sourcePath, 'utf-8')
        writeFileSync(targetPath, content, 'utf-8')
        notifyFileChange(newName.trim())
        res.json({ success: true })
    } catch (error) {
        const err = error as Error
        res.status(500).json({ error: err.message })
    }
})

function notifyFileChange(filename: string): void {
    for (const listener of fileChangeListeners) {
        try {
            listener.write(
                `data: ${JSON.stringify({ type: 'fileChanged', filename })}\n\n`,
            )
        } catch (error) {
            console.error('Error notifying file change:', error)
            // Remove failed listener
            fileChangeListeners.delete(listener)
        }
    }
}

// Cleanup watchers on process exit
process.on('exit', () => {
    for (const watcher of configWatchers.values()) {
        try {
            watcher.close()
        } catch {
            // Ignore close errors
        }
    }
    configWatchers.clear()
})

app.get('/api/run', (req, res) => {
    const configFile = req.query.configFile as string | undefined

    if (!configFile) {
        res.status(400).json({ error: 'configFile parameter required' })
        return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const cliPath = resolve(__dirname, 'cli.js')

    if (!existsSync(cliPath)) {
        res.write(
            `data: ${JSON.stringify({ type: 'error', error: "CLI not built. Please run 'npm run build' first." })}\n\n`,
        )
        res.end()
        return
    }

    res.write(`data: ${JSON.stringify({ type: 'started' })}\n\n`)
    if (res.flushHeaders) {
        res.flushHeaders()
    }

    let requestClosed = false

    const keepAlive = setInterval(() => {
        if (!requestClosed) {
            try {
                res.write(`: keepalive\n\n`)
            } catch (error) {
                console.error('Error sending keepalive:', error)
                requestClosed = true
                clearInterval(keepAlive)
            }
        } else {
            clearInterval(keepAlive)
        }
    }, 30000)

    let child: ChildProcess | null = null
    let processStarted = false

    try {
        child = spawn('node', [cliPath, configFile], {
            cwd: __dirname,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV || 'production',
            },
        })
        processStarted = true
        console.log(`Process spawned with PID: ${child.pid}`)
    } catch (error) {
        const err = error as Error
        console.error('Error spawning process:', error)
        res.write(
            `data: ${JSON.stringify({ type: 'error', error: `Failed to spawn process: ${err.message}` })}\n\n`,
        )
        res.end()
        return
    }

    let output = ''
    let hasOutput = false
    let stderrOutput = ''

    const sendData = (data: Buffer): void => {
        if (requestClosed) {
            console.log('Skipping output write - request already closed')
            return
        }
        const dataStr = data.toString()
        output += dataStr
        hasOutput = true
        try {
            res.write(
                `data: ${JSON.stringify({ type: 'output', data: dataStr })}\n\n`,
            )
        } catch (error) {
            console.error('Error writing to response:', error)
            requestClosed = true
        }
    }

    const sendStderr = (data: Buffer): void => {
        const dataStr = data.toString()
        stderrOutput += dataStr
        console.error(`CLI stderr:`, dataStr)
        sendData(data)
    }

    if (child.stdout) {
        child.stdout.on('data', sendData)
    }
    if (child.stderr) {
        child.stderr.on('data', sendStderr)
    }

    if (child.stdout) {
        child.stdout.on('error', (error) => {
            console.error('stdout error:', error)
        })
    }

    if (child.stderr) {
        child.stderr.on('error', (error) => {
            console.error('stderr error:', error)
        })
    }

    child.on('close', (code, signal) => {
        clearTimeout(timeout)
        clearInterval(keepAlive)

        if (stderrOutput) {
            console.error('Stderr content:', stderrOutput)
        }

        if (requestClosed) {
            console.log('Response already closed, skipping final write')
            return
        }

        try {
            if (!hasOutput && !output && !stderrOutput) {
                res.write(
                    `data: ${JSON.stringify({
                        type: 'error',
                        error: `Process exited without producing output. Exit code: ${code}, Signal: ${signal}. Make sure cli.js is built and dependencies are available.`,
                    })}\n\n`,
                )
            } else if (code !== null) {
                res.write(
                    `data: ${JSON.stringify({ type: 'done', code, output })}\n\n`,
                )
            } else if (signal) {
                res.write(
                    `data: ${JSON.stringify({ type: 'done', code: null, signal, output })}\n\n`,
                )
            } else {
                res.write(
                    `data: ${JSON.stringify({ type: 'done', code: null, output })}\n\n`,
                )
            }
            res.end()
        } catch (error) {
            console.error('Error writing final response:', error)
        }
    })

    child.on('error', (error) => {
        const errorMsg = `Failed to start process: ${error.message}`
        console.error('CLI spawn error:', error)
        res.write(
            `data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`,
        )
        res.end()
    })

    const timeout = setTimeout(
        () => {
            if (child && !child.killed) {
                console.log('Process timeout, killing child process')
                child.kill('SIGTERM')
                res.write(
                    `data: ${JSON.stringify({
                        type: 'error',
                        error: 'Process timed out after 5 minutes',
                    })}\n\n`,
                )
                res.end()
            }
        },
        5 * 60 * 1000,
    )

    req.on('close', () => {
        requestClosed = true
        clearInterval(keepAlive)
        clearTimeout(timeout)
        if (child && !child.killed && processStarted) {
            child.kill('SIGTERM')
        }
    })

    req.on('aborted', () => {
        console.log('Request aborted by client')
        requestClosed = true
        clearInterval(keepAlive)
        clearTimeout(timeout)
        if (child && !child.killed && processStarted) {
            console.log('Killing child process due to request abort')
            child.kill('SIGTERM')
        }
    })
})

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
})
