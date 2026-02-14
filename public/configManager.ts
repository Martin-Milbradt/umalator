import * as configStore from './configStore'
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
                : files[0]
        await loadConfig(configToLoad)
    }
}

export async function loadConfig(filename: string): Promise<void> {
    const config = await configStore.loadConfig(filename)
    setCurrentConfig(config)
    setCurrentConfigFile(filename)
    const select = document.getElementById('config-select') as HTMLSelectElement
    if (select) {
        select.value = filename
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
