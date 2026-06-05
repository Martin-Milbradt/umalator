import { autoSave } from './configManager'
import { callRenderSkills, callRenderUma } from './renderCallbacks'
import {
    adjustSkillPoints,
    findSkillId,
    getGroupVariantOnUma,
    getSkillCostWithDiscount,
    getSkillIconUrl,
    getSkillOrder,
    isSkillOnUma,
    umaHasUpgradedVersion,
} from './skillHelpers'
import {
    getCalculatedResultsCache,
    getCurrentConfig,
    getLastCalculationTime,
    getResultsMap,
    getSelectedSkills,
    getSkillmeta,
    getSkillnames,
    getSortColumn,
    getSortDirection,
    setAutoCalculationTimeout,
    getAutoCalculationTimeout,
    isAutoCalculationInProgress,
    setAutoCalculationInProgress,
    clearAutoCalculationTimeout,
    setSortColumn,
    setSortDirection,
} from './state'
import type { SkillResult, SkillResultWithStatus } from './types'

// Forward declaration to avoid circular import - will be set by api.ts
let runSelectiveCalculationsImpl:
    | ((skillNames: string[]) => Promise<void>)
    | null = null

export function setRunSelectiveCalculations(
    fn: (skillNames: string[]) => Promise<void>,
): void {
    runSelectiveCalculationsImpl = fn
}

