/**
 * IndexedDB-backed config storage for static hosting.
 * Replaces server-side filesystem config management.
 */
import type { Config } from './types'

const DB_NAME = 'umalator'
const DB_VERSION = 1
const STORE_NAME = 'configs'

let cachedDb: IDBDatabase | null = null

function openDb(): Promise<IDBDatabase> {
    if (cachedDb) return Promise.resolve(cachedDb)
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME)
            }
        }
        request.onsuccess = () => {
            cachedDb = request.result
            cachedDb.onversionchange = () => {
                cachedDb?.close()
                cachedDb = null
            }
            resolve(cachedDb)
        }
        request.onerror = () => reject(request.error)
    })
}

export async function listConfigs(): Promise<string[]> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.getAllKeys()
        request.onsuccess = () =>
            resolve((request.result as string[]).sort())
        request.onerror = () => reject(request.error)
    })
}

export async function listAllConfigs(): Promise<
    Array<{ name: string; config: Config }>
> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.openCursor()
        const results: Array<{ name: string; config: Config }> = []
        request.onsuccess = () => {
            const cursor = request.result
            if (cursor) {
                results.push({
                    name: cursor.key as string,
                    config: cursor.value as Config,
                })
                cursor.continue()
            } else {
                results.sort((a, b) => a.name.localeCompare(b.name))
                resolve(results)
            }
        }
        request.onerror = () => reject(request.error)
    })
}

export async function loadConfig(name: string): Promise<Config> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get(name)
        request.onsuccess = () => {
            if (request.result === undefined) {
                reject(new Error(`Config "${name}" not found`))
            } else {
                resolve(request.result as Config)
            }
        }
        request.onerror = () => reject(request.error)
    })
}

export async function saveConfig(name: string, config: Config): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.put(config, name)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
    })
}

export async function deleteConfig(name: string): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.delete(name)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
    })
}

export async function duplicateConfig(
    from: string,
    to: string,
): Promise<void> {
    const config = await loadConfig(from)
    await saveConfig(to, config)
}

export function exportConfig(name: string, config: Config): void {
    const blob = new Blob([JSON.stringify(config, null, 4)], {
        type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

export async function exportAllConfigs(): Promise<number> {
    const all = await listAllConfigs()
    for (let i = 0; i < all.length; i++) {
        const entry = all[i]!
        exportConfig(entry.name, entry.config)
        // Small stagger so browsers don't drop simultaneous downloads.
        if (i < all.length - 1) {
            await new Promise((r) => setTimeout(r, 120))
        }
    }
    return all.length
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalNumberOrNull(value: unknown): boolean {
    return value === undefined || value === null || typeof value === 'number'
}

const UMA_NUMERIC_FIELDS = [
    'guts',
    'mood',
    'power',
    'skillPoints',
    'speed',
    'stamina',
    'wisdom',
] as const

export function validateConfigData(data: unknown): Config {
    if (!isPlainObject(data) || !('skills' in data)) {
        throw new Error('Invalid config: must have a "skills" object')
    }
    const skills = data.skills
    if (!isPlainObject(skills)) {
        throw new Error('Invalid config: must have a "skills" object')
    }
    for (const [name, entry] of Object.entries(skills)) {
        if (!isPlainObject(entry)) {
            throw new Error(
                `Invalid config: skills[${JSON.stringify(name)}] must be an object`,
            )
        }
        if (!isOptionalNumberOrNull(entry.discount)) {
            throw new Error(
                `Invalid config: skills[${JSON.stringify(name)}].discount must be a number or null`,
            )
        }
        if (!isOptionalNumberOrNull(entry.default)) {
            throw new Error(
                `Invalid config: skills[${JSON.stringify(name)}].default must be a number or null`,
            )
        }
    }
    if ('uma' in data && data.uma !== undefined) {
        if (!isPlainObject(data.uma)) {
            throw new Error('Invalid config: "uma" must be an object')
        }
        for (const field of UMA_NUMERIC_FIELDS) {
            if (!isOptionalNumberOrNull(data.uma[field])) {
                throw new Error(
                    `Invalid config: uma.${field} must be a number or null`,
                )
            }
        }
        const umaSkills = data.uma.skills
        if (umaSkills !== undefined) {
            if (
                !Array.isArray(umaSkills) ||
                umaSkills.some((s) => typeof s !== 'string')
            ) {
                throw new Error(
                    'Invalid config: uma.skills must be an array of strings',
                )
            }
        }
    }
    if ('track' in data && data.track !== undefined) {
        if (!isPlainObject(data.track)) {
            throw new Error('Invalid config: "track" must be an object')
        }
        const distance = data.track.distance
        if (
            distance !== undefined &&
            distance !== null &&
            typeof distance !== 'number' &&
            typeof distance !== 'string'
        ) {
            throw new Error(
                'Invalid config: track.distance must be a number, string, or null',
            )
        }
    }
    return data as unknown as Config
}

export function importConfig(file: File): Promise<{ name: string; config: Config }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result as string) as unknown
                const config = validateConfigData(data)
                const name = file.name.endsWith('.json')
                    ? file.name
                    : `${file.name}.json`
                await saveConfig(name, config)
                resolve({ name, config })
            } catch (error) {
                reject(error)
            }
        }
        reader.onerror = () => reject(reader.error)
        reader.readAsText(file)
    })
}

/** Seed the default example config if the store is empty. */
export async function seedDefaultConfig(): Promise<void> {
    const existing = await listConfigs()
    if (existing.length > 0) return

    try {
        const base = import.meta.env.BASE_URL ?? '/'
        const response = await fetch(`${base}data/config.example.json`)
        if (!response.ok) return
        const config = (await response.json()) as Config
        await saveConfig('config.example.json', config)
    } catch {
        // Ignore fetch errors -- the example may not be available
    }
}
