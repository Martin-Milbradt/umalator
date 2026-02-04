import { autoSave } from './configManager'
import { callRenderUma, registerRenderSkills } from './renderCallbacks'
import {
    addSkillToUmaFromTable,
    removeSkillFromUma,
    updateResultsForDiscountChange,
} from './resultsUI'
import {
    deleteSkill,
    findSkillId,
    getBaseSkillName,
    getCanonicalSkillName,
    getOtherVariant,
    getSkillCostWithDiscount,
    getVariantsForBaseName,
    updateSkillVariantsDefault,
} from './skillHelpers'
import { canSkillTriggerByName } from './skillTrigger'
import { getCurrentConfig } from './state'

const squareClasses =
    'py-0.5 px-1 w-6 h-6 rounded text-[13px] cursor-pointer transition-colors'

export function renderSkills(): void {
    const currentConfig = getCurrentConfig()
    if (!currentConfig) return
    const container = document.getElementById('skills-container')
    if (!container) return
    container.innerHTML = ''
    const skills = currentConfig.skills
    const umaSkills = currentConfig.uma?.skills || []

    const skillNames = Object.keys(skills)
    const skillsToRender = new Set<string>()
    const skillsToHide = new Set<string>()

    skillNames.forEach((skillName) => {
        const baseName = getBaseSkillName(skillName)
        const variants = getVariantsForBaseName(baseName)

        if (variants.length === 2) {
            skillsToHide.add(baseName)
            variants.forEach((variantName) => {
                skillsToRender.add(variantName)
                if (!skills[variantName]) {
                    const baseSkill = skills[baseName] || skills[skillName]
                    skills[variantName] = {
                        discount:
                            baseSkill.discount !== null &&
                            baseSkill.discount !== undefined
                                ? baseSkill.discount
                                : null,
                    }
                } else {
                    const baseSkill = skills[baseName] || skills[skillName]
                    if (
                        baseSkill.discount !== null &&
                        baseSkill.discount !== undefined
                    ) {
                        skills[variantName].discount = baseSkill.discount
                    }
                }
            })
        } else {
            const otherVariant = getOtherVariant(skillName)
            if (otherVariant) {
                const variantsToAdd = Array.isArray(otherVariant)
                    ? otherVariant
                    : [otherVariant]
                variantsToAdd.forEach((variantName) => {
                    if (!skillsToRender.has(variantName)) {
                        skillsToRender.add(variantName)
                        if (!skills[variantName]) {
                            const baseSkill = skills[skillName]
                            skills[variantName] = {
                                discount:
                                    baseSkill.discount !== null &&
                                    baseSkill.discount !== undefined
                                        ? baseSkill.discount
                                        : null,
                            }
                        } else {
                            const baseSkill = skills[skillName]
                            if (
                                baseSkill.discount !== null &&
                                baseSkill.discount !== undefined
                            ) {
                                skills[variantName].discount =
                                    baseSkill.discount
                            }
                        }
                    }
                })
            }
            if (!skillsToHide.has(skillName)) {
                skillsToRender.add(skillName)
            }
        }
    })

    // Pre-compute skill IDs to avoid O(n^2) lookups in sort comparator
    const skillIdCache = new Map<string, number>()
    for (const name of skillsToRender) {
        const idStr = findSkillId(name)
        skillIdCache.set(name, idStr ? parseInt(idStr, 10) : 0)
    }
    const sortedSkillNames = Array.from(skillsToRender).sort((a, b) => {
        return (skillIdCache.get(a) || 0) - (skillIdCache.get(b) || 0)
    })

    // Filter out skills that cannot trigger under current settings
    const triggerableSkills = sortedSkillNames.filter(canSkillTriggerByName)

    triggerableSkills.forEach((skillName) => {
        const skill = skills[skillName]
        if (!skill) return

        if (skill.discount === undefined) {
            skill.discount = null
        }

        const div = document.createElement('div')
        div.className =
            'flex items-center gap-2 hover:bg-zinc-800 px-1 py-0.5 rounded'
        div.dataset.skill = skillName

        const currentDiscount = skill.discount
        const discountOptions: (number | null)[] = [null, 0, 10, 20, 30, 35, 40]
        const discountButtonGroup = document.createElement('div')
        discountButtonGroup.className = 'flex gap-1 items-center'
        discountButtonGroup.dataset.skill = skillName

        discountOptions.forEach((value) => {
            const button = document.createElement('button')
            button.className = `${squareClasses} bg-zinc-700 text-zinc-200 border border-zinc-600 hover:bg-zinc-600 hover:border-zinc-500`
            button.dataset.skill = skillName
            button.dataset.discount = value === null ? '-' : value.toString()
            button.textContent = value === null ? '-' : value.toString()
            if (
                currentDiscount === value ||
                (value === null &&
                    (currentDiscount === null || currentDiscount === undefined))
            ) {
                button.className = `${squareClasses} bg-sky-600 text-white border border-sky-600 hover:bg-sky-700 hover:border-sky-700`
            }
            discountButtonGroup.appendChild(button)
        })

        const lockButton = document.createElement('button')
        lockButton.className = `${squareClasses} bg-transparent text-zinc-500 border-none hover:text-zinc-200 hover:bg-zinc-700`
        lockButton.dataset.skill = skillName
        const skillDefault = skill.default
        const isDefaultActive =
            skillDefault !== undefined &&
            skillDefault !== null &&
            currentDiscount === skillDefault
        const isDefaultNull =
            (skillDefault === undefined || skillDefault === null) &&
            (currentDiscount === null || currentDiscount === undefined)
        const isLocked = isDefaultActive || isDefaultNull
        lockButton.textContent = isLocked ? '🔒' : '🔓'
        lockButton.title = isLocked
            ? 'Remove default'
            : 'Set current discount as default'
        lockButton.addEventListener('click', (e) => {
            e.stopPropagation()
            const target = e.target as HTMLElement
            const skillName = target.dataset.skill
            const currentConfig = getCurrentConfig()
            if (!skillName || !currentConfig) return
            const currentDiscount = currentConfig.skills[skillName]?.discount
            const skillDefault = currentConfig.skills[skillName]?.default
            const isCurrentlyDefault =
                (skillDefault !== undefined &&
                    skillDefault !== null &&
                    currentDiscount === skillDefault) ||
                ((skillDefault === undefined || skillDefault === null) &&
                    (currentDiscount === null || currentDiscount === undefined))
            if (isCurrentlyDefault) {
                updateSkillVariantsDefault(skillName, 'remove')
            } else if (
                currentDiscount === null ||
                currentDiscount === undefined
            ) {
                updateSkillVariantsDefault(skillName, 'remove')
            } else {
                updateSkillVariantsDefault(skillName, 'set', currentDiscount)
            }
            renderSkills()
            autoSave()
        })
        discountButtonGroup.appendChild(lockButton)

        const addToUmaButton = document.createElement('button')
        const isInUmaSkills = umaSkills.includes(skillName)
        const hasDiscount =
            skill.discount !== null && skill.discount !== undefined
        if (isInUmaSkills) {
            addToUmaButton.className = `${squareClasses} bg-red-600 text-white border-none hover:bg-red-700`
            addToUmaButton.textContent = '-'
            addToUmaButton.title = 'Remove from Uma skills'
        } else {
            if (hasDiscount) {
                addToUmaButton.className = `${squareClasses} bg-sky-600 text-white border-none hover:bg-sky-700`
            } else {
                addToUmaButton.className = `${squareClasses} opacity-40 bg-zinc-700 text-zinc-400 border border-zinc-600 hover:bg-zinc-600 hover:border-zinc-500`
            }
            addToUmaButton.textContent = '+'
            addToUmaButton.title = 'Add to Uma skills'
        }
        addToUmaButton.dataset.skill = skillName
        addToUmaButton.addEventListener('click', (e) => {
            e.stopPropagation()
            const target = e.target as HTMLElement
            const skillName = target.dataset.skill
            const currentConfig = getCurrentConfig()
            if (!skillName || !currentConfig) return
            if (!currentConfig.uma) {
                currentConfig.uma = {}
            }
            if (!currentConfig.uma.skills) {
                currentConfig.uma.skills = []
            }

            const currentlyInUmaSkills =
                currentConfig.uma.skills.includes(skillName)
            if (currentlyInUmaSkills) {
                // Removing skill
                removeSkillFromUma(skillName)
            } else {
                // Adding skill
                const cost = getSkillCostWithDiscount(skillName)
                addSkillToUmaFromTable(skillName, cost)
            }
            callRenderUma()
            renderSkills()
            autoSave()
        })

        const skillNameSpan = document.createElement('span')
        skillNameSpan.className = 'flex-1 cursor-pointer hover:text-teal-400'
        skillNameSpan.textContent = skillName
        skillNameSpan.title = 'Click to edit skill name'
        skillNameSpan.dataset.skill = skillName
        skillNameSpan.addEventListener('click', (e) => {
            e.stopPropagation()
            const target = e.target as HTMLElement
            const skillName = target.dataset.skill
            const currentConfig = getCurrentConfig()
            if (!skillName || !currentConfig) return
            const originalName = skillName
            const skillNameInput = document.createElement('input')
            skillNameInput.type = 'text'
            skillNameInput.className =
                'py-0.5 px-1 border-sky-500 min-w-[100px] m-0 bg-zinc-700 text-zinc-200 border rounded text-[13px] focus:outline-none focus:border-sky-400 flex-1'
            skillNameInput.value = originalName
            const spanTarget = e.target as HTMLElement
            skillNameInput.style.width = `${spanTarget.offsetWidth}px`
            skillNameInput.style.minWidth = '100px'

            const restoreSpan = () => {
                renderSkills()
            }

            const handleBlur = () => {
                const inputName = skillNameInput.value.trim()
                if (!inputName) {
                    deleteSkill(originalName)
                    renderSkills()
                    callRenderUma()
                    autoSave()
                } else {
                    const canonicalName = getCanonicalSkillName(inputName)
                    if (
                        canonicalName !== originalName &&
                        !currentConfig.skills[canonicalName]
                    ) {
                        const skillData = currentConfig.skills[originalName]
                        deleteSkill(originalName)
                        currentConfig.skills[canonicalName] = skillData
                        renderSkills()
                        callRenderUma()
                        autoSave()
                    } else {
                        restoreSpan()
                    }
                }
            }

            skillNameInput.addEventListener('blur', handleBlur)
            skillNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    skillNameInput.blur()
                } else if (e.key === 'Escape') {
                    restoreSpan()
                }
            })

            const parent = spanTarget.parentNode
            if (parent) {
                parent.replaceChild(skillNameInput, spanTarget)
            }
            skillNameInput.focus()
            skillNameInput.select()
        })

        const label = document.createElement('label')
        label.className = 'flex-1 m-0 flex items-center gap-2'
        label.appendChild(skillNameSpan)

        div.appendChild(addToUmaButton)
        div.appendChild(label)
        div.appendChild(discountButtonGroup)

        container.appendChild(div)
    })

    // Event delegation is set up once via setupSkillsContainerDelegation()
}

