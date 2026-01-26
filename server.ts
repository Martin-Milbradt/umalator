import {
    existsSync,
    readdirSync,
    readFileSync,
    type watch,
    writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { RawCourseData, SkillMeta } from './types'
import type { SkillDataEntry } from './utils'
import { buildSkillNameLookup, normalizeConfigSkillNames } from './utils'
import {
    SimulationRunner,
    type SimulationRunnerConfig,
} from './simulation-runner'

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
let cachedSkillData: Record<string, SkillDataEntry> | null = null
let cachedTracknames: Record<string, string[]> | null = null

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
        cachedSkillData = JSON.parse(
            readFileSync(join(umaToolsDir, 'skill_data.json'), 'utf-8'),
        )
        cachedTracknames = JSON.parse(
            readFileSync(join(umaToolsDir, 'tracknames.json'), 'utf-8'),
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
                .filter((name) => name.endsWith('.json'))
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

app.get('/api/skilldata', (_req, res) => {
    if (!cachedSkillData) {
        res.status(500).json({ error: 'Skill data not loaded' })
        return
    }
    res.json(cachedSkillData)
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

app.get('/api/simulate', async (req, res) => {
    const configFile = req.query.configFile as string | undefined
    const skillsParam = req.query.skills as string | undefined

    if (!configFile) {
        res.status(400).json({ error: 'configFile parameter required' })
        return
    }

    // Parse optional skills filter (comma-separated skill names)
    const skillFilter = skillsParam
        ? skillsParam
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : undefined

    // Check required static data is loaded
    if (
        !cachedSkillmeta ||
        !cachedSkillnames ||
        !cachedSkillData ||
        !cachedCourseData ||
        !cachedTracknames
    ) {
        res.status(500).json({ error: 'Static data not loaded' })
        return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    let requestClosed = false

    const keepAlive = setInterval(() => {
        if (!requestClosed) {
            try {
                res.write(`: keepalive\n\n`)
            } catch {
                requestClosed = true
                clearInterval(keepAlive)
            }
        } else {
            clearInterval(keepAlive)
        }
    }, 30000)

    req.on('close', () => {
        requestClosed = true
        clearInterval(keepAlive)
    })

    req.on('aborted', () => {
        requestClosed = true
        clearInterval(keepAlive)
    })

    try {
        // Load config file
        const configPath = join(configDir, configFile)
        if (!existsSync(configPath)) {
            res.write(
                `data: ${JSON.stringify({ type: 'error', error: `Config file not found: ${configFile}` })}\n\n`,
            )
            res.end()
            return
        }

        const configContent = readFileSync(configPath, 'utf-8')
        const config = JSON.parse(configContent) as SimulationRunnerConfig

        res.write(`data: ${JSON.stringify({ type: 'started' })}\n\n`)
        if (res.flushHeaders) {
            res.flushHeaders()
        }

        const workerPath = new URL('./simulation.worker.js', import.meta.url)
        const runner = new SimulationRunner(
            config,
            {
                skillMeta: cachedSkillmeta,
                skillNames: cachedSkillnames,
                skillData: cachedSkillData,
                courseData: cachedCourseData,
                trackNames: cachedTracknames,
            },
            workerPath,
        )

        await runner.run((progress) => {
            if (requestClosed) return
            try {
                res.write(`data: ${JSON.stringify(progress)}\n\n`)
            } catch {
                requestClosed = true
            }
        }, skillFilter)

        if (!requestClosed) {
            res.end()
        }
    } catch (error) {
        const err = error as Error
        console.error('Simulation error:', err)
        if (!requestClosed) {
            try {
                res.write(
                    `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`,
                )
                res.end()
            } catch {
                // Ignore write errors
            }
        }
    } finally {
        clearInterval(keepAlive)
    }
})

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
})
