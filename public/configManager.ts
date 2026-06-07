import * as configStore from './configStore'
import { LAST_USED_CONFIG_KEY } from './constants'
import { writeConfigToFilesystem } from './devConfigSync'
import { callRenderSkills, callRenderUma } from './renderCallbacks'
import { renderTrack, waitForCourseData } from './trackUI'
import {
    clearSaveTimeout,
    getCurrentConfig,
    getCurrentConfigFile,
    getPendingSavePromise,
    setCurrentConfig,
    setCurrentConfigFile,
    setPendingSavePromise,
    setSaveTimeout,
} from './state'
import { showToast } from './toast'
import type { Config } from './types'

export async function loadConfigFiles(): Promise<void> {
    const files = await configStore.listConfigs()
    const select = document.getElementById('config-select') as HTMLSelectElement
    if (!select) return
    select.innerHTML = ''
    files.forEach((file) => {
        const option = document.createElement('option')
        option.value = file
        option.textContent = file
        select.appendChild(option)
    })
    await waitForCourseData()
    if (files.length > 0) {
        let lastUsedConfig: string | null = null
        try {
            lastUsedConfig = localStorage.getItem(LAST_USED_CONFIG_KEY)
        } catch (e: unknown) {
            console.warn('Failed to read from localStorage:', e)
        }
        const configToLoad =
            lastUsedConfig && files.includes(lastUsedConfig)
                ? lastUsedConfig
                : files[0]!
        await loadConfig(configToLoad)
    }
}

export async function loadConfig(filename: string): Promise<void> {
    let config: Config
    try {
        config = await configStore.loadConfig(filename)
    } catch (error) {
        // Surface a corrupt/invalid stored config instead of letting it crash
        // the next render; leave the previously loaded config in place.
        showToast({
            type: 'error',
            message: `Could not load "${filename}": ${(error as Error).message}`,
        })
        return
    }
    setCurrentConfig(config)
    setCurrentConfigFile(filename)
    const select = document.getElementById('config-select') as HTMLSelectElement
    if (select) {
        select.value = filename
    }
    const seedInput = document.getElementById(
        'seed-input',
    ) as HTMLInputElement | null
    if (seedInput) {
        seedInput.value = config.seed != null ? String(config.seed) : ''
    }

    try {
        localStorage.setItem(LAST_USED_CONFIG_KEY, filename)
    } catch (e: unknown) {
        console.warn('Failed to save to localStorage:', e)
    }

    callRenderSkills()
    renderTrack()
    callRenderUma()
}

export async function saveConfig(): Promise<void> {
    const currentConfigFile = getCurrentConfigFile()
    const currentConfig = getCurrentConfig()
    if (!currentConfigFile || !currentConfig) return

    try {
        await configStore.saveConfig(currentConfigFile, currentConfig)
        writeConfigToFilesystem(currentConfigFile, currentConfig)
    } catch (error) {
        const err = error as Error
        // A full quota is the common, actionable failure; name it specifically
        // so the user knows what to do rather than seeing a generic message.
        const message =
            err.name === 'QuotaExceededError'
                ? 'Could not save: browser storage is full. Delete old configs or free up space.'
                : `Could not save config: ${err.message}`
        console.error('saveConfig failed:', err)
        showToast({ type: 'error', message })
    }
}

export function autoSave(): void {
    clearSaveTimeout()
    setSaveTimeout(
        setTimeout(() => {
            setPendingSavePromise(saveConfig())
        }, 500),
    )
}

export async function ensureSaved(): Promise<void> {
    clearSaveTimeout()
    const pendingSavePromise = getPendingSavePromise()
    if (pendingSavePromise) {
        await pendingSavePromise
    }
    await saveConfig()
}
