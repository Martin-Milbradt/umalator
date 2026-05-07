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
const addSkillButton = document.getElementById('add-skill-button')
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

        setTimeout(() => {
            const skillItem = document.querySelector(
                `[data-skill="${finalName}"]`,
            )
            if (skillItem) {
                const editButton = skillItem.querySelector('.edit-skill-button')
                if (editButton) {
                    ;(editButton as HTMLElement).click()
                }
            }
        }, 100)

        autoSave()
    })
}

// Set up event delegation for skills container
setupSkillsContainerDelegation()
setupSkillFilters()

// Set up results table sorting and select-all checkbox
setupResultsTableSorting()
setupSelectAllCheckbox()

// Set up config menu (Export Current / Export All / Import)
const configMenuButton = document.getElementById('config-menu-button')
const configMenu = document.getElementById('config-menu')
const exportCurrentButton = document.getElementById('export-current-button')
const exportAllButton = document.getElementById('export-all-button')
const importMenuButton = document.getElementById('import-menu-button')
const deleteCurrentButton = document.getElementById('delete-current-button')
const importInput = document.getElementById(
    'import-config-input',
) as HTMLInputElement

function setConfigMenuOpen(open: boolean): void {
    if (!configMenu || !configMenuButton) return
    configMenu.classList.toggle('hidden', !open)
    configMenuButton.setAttribute('aria-expanded', String(open))
}

if (configMenuButton && configMenu) {
    configMenuButton.addEventListener('click', (e) => {
        e.stopPropagation()
        setConfigMenuOpen(configMenu.classList.contains('hidden'))
    })
    document.addEventListener('click', (e) => {
        if (configMenu.classList.contains('hidden')) return
        const target = e.target as Node
        if (
            !configMenu.contains(target) &&
            !configMenuButton.contains(target)
        ) {
            setConfigMenuOpen(false)
        }
    })
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setConfigMenuOpen(false)
    })
}

if (exportCurrentButton) {
    exportCurrentButton.addEventListener('click', () => {
        setConfigMenuOpen(false)
        const currentConfigFile = getCurrentConfigFile()
        const currentConfig = getCurrentConfig()
        if (!currentConfigFile || !currentConfig) return
        exportConfig(currentConfigFile, currentConfig)
    })
}

if (exportAllButton) {
    exportAllButton.addEventListener('click', async () => {
        setConfigMenuOpen(false)
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
            const err = error as Error
            showToast({
                type: 'error',
                message: `Export failed: ${err.message}`,
            })
        }
    })
}

if (importMenuButton && importInput) {
    importMenuButton.addEventListener('click', () => {
        setConfigMenuOpen(false)
        importInput.click()
    })
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

if (deleteCurrentButton) {
    deleteCurrentButton.addEventListener('click', async () => {
        setConfigMenuOpen(false)
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
            const err = error as Error
            showToast({
                type: 'error',
                message: `Delete failed: ${err.message}`,
            })
        }
    })
}

// Set up help menu (About / Tour / Issue / Contact)
const helpMenuButton = document.getElementById('help-menu-button')
const helpMenu = document.getElementById('help-menu')
const helpAboutButton = document.getElementById('help-about-button')
const helpTourButton = document.getElementById('help-tour-button')
const helpIssueButton = document.getElementById('help-issue-button')
const helpContactButton = document.getElementById('help-contact-button')

function setHelpMenuOpen(open: boolean): void {
    if (!helpMenu || !helpMenuButton) return
    helpMenu.classList.toggle('hidden', !open)
    helpMenuButton.setAttribute('aria-expanded', String(open))
}

if (helpMenuButton && helpMenu) {
    helpMenuButton.addEventListener('click', (e) => {
        e.stopPropagation()
        setHelpMenuOpen(helpMenu.classList.contains('hidden'))
    })
    document.addEventListener('click', (e) => {
        if (helpMenu.classList.contains('hidden')) return
        const target = e.target as Node
        if (
            !helpMenu.contains(target) &&
            !helpMenuButton.contains(target)
        ) {
            setHelpMenuOpen(false)
        }
    })
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setHelpMenuOpen(false)
    })
}

if (helpAboutButton) {
    helpAboutButton.addEventListener('click', () => {
        setHelpMenuOpen(false)
        window.location.href = `${BASE_URL}help.html`
    })
}

if (helpTourButton) {
    helpTourButton.addEventListener('click', () => {
        setHelpMenuOpen(false)
        startTour()
    })
}

if (helpIssueButton) {
    helpIssueButton.addEventListener('click', () => {
        setHelpMenuOpen(false)
        window.open(GITHUB_ISSUES_URL, '_blank', 'noopener')
    })
}

if (helpContactButton) {
    helpContactButton.addEventListener('click', () => {
        setHelpMenuOpen(false)
        window.open(DISCORD_INVITE_URL, '_blank', 'noopener')
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
