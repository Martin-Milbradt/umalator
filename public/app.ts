import './input.css'

// Import API module to register runSelectiveCalculations with resultsUI
import './api'

import { runCalculations } from './api'
import {
    duplicateConfig,
    exportConfig,
    importConfig,
    seedDefaultConfig,
} from './configStore'
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
import { renderSkills, setupSkillsContainerDelegation } from './skillsUI'
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
import { renderTrack } from './trackUI'
import type { CourseData, SkillData, SkillMeta, SkillNames } from './types'
import { renderUma } from './umaUI'

const BASE_URL = import.meta.env.BASE_URL ?? '/'

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

// Set up results table sorting and select-all checkbox
setupResultsTableSorting()
setupSelectAllCheckbox()

// Set up export config button
const exportButton = document.getElementById('export-config-button')
if (exportButton) {
    exportButton.addEventListener('click', async () => {
        const currentConfigFile = getCurrentConfigFile()
        const currentConfig = getCurrentConfig()
        if (!currentConfigFile || !currentConfig) return
        exportConfig(currentConfigFile, currentConfig)
    })
}

// Set up import config button
const importButton = document.getElementById('import-config-button')
const importInput = document.getElementById(
    'import-config-input',
) as HTMLInputElement
if (importButton && importInput) {
    importButton.addEventListener('click', () => importInput.click())
    importInput.addEventListener('change', async () => {
        const file = importInput.files?.[0]
        if (!file) return
        try {
            const { name } = await importConfig(file)
            await loadConfigFiles()
            await loadConfig(name)
            showToast({ type: 'info', message: `Imported ${name}` })
        } catch (error) {
            const err = error as Error
            showToast({ type: 'error', message: `Import failed: ${err.message}` })
        }
        importInput.value = ''
    })
}

// Seed default config on first visit, then load config files
seedDefaultConfig()
    .then(() => loadConfigFiles())
    .catch(() => loadConfigFiles())
