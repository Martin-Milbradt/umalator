import { saveConfig } from './configStore'
import type { Config } from './types'

/** Fetch all configs from the filesystem and save them to IndexedDB. */
export async function syncConfigsFromFilesystem(): Promise<void> {
    if (!import.meta.env.DEV) return

    const response = await fetch('/__dev/configs')
    if (!response.ok) return
    const filenames = (await response.json()) as string[]

    const results = await Promise.allSettled(
        filenames.map(async (name) => {
            const r = await fetch(
                `/__dev/configs/${encodeURIComponent(name)}`,
            )
            if (!r.ok) throw new Error(`Failed to fetch ${name}`)
            const config = (await r.json()) as Config
            await saveConfig(name, config)
        }),
    )

    const failed = results.filter((r) => r.status === 'rejected').length
    const synced = results.filter((r) => r.status === 'fulfilled').length
    if (failed > 0) {
        console.warn(`[dev] Synced ${synced} configs, ${failed} failed`)
    } else {
        console.log(`[dev] Synced ${synced} configs from filesystem`)
    }
}

/** Write a config back to the filesystem (dev only). */
export function writeConfigToFilesystem(
    name: string,
    config: Config,
): void {
    if (!import.meta.env.DEV) return

    fetch(`/__dev/configs/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config, null, 4),
    })
}

/** Delete a config from the filesystem (dev only). */
export function deleteConfigFromFilesystem(name: string): void {
    if (!import.meta.env.DEV) return

    fetch(`/__dev/configs/${encodeURIComponent(name)}`, { method: 'DELETE' })
}
