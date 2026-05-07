import { autoSave } from './configManager'
import { callRenderSkills, registerRenderUma } from './renderCallbacks'
import { refreshGroupResults, refreshResultsCosts } from './resultsUI'
import {
    adjustSkillPoints,
    compareSkills,
    getCanonicalSkillName,
    getGroupVariantOnUma,
    getSkillCostWithDiscount,
    getSkillIconUrl,
    isValidSkillName,
} from './skillHelpers'
import { attachSkillAutocomplete } from './skillAutocomplete'
import { getCalculatedResultsCache, getCurrentConfig } from './state'
import { showToast } from './toast'
import type { Uma } from './types'

function calculateDropdownWidth(options: string[]): number {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return 120
    context.font =
        "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    let maxWidth = 0
    options.forEach((opt) => {
        const width = context.measureText(opt).width
        if (width > maxWidth) {
            maxWidth = width
        }
    })
    return Math.max(maxWidth + 30, 60)
}

export function renderUma(): void {
    const currentConfig = getCurrentConfig()
    if (!currentConfig) return
    const container = document.getElementById('uma-container')
    if (!container) return
    container.innerHTML = ''
    const uma = currentConfig.uma || {}

    const strategyOptions = [
        'Runaway',
        'Front Runner',
        'Pace Chaser',
        'Late Surger',
        'End Closer',
    ]
    const aptitudeOptions = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G']

    interface UmaField {
        key: keyof Uma
        label: string
        type: 'select' | 'number' | 'text'
        options?: string[]
        width: number
        min?: number
        max?: number
    }

    const fields: UmaField[] = [
        { key: 'speed', label: 'SPD', type: 'number', width: 65 },
        { key: 'stamina', label: 'STA', type: 'number', width: 65 },
        { key: 'power', label: 'PWR', type: 'number', width: 65 },
        { key: 'guts', label: 'GUT', type: 'number', width: 65 },
        { key: 'wisdom', label: 'WIT', type: 'number', width: 65 },
        {
            key: 'strategy',
            label: 'Strategy',
            type: 'select',
            options: strategyOptions,
            width: calculateDropdownWidth(strategyOptions),
        },
        {
            key: 'distanceAptitude',
            label: 'Distance',
            type: 'select',
            options: aptitudeOptions,
            width: 35,
        },
        {
            key: 'surfaceAptitude',
            label: 'Surface',
            type: 'select',
            options: aptitudeOptions,
            width: 35,
        },
        {
            key: 'styleAptitude',
            label: 'Style',
            type: 'select',
            options: aptitudeOptions,
            width: 35,
        },
        {
            key: 'mood',
            label: 'Mood',
            type: 'number',
            width: 45,
            min: -2,
            max: 2,
        },
        { key: 'unique', label: 'Unique', type: 'text', width: 280 },
        { key: 'skillPoints', label: 'SP', type: 'number', width: 65 },
    ]

    const createUmaField = (field: UmaField): HTMLElement => {
        const wrapper = document.createElement('span')
        wrapper.className = 'inline-flex items-center gap-1'

        const label = document.createElement('span')
        label.className = 'text-zinc-300 text-[13px] whitespace-nowrap'
        label.textContent = `${field.label}: `
        wrapper.appendChild(label)

        let input: HTMLInputElement | HTMLSelectElement
        if (field.type === 'select') {
            input = document.createElement('select')
            input.className =
                'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500'
            if (field.width) {
                input.style.width = `${field.width}px`
            }
            field.options?.forEach((opt) => {
                const option = document.createElement('option')
                option.value = opt
                option.textContent = opt
                if (uma[field.key] === opt) {
                    option.selected = true
                }
                input.appendChild(option)
            })
        } else {
            input = document.createElement('input')
            input.type = field.type
            input.className =
                'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500'
            const fieldValue = uma[field.key]
            input.value =
                fieldValue === null || fieldValue === undefined
                    ? ''
                    : String(fieldValue)
            if (field.width) {
                input.style.width = `${field.width}px`
            }
            if (field.min !== undefined) {
                input.min = String(field.min)
            }
            if (field.max !== undefined) {
                input.max = String(field.max)
            }
            // Highlight skillPoints in red when negative (over budget)
            if (
                field.key === 'skillPoints' &&
                typeof fieldValue === 'number' &&
                fieldValue < 0
            ) {
                input.classList.add('text-red-400', 'border-red-500')
            }
            if (field.key === 'unique') {
                attachSkillAutocomplete(input as HTMLInputElement, 'unique')
            }
        }

        input.dataset.key = field.key
        input.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement | HTMLSelectElement
            const currentConfig = getCurrentConfig()
            let value: string | number | null
            if (field.type === 'number') {
                const parsed = parseInt(target.value, 10)
                value =
                    target.value === '' || Number.isNaN(parsed) ? null : parsed
            } else {
                value = target.value
            }
            if (!currentConfig) return
            if (!currentConfig.uma) {
                currentConfig.uma = {}
            }
            ;(currentConfig.uma as Record<string, unknown>)[field.key] = value

            // Re-render skills when strategy changes (affects running style filtering)
            if (field.key === 'strategy') {
                callRenderSkills()
            }

            // Clear simulation cache when uma settings that affect results change
            const simulationAffectingFields = [
                'speed',
                'stamina',
                'power',
                'guts',
                'wisdom',
                'strategy',
                'distanceAptitude',
                'surfaceAptitude',
                'styleAptitude',
                'mood',
            ]
            if (simulationAffectingFields.includes(field.key)) {
                getCalculatedResultsCache().clear()
            }

            autoSave()
        })
        wrapper.appendChild(input)

        return wrapper
    }

    // Skills section (first row). min-h matches the equipped-skill pill height
    // so the row stays the same size whether a pill is present or not.
    const skillsDiv = document.createElement('div')
    skillsDiv.className =
        'flex flex-wrap items-center gap-1.5 mb-2 min-h-[30px]'
    const skillsLabel = document.createElement('span')
    skillsLabel.className = 'text-zinc-300 text-[13px] whitespace-nowrap'
    skillsLabel.textContent = 'Skills:'
    skillsDiv.appendChild(skillsLabel)

    const skills = uma.skills || []

    function updateSkills(newSkills: string[], affectedSkills: string[]) {
        const currentConfig = getCurrentConfig()
        if (!currentConfig) return
        if (!currentConfig.uma) {
            currentConfig.uma = {}
        }
        currentConfig.uma.skills = newSkills
        for (const affected of affectedSkills) {
            refreshGroupResults(affected)
        }
        renderUma()
        callRenderSkills()
        refreshResultsCosts()
        autoSave()
    }

    function createSkillPill(skill: string, index: number): HTMLElement {
        const pill = document.createElement('span')
        pill.className =
            'inline-flex items-center gap-1 px-2 py-1 bg-zinc-700 border border-zinc-600 text-zinc-200 rounded text-[13px] group hover:bg-zinc-600 transition-colors'

        const textSpan = document.createElement('span')
        textSpan.textContent = skill
        textSpan.className = 'cursor-text'
        textSpan.addEventListener('click', (e) => {
            e.stopPropagation()
            // Replace pill with edit input
            const editInput = document.createElement('input')
            editInput.type = 'text'
            editInput.value = skill
            editInput.className =
                'bg-zinc-800 text-zinc-200 text-[13px] px-1 py-1 rounded border border-sky-500 outline-none min-w-[100px]'
            editInput.style.width = `${Math.max(100, skill.length * 8)}px`

            const finishEdit = () => {
                const currentConfig = getCurrentConfig()
                const trimmed = editInput.value.trim()
                if (trimmed && !isValidSkillName(trimmed)) {
                    showToast({
                        type: 'error',
                        message: `Unknown skill: "${trimmed}"`,
                    })
                    renderUma()
                    return
                }
                const newValue = getCanonicalSkillName(trimmed)
                if (newValue && newValue !== skill) {
                    // Renaming skill - treat as remove old + add new

                    adjustSkillPoints(getSkillCostWithDiscount(skill))

                    // Check if new skill already on Uma
                    if (skills.includes(newValue)) {
                        // Just remove the old skill
                        const newSkills = skills.filter((_, i) => i !== index)
                        updateSkills(newSkills, [skill])
                        return
                    }

                    // Check if new skill's variant is already on Uma
                    const existingVariant = getGroupVariantOnUma(newValue)
                    let newSkills: string[]
                    if (existingVariant && existingVariant !== skill) {
                        adjustSkillPoints(
                            getSkillCostWithDiscount(existingVariant),
                        )
                        newSkills = skills.filter(
                            (s, i) => i !== index && s !== existingVariant,
                        )
                        newSkills.push(newValue)
                    } else {
                        newSkills = [...skills]
                        newSkills[index] = newValue
                    }

                    adjustSkillPoints(-getSkillCostWithDiscount(newValue))

                    updateSkills(newSkills, [skill, newValue])
                } else if (!newValue) {
                    adjustSkillPoints(getSkillCostWithDiscount(skill))
                    const newSkills = skills.filter((_, i) => i !== index)
                    updateSkills(newSkills, [skill])
                } else {
                    renderUma()
                }
            }

            pill.replaceWith(editInput)
            // Attach autocomplete first so its keydown handler (Enter/Escape)
            // runs before the input's own blur-on-Enter handler.
            attachSkillAutocomplete(editInput, 'regular')
            editInput.addEventListener('blur', finishEdit)
            editInput.addEventListener('keydown', (ke) => {
                if (ke.key === 'Enter') {
                    ke.preventDefault()
                    editInput.blur()
                } else if (ke.key === 'Escape') {
                    ke.preventDefault()
                    renderUma()
                }
            })
            editInput.focus()
            editInput.select()
        })

        const removeBtn = document.createElement('button')
        removeBtn.type = 'button'
        removeBtn.className =
            'text-zinc-400 hover:text-zinc-100 transition-colors leading-none text-xs'
        removeBtn.innerHTML = '&times;'
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            adjustSkillPoints(getSkillCostWithDiscount(skill))
            const newSkills = skills.filter((_, i) => i !== index)
            updateSkills(newSkills, [skill])
        })

        const iconUrl = getSkillIconUrl(skill)
        if (iconUrl) {
            const img = document.createElement('img')
            img.src = iconUrl
            img.className = 'w-4 h-4 shrink-0'
            img.alt = ''
            pill.appendChild(img)
        }
        pill.appendChild(textSpan)
        pill.appendChild(removeBtn)
        return pill
    }

    // Sort equipped skills by order (same order as the skills list)
    const sortedIndices = skills
        .map((skill, index) => ({ skill, index }))
        .sort((a, b) => compareSkills(a.skill, b.skill))
    for (const { skill, index } of sortedIndices) {
        skillsDiv.appendChild(createSkillPill(skill, index))
    }

    // Add button (blue "+") to add new skills
    const addButton = document.createElement('button')
    addButton.type = 'button'
    addButton.className =
        'w-6 h-6 rounded text-lg leading-none cursor-pointer transition-colors bg-sky-600 text-white border-none hover:bg-sky-700 flex items-center justify-center p-0'
    addButton.textContent = '+'
    addButton.title = 'Add skill'
    addButton.addEventListener('click', () => {
        // Replace button with input
        const addInput = document.createElement('input')
        addInput.type = 'text'
        addInput.className =
            'bg-zinc-800 text-zinc-200 text-[13px] h-6 px-1 rounded border border-sky-500 outline-none min-w-[100px] box-border'
        addInput.placeholder = 'Skill name...'

        const finishAdd = () => {
            const trimmed = addInput.value.trim()
            if (trimmed && !isValidSkillName(trimmed)) {
                showToast({
                    type: 'error',
                    message: `Unknown skill: "${trimmed}"`,
                })
                renderUma()
                return
            }
            const newSkill = getCanonicalSkillName(trimmed)
            if (newSkill) {
                // Check if already on Uma
                if (skills.includes(newSkill)) {
                    renderUma()
                    return
                }

                const existingVariant = getGroupVariantOnUma(newSkill)
                let newSkills: string[]
                if (existingVariant) {
                    adjustSkillPoints(
                        getSkillCostWithDiscount(existingVariant),
                    )
                    const idx = skills.indexOf(existingVariant)
                    newSkills = [...skills]
                    newSkills[idx] = newSkill
                } else {
                    newSkills = [...skills, newSkill]
                }

                adjustSkillPoints(-getSkillCostWithDiscount(newSkill))

                updateSkills(newSkills, [newSkill])
            } else {
                renderUma()
            }
        }

        addButton.replaceWith(addInput)
        // Attach autocomplete first so its keydown wins over the blur-on-Enter handler.
        attachSkillAutocomplete(addInput, 'regular')
        addInput.addEventListener('blur', finishAdd)
        addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                addInput.blur()
            } else if (e.key === 'Escape') {
                e.preventDefault()
                renderUma()
            }
        })
        addInput.focus()
    })

    skillsDiv.appendChild(addButton)

    // Clear-all button: only shown when at least one skill is equipped.
    if (skills.length > 0) {
        const clearAllButton = document.createElement('button')
        clearAllButton.type = 'button'
        clearAllButton.className =
            'w-6 h-6 rounded text-lg leading-none cursor-pointer transition-colors bg-red-600 text-white border-none hover:bg-red-700 flex items-center justify-center p-0'
        clearAllButton.textContent = '\u00D7'
        clearAllButton.title = 'Remove all skills'
        clearAllButton.addEventListener('click', () => {
            for (const skill of skills) {
                adjustSkillPoints(getSkillCostWithDiscount(skill))
            }
            updateSkills([], [...skills])
        })
        skillsDiv.appendChild(clearAllButton)
    }

    container.appendChild(skillsDiv)

    // Stats section (second row)
    const line = document.createElement('div')
    line.className = 'flex flex-wrap items-center gap-1 mb-2'
    fields.forEach((field) => {
        line.appendChild(createUmaField(field))
    })
    container.appendChild(line)
}

// Register the render callback
registerRenderUma(renderUma)
