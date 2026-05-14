import { autoSave } from './configManager'
import { callRenderUma, registerRenderSkills } from './renderCallbacks'
import {
    addPendingSkillToResults,
    addSkillToUmaFromTable,
    removeSkillFromUma,
    updateResultsForDiscountChange,
} from './resultsUI'
import {
    compareSkills,
    deleteSkill,
    getBaseSkillName,
    getCanonicalSkillName,
    getDiscountVariants,
    getOtherVariant,
    getSkillCostWithDiscount,
    getSkillIconUrl,
    getVariantsForBaseName,
    isSkillOnUma,
    isValidSkillName,
    umaHasUpgradedVersion,
    updateSkillVariantsDefault,
} from './skillHelpers'
import { attachSkillAutocomplete } from './skillAutocomplete'
import { canSkillTriggerByName } from './skillTrigger'
import { getCurrentConfig, getResultsMap, getSelectedSkills } from './state'
import { showToast } from './toast'

import type { AvailableFilter } from './types'

const squareClasses =
    'py-0.5 px-1 w-6 h-6 rounded text-[13px] cursor-pointer transition-colors'

// Filter state lives on the loaded config so it persists with the rest of the
// settings. Missing fields fall back to the defaults ("Owned" off, Available
// "Filtered") so older configs and freshly-imported ones behave naturally.
function getHideOwned(): boolean {
    return getCurrentConfig()?.filters?.hideOwned ?? false
}

function getAvailableFilter(): AvailableFilter {
    return getCurrentConfig()?.filters?.available ?? 'filtered'
}

function setHideOwned(value: boolean): void {
    const config = getCurrentConfig()
    if (!config) return
    if (!config.filters) config.filters = {}
    config.filters.hideOwned = value
}

function setAvailableFilter(value: AvailableFilter): void {
    const config = getCurrentConfig()
    if (!config) return
    if (!config.filters) config.filters = {}
    config.filters.available = value
}

function skillHasHint(skillName: string): boolean {
    const currentConfig = getCurrentConfig()
    const discount = currentConfig?.skills[skillName]?.discount
    return discount !== null && discount !== undefined
}

function passesFilters(skillName: string): boolean {
    const hideOwned = getHideOwned()
    const available = getAvailableFilter()
    if (hideOwned && (isSkillOnUma(skillName) || umaHasUpgradedVersion(skillName)))
        return false
    if (available === 'hint' && !skillHasHint(skillName)) return false
    if (available === 'noHint' && skillHasHint(skillName)) return false
    return true
}

function pruneFromResults(skillName: string): void {
    getResultsMap().delete(skillName)
    getSelectedSkills().delete(skillName)
}

/**
 * After a rename, schedule auto-calculation for the new skill (and its
 * sibling variants, which renderSkills() may have just auto-created). Mirrors
 * the discount-button flow so a fresh "+" → rename behaves like the user had
 * picked the skill from the start.
 */
export function triggerCalculationForRenamedSkill(
    skillName: string,
    discount: number | null | undefined,
): void {
    if (discount === null || discount === undefined) return
    const currentConfig = getCurrentConfig()
    if (!currentConfig) return
    for (const variantName of getDiscountVariants(skillName)) {
        if (!currentConfig.skills[variantName]) continue
        if (isSkillOnUma(variantName) || umaHasUpgradedVersion(variantName)) {
            continue
        }
        addPendingSkillToResults(variantName, discount)
    }
}

/**
 * Set `discount` on `skillName` and every sibling variant that shares its hint
 * (e.g. the ○/◎ pair). The results table is updated in lockstep for each
 * variant so a single click produces a row for each skill the discount applies
 * to, not just the clicked one.
 */
