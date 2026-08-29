import { autoSave } from './configManager'
import { callRenderUma, registerRenderSkills } from './renderCallbacks'
import {
    addPendingSkillToResults,
    addSkillToUmaFromTable,
    refreshOwnedRowsForGroup,
    removeSkillFromUma,
    renderResultsTable,
    updateResultsForDiscountChange,
} from './resultsUI'
import {
    compareSkills,
    createSkillIcon,
    deleteSkill,
    getBaseSkillName,
    getCanonicalSkillName,
    getDiscountVariants,
    getGenericSkillIconUrl,
    getOtherVariant,
    getShowIcons,
    getVariantsForBaseName,
    isPlaceholderSkillName,
    isSimulatableSkill,
    isSkillOnUma,
    isValidSkillName,
    setShowIcons,
    umaHasUpgradedVersion,
    updateSkillVariantsDefault,
} from './skillHelpers'
import { attachSkillAutocomplete } from './skillAutocomplete'
import { describeSkill } from './skillDescription'
import { canSkillTriggerByName } from './skillTrigger'
import {
    isMobileViewport,
    shouldUseDiscountDropdownForWidth,
} from './responsive'
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

    // A placeholder row ("New Skill") isn't a real skill yet. Store the discount
    // so it carries over when the user names the skill, but skip the results /
    // variant work: there are no ○/◎ siblings to mirror, and feeding the
    // placeholder name to the simulation would just fail.
    if (isPlaceholderSkillName(skillName)) {
        currentConfig.skills[skillName]!.discount = discount
        return
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
            currentConfig.skills[baseName]!.discount = discount
        }
    }

    for (const variantName of variants) {
        updateResultsForDiscountChange(
            variantName,
            previous.get(variantName),
            discount,
        )
    }
    // Owned (greyed) rows in this group carry refunds computed from the
    // group's discounts; requeue them like the buy rows above.
    refreshOwnedRowsForGroup(skillName)
}

const DISCOUNT_OPTIONS: (number | null)[] = [null, 0, 10, 20, 30, 35, 40]

/**
 * Decide whether per-skill discounts render as a dropdown (narrow pane) or the
 * full button row (wide pane). Measured against the skills container's own
 * width, not the window, so resizing the pane divider collapses the row even on
 * desktop. Falls back to the window breakpoint before the pane has a measurable
 * width (very first render).
 */
function shouldUseDiscountDropdown(): boolean {
    const container = document.getElementById('skills-container')
    if (!container || container.clientWidth === 0) return isMobileViewport()
    return shouldUseDiscountDropdownForWidth(container.clientWidth)
}

/**
 * Re-render the skills list when the skills pane crosses the discount-dropdown
 * width threshold (e.g. the user drags the pane divider). Tracks the last mode
 * so we only re-render on an actual flip rather than on every resize frame.
 */
export function setupDiscountWidthObserver(): void {
    const container = document.getElementById('skills-container')
    if (!container || typeof ResizeObserver === 'undefined') return
    let lastDropdown = shouldUseDiscountDropdown()
    const observer = new ResizeObserver(() => {
        const dropdown = shouldUseDiscountDropdown()
        if (dropdown !== lastDropdown) {
            lastDropdown = dropdown
            renderSkills()
        }
    })
    observer.observe(container)
}

/**
 * Compact discount picker for a narrow skills pane, where the seven-button row
 * is too wide. `null` ("None") removes the skill from the results table; a
 * number sets that discount. Mirrors the non-active branch of the button
 * delegation handler.
 */
