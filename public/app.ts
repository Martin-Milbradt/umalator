import './input.css'

// Import API module to register runSelectiveCalculations with resultsUI
import './api'

import { runCalculations } from './api'
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
    getResultsMap,
    getSelectedSkills,
    setCourseData,
    setSkillData,
    setSkillmeta,
    setSkillNameToId,
    setSkillnames,
} from './state'
import { showToast } from './toast'
import { renderTrack } from './trackUI'
import type { CourseData, SkillData, SkillMeta, SkillNames } from './types'
import { renderUma } from './umaUI'

// Load skill names on init
;(async function loadSkillnamesOnInit() {
    const response = await fetch('/api/skillnames')
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
    const response = await fetch('/api/skillmeta')
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
    const response = await fetch('/api/skilldata')
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
    const response = await fetch('/api/coursedata')
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
            const response = await fetch(
                `/api/config/${encodeURIComponent(currentConfigFile)}/duplicate`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ newName: trimmedName }),
                },
            )

            if (!response.ok) {
                let errorMessage = 'Failed to duplicate config file'
                try {
                    const error = (await response.json()) as { error?: string }
                    errorMessage = error.error || errorMessage
                } catch {
                    const text = await response.text()
                    errorMessage = text || errorMessage
                }
                alert(`Error: ${errorMessage}`)
                return
            }

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

// Load config files on startup
loadConfigFiles()
