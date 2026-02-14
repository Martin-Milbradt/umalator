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

export function importConfig(file: File): Promise<{ name: string; config: Config }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result as string) as unknown
                if (
                    typeof data !== 'object' ||
                    data === null ||
                    !('skills' in data) ||
                    typeof (data as Config).skills !== 'object'
                ) {
                    throw new Error('Invalid config: must have a "skills" object')
                }
                const config = data as Config
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
