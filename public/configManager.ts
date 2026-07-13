import * as configStore from './configStore'
import { LAST_USED_CONFIG_KEY } from './constants'
import { writeConfigToFilesystem } from './devConfigSync'
import {
    callRenderResults,
    callRenderSkills,
    callRenderUma,
} from './renderCallbacks'
import { renderTrack, waitForCourseData } from './trackUI'
import {
    clearSaveTimeout,
    clearUmaUndoStack,
    getCalculatedResultsCache,
    getCurrentConfig,
    getCurrentConfigFile,
    getPendingSavePromise,
    getResultsMap,
    getSelectedSkills,
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
    // Undo history belongs to the config it was recorded against.
    clearUmaUndoStack()
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

    // Restore this config's last calculated results (persisted per config) so
    // they reappear instantly without recomputing. Clearing first scopes the
    // results to the config being loaded.
    const resultsMap = getResultsMap()
    const calculatedResultsCache = getCalculatedResultsCache()
    const selectedSkills = getSelectedSkills()
    resultsMap.clear()
    selectedSkills.clear()
    calculatedResultsCache.clear()
    try {
        for (const result of await configStore.loadResults(filename)) {
            calculatedResultsCache.set(result.skill, result)
            resultsMap.set(result.skill, { ...result, status: 'cached' })
        }
    } catch (e: unknown) {
        console.warn('Failed to restore results:', e)
    }

    callRenderSkills()
    // A freshly loaded config opens at the top of its skill list.
    document.getElementById('skills-container')?.scrollTo({ top: 0 })
    renderTrack()
    callRenderUma()
    callRenderResults()
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
