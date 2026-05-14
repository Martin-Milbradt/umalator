import './input.css'

// Import API module to register runSelectiveCalculations with resultsUI
import './api'

import { runCalculations } from './api'
import {
    deleteConfig,
    duplicateConfig,
    exportAllConfigs,
    exportConfig,
    importConfig,
    seedDefaultConfig,
} from './configStore'
import {
    deleteConfigFromFilesystem,
    syncConfigsFromFilesystem,
} from './devConfigSync'
import { autoSave, loadConfig, loadConfigFiles } from './configManager'
import {
    renderResultsTable,
    setupResultsTableSorting,
    setupSelectAllCheckbox,
} from './resultsUI'
import {
    buildSkillNameLookup,
    buildVariantCache,
    getCanonicalSkillName,
} from './skillHelpers'
import {
    renderSkills,
    setupSkillFilters,
    setupSkillsContainerDelegation,
} from './skillsUI'
import {
    getCalculatedResultsCache,
    getCurrentConfig,
    getCurrentConfigFile,
    getResultsMap,
    getSelectedSkills,
    setCourseData,
    setSkillData,
    setSkillmeta,
    setSkillNameToId,
    setSkillnames,
    setTrackNames,
} from './state'
import { showToast } from './toast'
import { maybeAutoStartTour, startTour } from './tour'
import { renderTrack } from './trackUI'
import type { CourseData, SkillData, SkillMeta, SkillNames } from './types'
import { renderUma } from './umaUI'

const BASE_URL = import.meta.env.BASE_URL ?? '/'
const GITHUB_ISSUES_URL = 'https://github.com/Martin-Milbradt/umalator/issues/new'
const DISCORD_INVITE_URL = 'https://discord.gg/DvXMyg8J'

// Load skill names on init
;(async function loadSkillnamesOnInit() {
    const response = await fetch(`${BASE_URL}data/skillnames.json`)
    if (!response.ok) {
        throw new Error(
            `Failed to load skillnames: ${response.status} ${response.statusText}`,
        )
    }
    const skillnames = (await response.json()) as SkillNames
    if (!skillnames || typeof skillnames !== 'object') {
        throw new Error('Invalid skillnames data received')
    }
    setSkillnames(skillnames)
    setSkillNameToId(
        Object.fromEntries(
            Object.entries(skillnames).map(([id, names]) => [names[0], id]),
        ),
    )
    buildVariantCache()
    buildSkillNameLookup()
})().catch(() => {
    showToast({ type: 'error', message: 'Failed to load skill names' })
})

// Load skill metadata on init
;(async function loadSkillmetaOnInit() {
    const response = await fetch(`${BASE_URL}data/skill_meta.json`)
    if (!response.ok) {
        throw new Error(
            `Failed to load skillmeta: ${response.status} ${response.statusText}`,
        )
    }
    const skillmeta = (await response.json()) as SkillMeta
    if (!skillmeta || typeof skillmeta !== 'object') {
        throw new Error('Invalid skillmeta data received')
    }
    setSkillmeta(skillmeta)
})().catch(() => {
    showToast({ type: 'error', message: 'Failed to load skill metadata' })
})

// Load skill data on init
;(async function loadSkillDataOnInit() {
    const response = await fetch(`${BASE_URL}data/skill_data.json`)
    if (!response.ok) {
        throw new Error(
            `Failed to load skilldata: ${response.status} ${response.statusText}`,
        )
    }
    const skillData = (await response.json()) as SkillData
    if (!skillData || typeof skillData !== 'object') {
        throw new Error('Invalid skilldata received')
    }
    setSkillData(skillData)
})().catch(() => {
    showToast({ type: 'error', message: 'Failed to load skill data' })
})

// Load course data on init
;(async function loadCourseDataOnInit() {
    const response = await fetch(`${BASE_URL}data/course_data.json`)
    if (!response.ok) {
        throw new Error(
            `Failed to load course data: ${response.status} ${response.statusText}`,
        )
    }
    const courseData = (await response.json()) as CourseData
    if (!courseData || typeof courseData !== 'object') {
        throw new Error('Invalid course data received')
    }
    setCourseData(courseData)
    const currentConfig = getCurrentConfig()
    if (currentConfig) {
        renderTrack()
    }
})().catch(() => {
    showToast({ type: 'error', message: 'Failed to load course data' })
})