export function setDiscountForVariants(
    skillName: string,
    discount: number | null,
): void {
    const currentConfig = getCurrentConfig()
    if (!currentConfig) return

    if (!currentConfig.skills[skillName]) {
        currentConfig.skills[skillName] = { discount: null }
    }

    const variants = getDiscountVariants(skillName)
    const previous = new Map<string, number | null | undefined>()
    for (const variantName of variants) {
        previous.set(variantName, currentConfig.skills[variantName]?.discount)
    }

    for (const variantName of variants) {
        if (currentConfig.skills[variantName]) {
            currentConfig.skills[variantName].discount = discount
        }
    }

    // Legacy base-name config entry: some configs carry a discount under the
    // stripped name (e.g. "Medium Straightaways") alongside the variants.
    // Mirror the discount there only if the entry already exists.
    const baseName = getBaseSkillName(skillName)
    const baseEntryExists = !!currentConfig.skills[baseName]
    const baseIsDistinctSkill =
        baseName !== skillName && !variants.includes(baseName)
    if (baseEntryExists && baseIsDistinctSkill) {
        const twoVariantPair = getVariantsForBaseName(baseName).length === 2
        const inputIsBaseItself =
            !skillName.endsWith(' ○') && !skillName.endsWith(' ◎')
        if (twoVariantPair || inputIsBaseItself) {
            currentConfig.skills[baseName].discount = discount
        }
    }

    for (const variantName of variants) {
        updateResultsForDiscountChange(
            variantName,
            previous.get(variantName),
            discount,
        )
    }
}

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

    const sortedSkillNames = Array.from(skillsToRender).sort(compareSkills)

    // Filter out skills that cannot trigger under current settings (skipped
    // when the user picks Unfiltered), then apply Owned / Hint filters.
    const triggerableSkills =
        getAvailableFilter() === 'unfiltered'
            ? sortedSkillNames.filter(passesFilters)
            : sortedSkillNames.filter(canSkillTriggerByName).filter(passesFilters)

    // Keep the filter controls in sync with the loaded config so switching
    // configs reflects each one's saved Owned/Available state.
    syncFilterControls()

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
        discountButtonGroup.className = 'discount-options flex gap-1 items-center'
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
        lockButton.className = `lock-btn ${squareClasses} bg-transparent text-zinc-500 border-none hover:text-zinc-200 hover:bg-zinc-700`
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
            addToUmaButton.className = `add-to-uma-btn ${squareClasses} bg-red-600 text-white border-none hover:bg-red-700`
            addToUmaButton.textContent = '-'
            addToUmaButton.title = 'Remove from Uma skills'
        } else {
            if (hasDiscount) {
                addToUmaButton.className = `add-to-uma-btn ${squareClasses} bg-sky-600 text-white border-none hover:bg-sky-700`
            } else {
                addToUmaButton.className = `add-to-uma-btn ${squareClasses} opacity-40 bg-zinc-700 text-zinc-400 border border-zinc-600 hover:bg-zinc-600 hover:border-zinc-500`
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
        skillNameSpan.className = 'skill-name-span flex-1 cursor-pointer hover:text-teal-400'
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

            // Esc with empty/placeholder value deletes the skill directly and
            // sets this flag so the blur (fired by renderSkills removing the
            // input) doesn't re-run the canonicalization path on the stale value.
            let cancelled = false

            const restoreSpan = () => {
                renderSkills()
            }

            const deleteAndCancel = () => {
                cancelled = true
                deleteSkill(originalName)
                pruneFromResults(originalName)
                renderSkills()
                callRenderUma()
                autoSave()
            }

            const handleBlur = () => {
                if (cancelled) return
                const inputName = skillNameInput.value.trim()
                if (!inputName) {
                    deleteAndCancel()
                } else {
                    const canonicalName = getCanonicalSkillName(inputName)
                    if (!isValidSkillName(canonicalName)) {
                        showToast({
                            type: 'error',
                            message: `Unknown skill: "${inputName}"`,
                        })
                        restoreSpan()
                    } else if (
                        canonicalName !== originalName &&
                        !currentConfig.skills[canonicalName]
                    ) {
                        const skillData = currentConfig.skills[originalName]
                        deleteSkill(originalName)
                        pruneFromResults(originalName)
                        currentConfig.skills[canonicalName] = skillData
                        renderSkills()
                        callRenderUma()
                        triggerCalculationForRenamedSkill(
                            canonicalName,
                            skillData.discount,
                        )
                        autoSave()
                    } else {
                        restoreSpan()
                    }
                }
            }

            const parent = spanTarget.parentNode
            if (parent) {
                parent.replaceChild(skillNameInput, spanTarget)
            }
            // Attach autocomplete BEFORE the input's own keydown listener so
            // its Enter/Escape handlers can stopImmediatePropagation and beat
            // the rename input's blur-on-Enter behavior.
            attachSkillAutocomplete(skillNameInput, 'regular', {
                getExclude: () =>
                    Object.keys(getCurrentConfig()?.skills ?? {}),
            })
            skillNameInput.addEventListener('blur', handleBlur)
            skillNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    skillNameInput.blur()
                } else if (e.key === 'Escape') {
                    const value = skillNameInput.value.trim()
                    const isPlaceholder = /^New Skill( \d+)?$/.test(value)
                    if (!value || isPlaceholder) {
                        deleteAndCancel()
                    } else {
                        restoreSpan()
                    }
                }
            })
            skillNameInput.focus()
            skillNameInput.select()
        })

        const label = document.createElement('label')
        label.className = 'flex-1 m-0 flex items-center gap-2'
        const iconUrl = getSkillIconUrl(skillName)
        if (iconUrl) {
            const img = document.createElement('img')
            img.src = iconUrl
            img.className = 'w-5 h-5 shrink-0'
            img.alt = ''
            label.appendChild(img)
        }
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
            setDiscountForVariants(skillName, discount)
        }

        renderSkills()
        autoSave()
    })
}

function updateOwnedButton(button: HTMLButtonElement): void {
    const hideOwned = getHideOwned()
    button.dataset.active = hideOwned ? 'true' : 'false'
    button.className = hideOwned
        ? 'bg-sky-600 text-white border border-sky-600 rounded h-7 px-2 cursor-pointer transition-colors hover:bg-sky-700'
        : 'bg-zinc-700 text-zinc-200 border border-zinc-600 rounded h-7 px-2 cursor-pointer transition-colors hover:bg-zinc-600'
}

function updateAvailableSelect(select: HTMLSelectElement): void {
    select.value = getAvailableFilter()
}

function syncFilterControls(): void {
    const ownedButton = document.getElementById(
        'filter-owned-button',
    ) as HTMLButtonElement | null
    if (ownedButton) updateOwnedButton(ownedButton)
    const availableSelect = document.getElementById(
        'filter-available-select',
    ) as HTMLSelectElement | null
    if (availableSelect) updateAvailableSelect(availableSelect)
}

export function setupSkillFilters(): void {
    const ownedButton = document.getElementById(
        'filter-owned-button',
    ) as HTMLButtonElement | null
    const availableSelect = document.getElementById(
        'filter-available-select',
    ) as HTMLSelectElement | null
    if (ownedButton) {
        updateOwnedButton(ownedButton)
        ownedButton.addEventListener('click', () => {
            setHideOwned(!getHideOwned())
            updateOwnedButton(ownedButton)
            renderSkills()
            autoSave()
        })
    }
    if (availableSelect) {
        updateAvailableSelect(availableSelect)
        availableSelect.addEventListener('change', () => {
            setAvailableFilter(availableSelect.value as AvailableFilter)
            updateAvailableSelect(availableSelect)
            renderSkills()
            autoSave()
        })
    }
}

// Register the render callback
registerRenderSkills(renderSkills)