// Results table rendering
export function renderResultsTable(): void {
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()
    const sortColumn = getSortColumn()
    const sortDirection = getSortDirection()
    const lastCalculationTime = getLastCalculationTime()

    const tbody = document.getElementById('results-tbody')
    const countEl = document.getElementById('results-count')
    const lastRunEl = document.getElementById('results-last-run')
    if (!tbody) return

    tbody.innerHTML = ''

    // Filter out:
    // 1. Skills that are on Uma (exact match)
    // 2. Basic skills where Uma has the upgraded version
    const results = Array.from(resultsMap.values()).filter((result) => {
        // Don't show skills that are on Uma
        if (isSkillOnUma(result.skill)) return false
        // Don't show basic skills when Uma has the upgraded version
        if (umaHasUpgradedVersion(result.skill)) return false
        return true
    })

    // Clean up selectedSkills to remove any filtered-out skills
    for (const skill of selectedSkills) {
        if (isSkillOnUma(skill) || umaHasUpgradedVersion(skill)) {
            selectedSkills.delete(skill)
        }
    }

    if (results.length === 0) {
        if (countEl) countEl.textContent = 'No results yet'
        updateTotalsRow()
        return
    }

    // Sort results
    results.sort((a, b) => {
        const aVal = a[sortColumn]
        const bVal = b[sortColumn]
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortDirection === 'asc'
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal)
        }
        const aNum = Number(aVal)
        const bNum = Number(bVal)
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
    })

    for (const result of results) {
        const row = document.createElement('tr')
        row.className =
            'border-b border-zinc-700 hover:bg-zinc-700 ' +
            (result.status === 'pending' ? 'opacity-50' : '')
        row.dataset.skill = result.skill

        // Checkbox cell
        const checkCell = document.createElement('td')
        checkCell.className = 'p-1'
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.checked = selectedSkills.has(result.skill)
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedSkills.add(result.skill)
            } else {
                selectedSkills.delete(result.skill)
            }
            updateTotalsRow()
            updateSelectAllCheckbox()
        })
        checkCell.appendChild(checkbox)
        row.appendChild(checkCell)

        // Add to Uma button cell
        const addCell = document.createElement('td')
        addCell.className = 'p-1'
        const addBtn = document.createElement('button')
        addBtn.className =
            'bg-sky-600 text-white border-none rounded w-5 h-5 text-sm leading-none cursor-pointer flex items-center justify-center p-0 transition-colors hover:bg-sky-700 active:bg-sky-800'
        addBtn.textContent = '+'
        addBtn.title = 'Add to Uma skills'
        addBtn.addEventListener('click', () => {
            addSkillToUmaFromTable(result.skill, result.cost)
        })
        addCell.appendChild(addBtn)
        row.appendChild(addCell)

        // Skill name
        const skillCell = document.createElement('td')
        skillCell.className = 'p-1'
        const iconUrl = getSkillIconUrl(result.skill)
        if (iconUrl) {
            const wrapper = document.createElement('div')
            wrapper.className = 'flex items-center gap-1'
            const img = document.createElement('img')
            img.src = iconUrl
            img.className = 'w-5 h-5 shrink-0'
            img.alt = ''
            const text = document.createElement('span')
            text.textContent = result.skill
            wrapper.appendChild(img)
            wrapper.appendChild(text)
            skillCell.appendChild(wrapper)
        } else {
            skillCell.textContent = result.skill
        }
        row.appendChild(skillCell)

        // Cost
        const costCell = document.createElement('td')
        costCell.className = 'p-1 text-right'
        costCell.textContent = result.cost.toString()
        row.appendChild(costCell)

        // Discount
        const discountCell = document.createElement('td')
        discountCell.className = 'p-1 text-right'
        discountCell.textContent =
            result.discount > 0 ? `${result.discount}%` : '-'
        row.appendChild(discountCell)

        // Mean
        const meanCell = document.createElement('td')
        meanCell.className = 'p-1 text-right'
        meanCell.textContent =
            result.status === 'pending' ? '...' : result.meanLength.toFixed(2)
        row.appendChild(meanCell)

        // Median
        const medianCell = document.createElement('td')
        medianCell.className = 'p-1 text-right'
        medianCell.textContent =
            result.status === 'pending' ? '...' : result.medianLength.toFixed(2)
        row.appendChild(medianCell)

        // Mean/Cost
        const effCell = document.createElement('td')
        effCell.className = 'p-1 text-right'
        effCell.textContent =
            result.status === 'pending'
                ? '...'
                : (result.meanLengthPerCost * 1000).toFixed(2)
        row.appendChild(effCell)

        // Min-Max
        const minMaxCell = document.createElement('td')
        minMaxCell.className = 'p-1 text-right'
        minMaxCell.textContent =
            result.status === 'pending'
                ? '...'
                : `${result.minLength.toFixed(2)}-${result.maxLength.toFixed(2)}`
        row.appendChild(minMaxCell)

        // CI
        const ciCell = document.createElement('td')
        ciCell.className = 'p-1 text-right'
        ciCell.textContent =
            result.status === 'pending'
                ? '...'
                : `${result.ciLower.toFixed(2)}-${result.ciUpper.toFixed(2)}`
        row.appendChild(ciCell)

        tbody.appendChild(row)
    }

    // Update count
    const completedCount = results.filter((r) => r.status !== 'pending').length
    if (countEl) {
        countEl.textContent = `Calculated ${completedCount}/${results.length} skills`
    }

    // Update last run time
    if (lastRunEl && lastCalculationTime) {
        lastRunEl.textContent = `Last run: ${lastCalculationTime.toLocaleTimeString()}`
    }

    updateTotalsRow()
}

export function updateTotalsRow(): void {
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()

    const totalsDiv = document.getElementById('results-totals')
    const costEl = document.getElementById('totals-cost')
    const meanEl = document.getElementById('totals-mean')
    const effEl = document.getElementById('totals-efficiency')
    const minmaxEl = document.getElementById('totals-minmax')
    if (!totalsDiv || !costEl || !meanEl || !effEl || !minmaxEl) return

    if (selectedSkills.size < 2) {
        totalsDiv.classList.add('hidden')
        return
    }

    totalsDiv.classList.remove('hidden')

    let totalCost = 0
    let totalMean = 0
    let totalMin = 0
    let totalMax = 0
    let validCount = 0

    for (const skillName of selectedSkills) {
        const result = resultsMap.get(skillName)
        if (result && result.status !== 'pending') {
            totalCost += result.cost
            totalMean += result.meanLength
            totalMin += result.minLength
            totalMax += result.maxLength
            validCount++
        }
    }

    if (validCount === 0) {
        totalsDiv.classList.add('hidden')
        return
    }

    const totalEfficiency = totalCost > 0 ? (totalMean / totalCost) * 1000 : 0

    costEl.textContent = `Cost: ${totalCost}`
    meanEl.textContent = `Mean: ${totalMean.toFixed(2)}`
    effEl.textContent = `Mean/Cost: ${totalEfficiency.toFixed(2)}`
    minmaxEl.textContent = `Min-Max: ${totalMin.toFixed(2)}-${totalMax.toFixed(2)}`
}