function createDiscountSelect(
    skillName: string,
    currentDiscount: number | null | undefined,
    isLocked: boolean,
): HTMLSelectElement {
    const select = document.createElement('select')
    // Tint green when the selection matches the config's locked default,
    // matching the button row's locked highlight.
    select.className = isLocked
        ? 'discount-select bg-green-600 text-white border border-green-600 rounded text-[13px] px-1 py-0.5 focus:outline-none focus:border-sky-500'
        : 'discount-select bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] px-1 py-0.5 focus:outline-none focus:border-sky-500'
    select.dataset.skill = skillName

    for (const value of DISCOUNT_OPTIONS) {
        const option = document.createElement('option')
        option.value = value === null ? '-' : value.toString()
        option.textContent = value === null ? 'None' : `${value}%`
        if (
            currentDiscount === value ||
            (value === null &&
                (currentDiscount === null || currentDiscount === undefined))
        ) {
            option.selected = true
        }
        select.appendChild(option)
    }

    select.addEventListener('change', () => {
        const discount = select.value === '-' ? null : parseInt(select.value, 10)
        setDiscountForVariants(skillName, discount)
        refreshAffectedSkillRows(skillName)
        autoSave()
    })

    return select
}

export function renderSkills(): void {
    const currentConfig = getCurrentConfig()
    if (!currentConfig) return
    const container = document.getElementById('skills-container')
    if (!container) return
    // Full rebuilds (filters, add-to-uma, rename, resize) keep the scroll
    // position so the pane doesn't jump to the top. Discount/default toggles
    // skip the rebuild entirely via refreshAffectedSkillRows(). Config switches
    // reset to the top explicitly in loadConfig().
    const scrollTop = container.scrollTop
    container.innerHTML = ''
    const skills = currentConfig.skills

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
                const baseSkill = skills[baseName] || skills[skillName]!
                if (!skills[variantName]) {
                    skills[variantName] = {
                        discount:
                            baseSkill.discount !== null &&
                            baseSkill.discount !== undefined
                                ? baseSkill.discount
                                : null,
                    }
                } else if (
                    baseSkill.discount !== null &&
                    baseSkill.discount !== undefined
                ) {
                    skills[variantName].discount = baseSkill.discount
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
                        const baseSkill = skills[skillName]!
                        if (!skills[variantName]) {
                            skills[variantName] = {
                                discount:
                                    baseSkill.discount !== null &&
                                    baseSkill.discount !== undefined
                                        ? baseSkill.discount
                                        : null,
                            }
                        } else if (
                            baseSkill.discount !== null &&
                            baseSkill.discount !== undefined
                        ) {
                            skills[variantName].discount = baseSkill.discount
                        }
                    }
                })
            }
            if (!skillsToHide.has(skillName)) {
                skillsToRender.add(skillName)
            }
        }
    })

    // Drop only the auto-generated "X (inherited)" phantoms (they have no
    // skill_data record by construction). Any other skill stays visible even
    // when its data or icon is missing, so a data problem shows up as a
    // broken row instead of a silently vanished skill.
    const sortedSkillNames = Array.from(skillsToRender)
        .filter(
            (name) =>
                isSimulatableSkill(name) || !name.endsWith(' (inherited)'),
        )
        .sort(compareSkills)

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
        const row = buildSkillRow(skillName)
        if (row) container.appendChild(row)
    })

    container.scrollTop = scrollTop

    // Event delegation is set up once via setupSkillsContainerDelegation()
}

/**
 * Build one skill row: add-to-uma button, name label, and the discount button
 * group with its lock toggle. Pure construction from current config state, so
 * renderSkills() lays out the whole list and refreshAffectedSkillRows() can
 * swap a single row in place after a discount/default change.
 */