// Load track names on init
;(async function loadTrackNamesOnInit() {
    const response = await fetch(`${BASE_URL}data/tracknames.json`)
    if (!response.ok) {
        throw new Error(
            `Failed to load track names: ${response.status} ${response.statusText}`,
        )
    }
    const trackNames = (await response.json()) as Record<string, string[]>
    if (!trackNames || typeof trackNames !== 'object') {
        throw new Error('Invalid track names received')
    }
    setTrackNames(trackNames)
})().catch(() => {
    showToast({ type: 'error', message: 'Failed to load track names' })
})

function resetUmaSkills(): void {
    const currentConfig = getCurrentConfig()
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()
    const calculatedResultsCache = getCalculatedResultsCache()

    if (!currentConfig) return
    if (!currentConfig.uma) {
        currentConfig.uma = {}
    }
    currentConfig.uma.skills = []
    delete currentConfig.uma.skillPoints

    if (currentConfig.skills) {
        const skills = currentConfig.skills
        Object.keys(skills).forEach((skillName) => {
            const skill = skills[skillName]
            if (skill.default !== undefined && skill.default !== null) {
                skills[skillName].discount = skill.default
            } else {
                skills[skillName].discount = null
            }
        })
    }

    // Clear results and cache since all discounts changed
    resultsMap.clear()
    selectedSkills.clear()
    calculatedResultsCache.clear()
    renderResultsTable()

    renderUma()
    renderSkills()
    autoSave()
}

// Set up config select handler
const configSelect = document.getElementById(
    'config-select',
) as HTMLSelectElement
if (configSelect) {
    configSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement
        loadConfig(target.value)
    })
}

// Set up duplicate config button
const duplicateButton = document.getElementById('duplicate-config-button')
if (duplicateButton) {
    duplicateButton.addEventListener('click', async () => {
        const currentConfigFile = (
            document.getElementById('config-select') as HTMLSelectElement
        )?.value
        if (!currentConfigFile) {
            alert('No config file selected')
            return
        }

        const newName = prompt('Enter name for duplicated config file:')
        if (!newName || !newName.trim()) {
            return
        }

        let trimmedName = newName.trim()
        if (!trimmedName.toLowerCase().endsWith('.json')) {
            trimmedName += '.json'
        }

        try {
            await duplicateConfig(currentConfigFile, trimmedName)
            await loadConfigFiles()
            await loadConfig(trimmedName)
        } catch (error) {
            const err = error as Error
            alert(`Error: ${err.message}`)
        }
    })
}

// Set up run button
const runButton = document.getElementById('run-button')
if (runButton) {
    runButton.addEventListener('click', () => runCalculations())
}

// Set up reset button
const resetButton = document.getElementById('reset-button')
if (resetButton) {
    resetButton.addEventListener('click', resetUmaSkills)
}

// Set up add skill button
const addSkillButton = document.getElementById(
    'add-skill-button',
) as HTMLButtonElement | null

// Pressing "+" anywhere outside an input/select triggers the add-skill button.
// Matches the button's label so it's mnemonic. Inputs/selects keep "+" for
// typing.
document.addEventListener('keydown', (e) => {
    if (e.key !== '+' || e.ctrlKey || e.altKey || e.metaKey) return
    const active = document.activeElement as HTMLElement | null
    if (
        active &&
        (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.tagName === 'SELECT' ||
            active.isContentEditable)
    ) {
        return
    }
    e.preventDefault()
    addSkillButton?.click()
})

if (addSkillButton) {
    addSkillButton.addEventListener('click', () => {
        const currentConfig = getCurrentConfig()
        if (!currentConfig) return
        if (!currentConfig.skills) {
            currentConfig.skills = {}
        }
        const newSkillName = 'New Skill'
        let counter = 1
        let finalName = newSkillName
        while (currentConfig.skills[finalName]) {
            finalName = `${newSkillName} ${counter}`
            counter++
        }
        currentConfig.skills[finalName] = {
            discount: 0,
        }
        renderSkills()

        // Open the rename input immediately so the user can type the real name.
        // The name-span click handler creates an <input>, selects its text, and
        // focuses it — typing replaces the "New Skill" placeholder.
        const skillRow = document.querySelector(`[data-skill="${finalName}"]`)
        const nameSpan = skillRow?.querySelector(
            '.skill-name-span',
        ) as HTMLElement | null
        nameSpan?.click()

        autoSave()
    })
}