export function updateSelectAllCheckbox(): void {
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()

    const checkbox = document.getElementById(
        'select-all-checkbox',
    ) as HTMLInputElement | null
    if (!checkbox) return

    const allSkills = Array.from(resultsMap.keys())
    if (allSkills.length === 0) {
        checkbox.checked = false
        checkbox.indeterminate = false
        return
    }

    const selectedCount = allSkills.filter((s) => selectedSkills.has(s)).length
    checkbox.checked = selectedCount === allSkills.length
    checkbox.indeterminate =
        selectedCount > 0 && selectedCount < allSkills.length
}

export function addSkillToUmaFromTable(skillName: string, cost: number): void {
    const currentConfig = getCurrentConfig()
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()

    if (!currentConfig) return
    if (!currentConfig.uma) {
        currentConfig.uma = {}
    }
    if (!currentConfig.uma.skills) {
        currentConfig.uma.skills = []
    }

    // Check if skill is already on Uma
    if (currentConfig.uma.skills.includes(skillName)) return

    // Check if a variant from the same group is already on Uma
    const existingVariant = getGroupVariantOnUma(skillName)
    const existingVariantOrder = existingVariant
        ? getSkillOrder(existingVariant)
        : 0
    const newSkillOrder = getSkillOrder(skillName)

    if (existingVariant) {
        adjustSkillPoints(getSkillCostWithDiscount(existingVariant))
        const idx = currentConfig.uma.skills.indexOf(existingVariant)
        if (idx !== -1) {
            currentConfig.uma.skills[idx] = skillName
        }
    } else {
        currentConfig.uma.skills.push(skillName)
    }

    adjustSkillPoints(-cost)

    refreshGroupResults(skillName)

    // Re-render
    refreshResultsCosts()
    callRenderUma()
    callRenderSkills()
    autoSave()
}

export function removeSkillFromUma(skillName: string): void {
    const currentConfig = getCurrentConfig()
    if (!currentConfig?.uma?.skills) return

    const skillIndex = currentConfig.uma.skills.indexOf(skillName)
    if (skillIndex === -1) return

    const skillCost = getSkillCostWithDiscount(skillName)
    currentConfig.uma.skills.splice(skillIndex, 1)
    adjustSkillPoints(skillCost)

    refreshGroupResults(skillName)

    // Refresh costs since Uma skills changed
    refreshResultsCosts()
    renderResultsTable()
    callRenderUma()
    callRenderSkills()
    autoSave()
}

// Update results table when discount changes
export function updateResultsForDiscountChange(
    skillName: string,
    oldDiscount: number | null | undefined,
    newDiscount: number | null,
): void {
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()

    const hadDiscount = oldDiscount !== null && oldDiscount !== undefined
    const hasDiscount = newDiscount !== null

    if (hadDiscount && !hasDiscount) {
        // discount -> None: remove skill from table
        resultsMap.delete(skillName)
        selectedSkills.delete(skillName)
        renderResultsTable()
    } else if (!hadDiscount && hasDiscount) {
        // None -> discount: add skill as pending (needs calculation)
        addPendingSkillToResults(skillName, newDiscount)
    } else if (hadDiscount && hasDiscount && oldDiscount !== newDiscount) {
        // discount -> discount: update cost and mean/cost
        const existing = resultsMap.get(skillName)
        if (existing && existing.status !== 'pending') {
            const newCost = getSkillCostWithDiscount(skillName)
            existing.cost = newCost
            existing.discount = newDiscount
            existing.meanLengthPerCost =
                newCost > 0 ? existing.meanLength / newCost : 0
            renderResultsTable()
        }
    }
}