function buildSkillRow(skillName: string): HTMLDivElement | null {
    const currentConfig = getCurrentConfig()
    if (!currentConfig) return null
    const skill = currentConfig.skills[skillName]
    if (!skill) return null
    const umaSkills = currentConfig.uma?.skills || []

    if (skill.discount === undefined) {
        skill.discount = null
    }

    const div = document.createElement('div')
    div.className =
        'skill-row flex items-center gap-2 hover:bg-zinc-800 px-1 py-0.5 rounded'
    div.dataset.skill = skillName

    const currentDiscount = skill.discount

    // Lock state: is the current discount the config's saved default? When
    // it is, the active discount highlights green (rather than the usual
    // blue) to signal the value is locked to the default.
    const skillDefault = skill.default
    const isDefaultActive =
        skillDefault !== undefined &&
        skillDefault !== null &&
        currentDiscount === skillDefault
    const isDefaultNull =
        (skillDefault === undefined || skillDefault === null) &&
        (currentDiscount === null || currentDiscount === undefined)
    const isLocked = isDefaultActive || isDefaultNull
    const activeDiscountClass = isLocked
        ? `${squareClasses} bg-green-600 text-white border border-green-600 hover:bg-green-700 hover:border-green-700`
        : `${squareClasses} bg-sky-600 text-white border border-sky-600 hover:bg-sky-700 hover:border-sky-700`

    const discountButtonGroup = document.createElement('div')
    discountButtonGroup.className = 'discount-options flex gap-1 items-center'
    discountButtonGroup.dataset.skill = skillName

    // A narrow skills pane gets a dropdown (the button row is too wide to
    // fit next to the skill name); a wide pane keeps the one-tap button row.
    if (shouldUseDiscountDropdown()) {
        discountButtonGroup.appendChild(
            createDiscountSelect(skillName, currentDiscount, isLocked),
        )
    } else {
        DISCOUNT_OPTIONS.forEach((value) => {
            const button = document.createElement('button')
            button.className = `${squareClasses} bg-zinc-700 text-zinc-200 border border-zinc-600 hover:bg-zinc-600 hover:border-zinc-500`
            button.dataset.skill = skillName
            button.dataset.discount = value === null ? '-' : value.toString()
            button.textContent = value === null ? '-' : value.toString()
            if (
                currentDiscount === value ||
                (value === null &&
                    (currentDiscount === null ||
                        currentDiscount === undefined))
            ) {
                button.className = activeDiscountClass
            }
            discountButtonGroup.appendChild(button)
        })
    }

    const lockButton = document.createElement('button')
    lockButton.className = `lock-btn ${squareClasses} bg-transparent text-zinc-500 border-none hover:text-zinc-200 hover:bg-zinc-700`
    lockButton.dataset.skill = skillName
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
        // A null discount can't be locked in, so it also removes the default.
        if (isCurrentlyDefault || currentDiscount == null) {
            updateSkillVariantsDefault(skillName, 'remove')
        } else {
            updateSkillVariantsDefault(skillName, 'set', currentDiscount)
        }
        refreshAffectedSkillRows(skillName)
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
            addSkillToUmaFromTable(skillName)
        }
        callRenderUma()
        renderSkills()
        autoSave()
    })

    const skillNameSpan = document.createElement('span')
    // truncate (with min-w-0 up the flex chain) keeps each skill on a single
    // line and ellipsizes overflow instead of wrapping to a taller row.
    skillNameSpan.className =
        'skill-name-span flex-1 min-w-0 truncate cursor-pointer hover:text-teal-400'
    skillNameSpan.textContent = skillName
    // Tooltip shows the skill's effect/condition summary; falls back to
    // the edit hint when no description is available (unknown name,
    // skill data not loaded yet).
    skillNameSpan.title =
        describeSkill(skillName) ?? 'Click to edit skill name'
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

        // Re-insert the original name span without rebuilding the list, so a
        // click that moved focus out of the input (e.g. a discount button on the
        // same row) still lands on its target. The span keeps its rename
        // listener across the detach/reattach.
        const restoreSpanInPlace = () => {
            const parent = skillNameInput.parentNode
            if (parent) {
                parent.replaceChild(spanTarget, skillNameInput)
            } else {
                renderSkills()
            }
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
                return
            }
            // Still the placeholder name: the user is setting a discount (or
            // clicked away) before naming the skill. Keep the row instead of
            // rejecting it as an unknown skill, and restore the span in place so
            // the click that triggered the blur reaches the discount control.
            if (isPlaceholderSkillName(inputName)) {
                restoreSpanInPlace()
                return
            }
            const canonicalName = getCanonicalSkillName(inputName)
            if (!isValidSkillName(canonicalName)) {
                showToast({
                    type: 'error',
                    message: `Unknown skill: "${inputName}"`,
                })
                restoreSpan()
                return
            }
            if (
                canonicalName !== originalName &&
                !currentConfig.skills[canonicalName]
            ) {
                const skillData = currentConfig.skills[originalName]!
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
                return
            }
            restoreSpan()
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
                if (!value || isPlaceholderSkillName(value)) {
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
    label.className = 'flex-1 min-w-0 m-0 flex items-center gap-2'
    const icon = createSkillIcon(skillName)
    if (icon) label.appendChild(icon)
    label.appendChild(skillNameSpan)

    div.appendChild(addToUmaButton)
    div.appendChild(label)
    div.appendChild(discountButtonGroup)

    return div
}

