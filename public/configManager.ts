import { LAST_USED_CONFIG_KEY } from './constants'
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
    const response = await fetch('/api/configs')
    const files = (await response.json()) as string[]
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
        // Check if there's a saved config in localStorage
        let lastUsedConfig: string | null = null
        try {
            lastUsedConfig = localStorage.getItem(LAST_USED_CONFIG_KEY)
        } catch (e: unknown) {
            // localStorage might be unavailable (private browsing, disabled, etc.)
            console.warn('Failed to read from localStorage:', e)
        }
        // If the saved config exists in the list, load it; otherwise load the first one
        const configToLoad =
            lastUsedConfig && files.includes(lastUsedConfig)
                ? lastUsedConfig
                : files[0]
        await loadConfig(configToLoad)
    }
}

export async function loadConfig(filename: string): Promise<void> {
    const response = await fetch(`/api/config/${filename}`)
    const config = (await response.json()) as Config
    setCurrentConfig(config)
    setCurrentConfigFile(filename)
    const select = document.getElementById('config-select') as HTMLSelectElement
    if (select) {
        select.value = filename
    }

    // Save the last used config to localStorage
    try {
        localStorage.setItem(LAST_USED_CONFIG_KEY, filename)
    } catch (e: unknown) {
        // localStorage might be unavailable (private browsing, quota exceeded, etc.)
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
        await fetch(`/api/config/${currentConfigFile}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentConfig),
        })
    } catch {
        showToast({ type: 'error', message: 'Failed to save config' })
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