/**
 * Recalculate all costs in resultsMap when Uma's skills change.
 * This is needed because prerequisite costs depend on what skills Uma has.
 */
export function refreshResultsCosts(): void {
    const resultsMap = getResultsMap()
    for (const [skillName, result] of resultsMap) {
        if (result.status !== 'pending') {
            const newCost = getSkillCostWithDiscount(skillName)
            result.cost = newCost
            result.meanLengthPerCost =
                newCost > 0 ? result.meanLength / newCost : 0
        }
    }
    renderResultsTable()
}

/**
 * Refresh the results table for every sibling in `skillName`'s group after a change
 * to `currentConfig.uma.skills`. Call *after* updating `uma.skills`; reads the
 * updated state to decide what should be shown.
 *
 * For each group member:
 *   - Invalidate the frontend cache. It is keyed only by skill name, so any change
 *     to the Uma's skills can invalidate the baseline the cached result was
 *     simulated against.
 *   - If the sibling is now on Uma or dominated by a more-upgraded Uma skill, leave
 *     it out of the results map. The renderResultsTable filter hides such entries
 *     anyway; skipping them here avoids a wasted re-simulation.
 *   - Otherwise, ensure the sibling is in the results map via
 *     `returnSkillToResultsTable`, which hydrates from cache or marks it pending.
 *
 * Safe to call on a skill with no group (no-op) and on a skill being added to or
 * removed from Uma (the skill itself is treated like any other sibling).
 */
export function refreshGroupResults(skillName: string): void {
    const skillmeta = getSkillmeta()
    const skillnames = getSkillnames()
    const calculatedResultsCache = getCalculatedResultsCache()
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()

    if (!skillmeta || !skillnames) return

    const skillId = findSkillId(skillName)
    if (!skillId) return

    const groupId = skillmeta[skillId]?.groupId
    if (!groupId) {
        calculatedResultsCache.delete(skillName)
        return
    }

    for (const [siblingId, siblingMeta] of Object.entries(skillmeta)) {
        if (siblingMeta.groupId !== groupId) continue
        const siblingName = skillnames[siblingId]?.[0]
        if (!siblingName) continue

        calculatedResultsCache.delete(siblingName)

        if (isSkillOnUma(siblingName) || umaHasUpgradedVersion(siblingName)) {
            resultsMap.delete(siblingName)
            selectedSkills.delete(siblingName)
            continue
        }
        void returnSkillToResultsTable(siblingName)
    }
}

/**
 * Add a skill back to the results table when removed from Uma.
 * Checks frontend cache first, then server cache; otherwise adds as pending.
 * Only adds if the skill has a discount set.
 */
export async function returnSkillToResultsTable(
    skillName: string,
): Promise<void> {
    const currentConfig = getCurrentConfig()
    const calculatedResultsCache = getCalculatedResultsCache()
    const resultsMap = getResultsMap()

    if (!currentConfig?.skills) return

    const skillConfig = currentConfig.skills[skillName]
    if (
        !skillConfig ||
        skillConfig.discount === null ||
        skillConfig.discount === undefined
    ) {
        return
    }

    // Check frontend cache first (most likely to have recent results)
    const cachedResult = calculatedResultsCache.get(skillName)
    if (cachedResult) {
        // Recalculate cost with current discount and prerequisites
        const cost = getSkillCostWithDiscount(skillName)
        resultsMap.set(skillName, {
            ...cachedResult,
            skill: skillName,
            cost,
            discount: skillConfig.discount,
            meanLengthPerCost: cost > 0 ? cachedResult.meanLength / cost : 0,
            status: 'cached',
        })
        renderResultsTable()
        return
    }

    // Not in frontend cache, add as pending (will trigger auto-calculation)
    addPendingSkillToResults(skillName, skillConfig.discount)
}