/**
 * Re-render only the rows touched by a discount/default change to `skillName`
 * (the skill and its ○/◎ siblings), in place, leaving the rest of the list and
 * the scroll position untouched. Falls back to a full renderSkills() when the
 * change could alter which rows are shown: the Hint / No-Hint filter keys on
 * whether a skill has a discount, which this change can flip.
 */
function refreshAffectedSkillRows(skillName: string): void {
    const container = document.getElementById('skills-container')
    const available = getAvailableFilter()
    if (!container || available === 'hint' || available === 'noHint') {
        renderSkills()
        return
    }
    const affected = new Set<string>([
        ...getDiscountVariants(skillName),
        getBaseSkillName(skillName),
    ])
    for (const name of affected) {
        const existing = container.querySelector<HTMLDivElement>(
            `.skill-row[data-skill="${CSS.escape(name)}"]`,
        )
        if (!existing) continue
        const replacement = buildSkillRow(name)
        if (!replacement) {
            renderSkills()
            return
        }
        existing.replaceWith(replacement)
    }
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

            // A null discount can't be locked in, so it also removes the
            // default.
            if (isCurrentlyDefault || currentDiscount == null) {
                updateSkillVariantsDefault(skillName, 'remove')
            } else {
                updateSkillVariantsDefault(skillName, 'set', currentDiscount)
            }
        } else {
            setDiscountForVariants(skillName, discount)
        }

        refreshAffectedSkillRows(skillName)
        autoSave()
    })
}

function updateOwnedButton(button: HTMLButtonElement): void {
    const hideOwned = getHideOwned()
    button.dataset.active = hideOwned ? 'true' : 'false'
    button.setAttribute('aria-pressed', hideOwned ? 'true' : 'false')
    button.className = hideOwned
        ? 'bg-sky-600 text-white border border-sky-600 rounded h-7 px-2 cursor-pointer transition-colors hover:bg-sky-700'
        : 'bg-zinc-700 text-zinc-200 border border-zinc-600 rounded h-7 px-2 cursor-pointer transition-colors hover:bg-zinc-600'
}

function updateAvailableSelect(select: HTMLSelectElement): void {
    select.value = getAvailableFilter()
}

// The icons toggle always shows a skill icon: full color when icons are on,
// greyscale + dimmed when off, so the button itself previews the two states.
function updateIconsButton(button: HTMLButtonElement): void {
    const showIcons = getShowIcons()
    button.dataset.active = showIcons ? 'true' : 'false'
    button.setAttribute('aria-pressed', showIcons ? 'true' : 'false')
    button.title = showIcons ? 'Hide skill icons' : 'Show skill icons'
    const img = button.querySelector('img')
    if (img) {
        img.src = getGenericSkillIconUrl()
        img.className = showIcons ? 'w-5 h-5' : 'w-5 h-5 grayscale opacity-60'
    }
}

function syncFilterControls(): void {
    const ownedButton = document.getElementById(
        'filter-owned-button',
    ) as HTMLButtonElement | null
    if (ownedButton) updateOwnedButton(ownedButton)
    const iconsButton = document.getElementById(
        'filter-icons-button',
    ) as HTMLButtonElement | null
    if (iconsButton) updateIconsButton(iconsButton)
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
    const iconsButton = document.getElementById(
        'filter-icons-button',
    ) as HTMLButtonElement | null
    if (iconsButton) {
        updateIconsButton(iconsButton)
        iconsButton.addEventListener('click', () => {
            setShowIcons(!getShowIcons())
            updateIconsButton(iconsButton)
            // Icons appear in the skill list, the uma pills, and the results
            // table, so refresh all three when the toggle flips.
            renderSkills()
            callRenderUma()
            renderResultsTable()
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