// Set up event delegation for discount buttons (single listener instead of per-button)
export function setupSkillsContainerDelegation(): void {
    const container = document.getElementById('skills-container')
    if (!container) return

    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        // Only handle discount button clicks
        if (target.dataset.discount === undefined) return

        const skillName = target.dataset.skill
        const discountValue = target.dataset.discount
        const currentConfig = getCurrentConfig()
        if (!skillName || !discountValue || !currentConfig) return
        const discount =
            discountValue === '-' ? null : parseInt(discountValue, 10)
        if (!currentConfig.skills[skillName]) {
            currentConfig.skills[skillName] = { discount: null }
        }

        const currentDiscount = currentConfig.skills[skillName].discount
        const isCurrentlyActive =
            (discount === null &&
                (currentDiscount === null || currentDiscount === undefined)) ||
            (discount !== null && currentDiscount === discount)

        if (isCurrentlyActive) {
            const skillDefault = currentConfig.skills[skillName]?.default
            const isCurrentlyDefault =
                (skillDefault !== undefined &&
                    skillDefault !== null &&
                    currentDiscount === skillDefault) ||
                ((skillDefault === undefined || skillDefault === null) &&
                    (currentDiscount === null || currentDiscount === undefined))

            if (isCurrentlyDefault) {
                updateSkillVariantsDefault(skillName, 'remove')
            } else if (
                currentDiscount === null ||
                currentDiscount === undefined
            ) {
                updateSkillVariantsDefault(skillName, 'remove')
            } else {
                updateSkillVariantsDefault(skillName, 'set', currentDiscount)
            }
        } else {
            currentConfig.skills[skillName].discount =
                discount === null ? null : discount

            const baseName = getBaseSkillName(skillName)
            const variants = getVariantsForBaseName(baseName)
            if (variants.length === 2) {
                if (currentConfig.skills[baseName]) {
                    currentConfig.skills[baseName].discount = discount
                }
                variants.forEach((variantName) => {
                    if (currentConfig.skills[variantName]) {
                        currentConfig.skills[variantName].discount = discount
                    }
                })
            } else {
                const otherVariant = getOtherVariant(skillName)
                if (otherVariant) {
                    const variantsToUpdate = Array.isArray(otherVariant)
                        ? otherVariant
                        : [otherVariant]
                    variantsToUpdate.forEach((variantName) => {
                        if (currentConfig.skills[variantName]) {
                            currentConfig.skills[variantName].discount =
                                discount
                        }
                    })
                    if (
                        currentConfig.skills[baseName] &&
                        !skillName.endsWith(' ○') &&
                        !skillName.endsWith(' ◎')
                    ) {
                        currentConfig.skills[baseName].discount = discount
                    }
                }
            }

            // Update results table based on discount change
            updateResultsForDiscountChange(skillName, currentDiscount, discount)
        }

        renderSkills()
        autoSave()
    })
}

// Register the render callback
registerRenderSkills(renderSkills)