export function addPendingSkillToResults(
    skillName: string,
    discount: number,
): void {
    const resultsMap = getResultsMap()
    const cost = getSkillCostWithDiscount(skillName)
    resultsMap.set(skillName, {
        skill: skillName,
        cost,
        discount,
        meanLength: 0,
        medianLength: 0,
        meanLengthPerCost: 0,
        minLength: 0,
        maxLength: 0,
        ciLower: 0,
        ciUpper: 0,
        status: 'pending',
    })
    renderResultsTable()
    // Schedule auto-calculation for pending skills
    scheduleAutoCalculation()
}

// Debounced auto-calculation for pending skills
export function scheduleAutoCalculation(): void {
    clearAutoCalculationTimeout()
    setAutoCalculationTimeout(
        setTimeout(() => {
            setAutoCalculationTimeout(null)
            void calculatePendingSkills()
        }, 300),
    )
}

export async function calculatePendingSkills(): Promise<void> {
    const resultsMap = getResultsMap()
    const calculatedResultsCache = getCalculatedResultsCache()

    // Prevent overlapping calculations
    if (isAutoCalculationInProgress()) return
    setAutoCalculationInProgress(true)

    try {
        // Check if there are any pending skills
        const pendingSkills = Array.from(resultsMap.values()).filter(
            (r) => r.status === 'pending',
        )
        if (pendingSkills.length === 0) return

        // For each pending skill, check frontend cache first
        for (const pending of pendingSkills) {
            const cachedResult = calculatedResultsCache.get(pending.skill)
            if (cachedResult) {
                const cost = getSkillCostWithDiscount(pending.skill)
                resultsMap.set(pending.skill, {
                    ...cachedResult,
                    skill: pending.skill,
                    cost,
                    discount: pending.discount,
                    meanLengthPerCost:
                        cost > 0 ? cachedResult.meanLength / cost : 0,
                    status: 'cached',
                })
            }
        }

        renderResultsTable()

        // If still have pending skills after cache check, they need full calculation
        const stillPending = Array.from(resultsMap.values()).filter(
            (r) => r.status === 'pending',
        )
        if (stillPending.length > 0 && runSelectiveCalculationsImpl) {
            // Run selective calculation for only the pending skills
            const pendingSkillNames = stillPending.map((r) => r.skill)
            await runSelectiveCalculationsImpl(pendingSkillNames)
        }
    } finally {
        setAutoCalculationInProgress(false)
        // Check if more skills became pending while we were calculating
        const newPending = Array.from(resultsMap.values()).filter(
            (r) => r.status === 'pending',
        )
        if (newPending.length > 0) {
            scheduleAutoCalculation()
        }
    }
}

// Set up results table sorting
export function setupResultsTableSorting(): void {
    const table = document.getElementById('results-table')
    if (!table) return

    table.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        const sortKey = target.dataset.sort as keyof SkillResult | undefined
        if (!sortKey) return

        if (getSortColumn() === sortKey) {
            setSortDirection(getSortDirection() === 'asc' ? 'desc' : 'asc')
        } else {
            setSortColumn(sortKey)
            setSortDirection(sortKey === 'skill' ? 'asc' : 'desc')
        }
        renderResultsTable()
    })
}

// Set up select-all checkbox
export function setupSelectAllCheckbox(): void {
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()

    const checkbox = document.getElementById(
        'select-all-checkbox',
    ) as HTMLInputElement | null
    if (!checkbox) return

    checkbox.addEventListener('change', () => {
        const allSkills = Array.from(resultsMap.keys())
        if (checkbox.checked) {
            for (const s of allSkills) selectedSkills.add(s)
        } else {
            selectedSkills.clear()
        }
        renderResultsTable()
    })
}