// Set up event delegation for skills container
setupSkillsContainerDelegation()
setupSkillFilters()

// Set up results table sorting and select-all checkbox
setupResultsTableSorting()
setupSelectAllCheckbox()

// Configs and Help are native action <select>s: picking an option fires the
// corresponding action, then the select resets to its placeholder.
const configMenu = document.getElementById('config-menu') as HTMLSelectElement | null
const helpMenu = document.getElementById('help-menu') as HTMLSelectElement | null
const importInput = document.getElementById(
    'import-config-input',
) as HTMLInputElement

async function handleConfigMenuAction(action: string): Promise<void> {
    if (action === 'export-current') {
        const currentConfigFile = getCurrentConfigFile()
        const currentConfig = getCurrentConfig()
        if (!currentConfigFile || !currentConfig) return
        exportConfig(currentConfigFile, currentConfig)
        return
    }
    if (action === 'export-all') {
        try {
            const count = await exportAllConfigs()
            if (count === 0) {
                showToast({ type: 'info', message: 'No configs to export' })
            } else {
                showToast({
                    type: 'info',
                    message: `Exported ${count} config${count === 1 ? '' : 's'}`,
                })
            }
        } catch (error) {
            showToast({
                type: 'error',
                message: `Export failed: ${(error as Error).message}`,
            })
        }
        return
    }
    if (action === 'import') {
        importInput?.click()
        return
    }
    if (action === 'delete-current') {
        const currentConfigFile = getCurrentConfigFile()
        if (!currentConfigFile) return
        if (!confirm(`Delete config "${currentConfigFile}"? This cannot be undone.`)) {
            return
        }
        try {
            await deleteConfig(currentConfigFile)
            deleteConfigFromFilesystem(currentConfigFile)
            showToast({ type: 'info', message: `Deleted ${currentConfigFile}` })
            await loadConfigFiles()
        } catch (error) {
            showToast({
                type: 'error',
                message: `Delete failed: ${(error as Error).message}`,
            })
        }
    }
}

if (configMenu) {
    configMenu.addEventListener('change', async () => {
        const action = configMenu.value
        configMenu.value = ''
        if (action) await handleConfigMenuAction(action)
    })
}

if (importInput) {
    importInput.addEventListener('change', async () => {
        const files = Array.from(importInput.files ?? [])
        if (files.length === 0) return

        const imported: string[] = []
        const failed: Array<{ name: string; message: string }> = []
        for (const file of files) {
            try {
                const { name } = await importConfig(file)
                imported.push(name)
            } catch (error) {
                failed.push({
                    name: file.name,
                    message: (error as Error).message,
                })
            }
        }

        if (imported.length > 0) {
            await loadConfigFiles()
            await loadConfig(imported[imported.length - 1])
        }

        if (imported.length > 0) {
            showToast({
                type: 'info',
                message:
                    imported.length === 1
                        ? `Imported ${imported[0]}`
                        : `Imported ${imported.length} configs`,
            })
        }
        for (const f of failed) {
            showToast({
                type: 'error',
                message: `Import failed (${f.name}): ${f.message}`,
            })
        }

        importInput.value = ''
    })
}

function handleHelpMenuAction(action: string): void {
    if (action === 'about') {
        window.location.href = `${BASE_URL}help.html`
    } else if (action === 'tour') {
        startTour()
    } else if (action === 'issue') {
        window.open(GITHUB_ISSUES_URL, '_blank', 'noopener')
    } else if (action === 'contact') {
        window.open(DISCORD_INVITE_URL, '_blank', 'noopener')
    }
}

if (helpMenu) {
    helpMenu.addEventListener('change', () => {
        const action = helpMenu.value
        helpMenu.value = ''
        if (action) handleHelpMenuAction(action)
    })
}

// In dev: sync configs from filesystem; in prod: seed default config
const initConfigs = import.meta.env.DEV
    ? syncConfigsFromFilesystem()
    : seedDefaultConfig()
initConfigs
    .then(() => loadConfigFiles())
    .catch(() => loadConfigFiles())
    .finally(() => maybeAutoStartTour())
