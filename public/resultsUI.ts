import { saveResults } from './configStore'
import { autoSave } from './configManager'
import {
    callRenderSkills,
    callRenderUma,
    registerRenderResults,
} from './renderCallbacks'
import {
    adjustSkillPoints,
    createSkillIcon,
    findSkillId,
    getGroupVariantOnUma,
    getSkillCostWithDiscount,
    getSkillOrder,
    isSkillOnUma,
    umaHasUpgradedVersion,
} from './skillHelpers'
import {
    getCalculatedResultsCache,
    getCurrentConfig,
    getCurrentConfigFile,
    getResultsMap,
    getSelectedSkills,
    getSkillData,
    getSkillmeta,
    getSkillnames,
    getSortColumn,
    getSortDirection,
    hasUmaUndo,
    popUmaUndoSnapshot,
    pushUmaUndoSnapshot,
    setAutoCalculationTimeout,
    getAutoCalculationTimeout,
    isAutoCalculationInProgress,
    setAutoCalculationInProgress,
    clearAutoCalculationTimeout,
    setSortColumn,
    setSortDirection,
} from './state'
import type { SkillResult, SkillResultWithStatus } from './types'

function getCalcOwned(): boolean {
    return getCurrentConfig()?.filters?.calcOwned ?? true
}

/** Snapshot the uma's skill state so the header Undo button can restore it. */
function recordUmaUndoSnapshot(): void {
    const uma = getCurrentConfig()?.uma
    pushUmaUndoSnapshot({
        skills: [...(uma?.skills ?? [])],
        skillPoints: uma?.skillPoints,
        uniqueDisabled: uma?.uniqueDisabled,
    })
    updateUndoButton()
}

function updateUndoButton(): void {
    const btn = document.getElementById(
        'undo-uma-btn',
    ) as HTMLButtonElement | null
    if (btn) btn.disabled = !hasUmaUndo()
}

// Render a "lo-hi" interval to two decimals.
function formatInterval(lo: number, hi: number): string {
    return `${lo.toFixed(2)}-${hi.toFixed(2)}`
}

// Persist the current table to IndexedDB (debounced) so it reappears on the next
// load without recomputing. Only completed rows are stored; pending/error rows
// are transient. Keyed by the open config.
let resultsSaveTimeout: ReturnType<typeof setTimeout> | null = null
function persistResults(): void {
    if (resultsSaveTimeout) clearTimeout(resultsSaveTimeout)
    resultsSaveTimeout = setTimeout(() => {
        resultsSaveTimeout = null
        const configFile = getCurrentConfigFile()
        if (!configFile) return
        const results: SkillResult[] = []
        for (const row of getResultsMap().values()) {
            if (row.status === 'pending' || row.status === 'error') continue
            const {
                status: _status,
                rawResults: _rawResults,
                errorMessage: _errorMessage,
                ...plain
            } = row
            results.push(plain)
        }
        void saveResults(configFile, results).catch((error) => {
            console.warn('Failed to persist results:', error)
        })
    }, 500)
}

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
    const calcOwned = getCalcOwned()

    const tbody = document.getElementById('results-tbody')
    const countEl = document.getElementById('results-count')
    if (!tbody) return

    tbody.innerHTML = ''

    // Keep the header checkbox and undo button in sync with the loaded config.
    const calcOwnedCheckbox = document.getElementById(
        'calc-owned-checkbox',
    ) as HTMLInputElement | null
    if (calcOwnedCheckbox) calcOwnedCheckbox.checked = calcOwned
    updateUndoButton()

    const results = Array.from(resultsMap.values()).filter((result) => {
        // Owned rows (removal/downgrade/unique) are gated by the header
        // checkbox; the unique re-enable row always shows so a disabled
        // unique can't get stranded.
        if (result.owned) {
            return calcOwned || result.ownedAction === 'enable-unique'
        }
        // Stale buy rows for skills that are now on Uma (or dominated by an
        // upgraded version) hide until recalculation replaces them.
        if (isSkillOnUma(result.skill)) return false
        if (umaHasUpgradedVersion(result.skill)) return false
        return true
    })

    // Clean up selectedSkills to remove any filtered-out skills
    for (const skill of selectedSkills) {
        if (
            !resultsMap.get(skill)?.owned &&
            (isSkillOnUma(skill) || umaHasUpgradedVersion(skill))
        ) {
            selectedSkills.delete(skill)
        }
    }

    if (results.length === 0) {
        if (countEl) countEl.textContent = 'No results yet'
        updateTotalsRow()
        persistResults()
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
            (result.status === 'pending' ? 'opacity-50' : '') +
            // Grey out uma-state rows to set them apart from buy candidates.
            (result.owned ? ' text-zinc-500' : '')
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

        // Uma action button cell: add for buy rows; remove / downgrade /
        // unique toggle for owned rows.
        const addCell = document.createElement('td')
        addCell.className = 'p-1'
        const addBtn = document.createElement('button')
        const btnBase =
            'text-white border-none rounded w-5 h-5 text-sm leading-none cursor-pointer flex items-center justify-center p-0 transition-colors'
        const action = result.owned ? result.ownedAction : undefined
        if (action === 'remove' || action === 'disable-unique') {
            addBtn.className = `${btnBase} bg-red-600 hover:bg-red-700 active:bg-red-800`
            addBtn.textContent = '-'
            addBtn.title =
                action === 'remove'
                    ? 'Remove from Uma skills'
                    : 'Disable the unique skill'
            addBtn.setAttribute(
                'aria-label',
                `Remove ${result.skill} from uma skills`,
            )
            addBtn.addEventListener('click', () => {
                if (action === 'remove') {
                    removeSkillFromUma(result.skill)
                } else {
                    setUniqueDisabled(true)
                }
            })
        } else if (action === 'downgrade' || action === 'enable-unique') {
            addBtn.className = `${btnBase} bg-green-600 hover:bg-green-700 active:bg-green-800`
            addBtn.textContent = '+'
            addBtn.title =
                action === 'downgrade'
                    ? 'Downgrade to this version'
                    : 'Re-enable the unique skill'
            addBtn.setAttribute(
                'aria-label',
                `Switch uma skills to ${result.skill}`,
            )
            addBtn.addEventListener('click', () => {
                if (action === 'downgrade') {
                    addSkillToUmaFromTable(
                        result.skill,
                        getSkillCostWithDiscount(result.skill),
                    )
                } else {
                    setUniqueDisabled(false)
                }
            })
        } else {
            addBtn.className = `${btnBase} bg-sky-600 hover:bg-sky-700 active:bg-sky-800`
            addBtn.textContent = '+'
            addBtn.title = 'Add to Uma skills'
            addBtn.setAttribute(
                'aria-label',
                `Add ${result.skill} to uma skills`,
            )
            addBtn.addEventListener('click', () => {
                addSkillToUmaFromTable(result.skill, result.cost)
            })
        }
        addCell.appendChild(addBtn)
        row.appendChild(addCell)

        // Skill name
        const skillCell = document.createElement('td')
        skillCell.className = 'p-1'
        const icon = createSkillIcon(result.skill)
        if (icon) {
            const wrapper = document.createElement('div')
            wrapper.className = 'flex items-center gap-1'
            const text = document.createElement('span')
            text.textContent = result.skill
            wrapper.appendChild(icon)
            wrapper.appendChild(text)
            skillCell.appendChild(wrapper)
        } else {
            skillCell.textContent = result.skill
        }
        row.appendChild(skillCell)

        // Cost: blank for owned rows without a known refund (skill absent
        // from the skills table or set to "-") and for the unique.
        const costHidden = result.owned === true && result.hasCost !== true
        const costCell = document.createElement('td')
        costCell.className = 'p-1 text-right'
        costCell.textContent = costHidden ? '-' : result.cost.toString()
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
                : costHidden
                  ? '-'
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

        // Range: central percentile band of per-race outcomes (spread).
        const rangeCell = document.createElement('td')
        rangeCell.className = 'p-1 text-right'
        rangeCell.textContent =
            result.status === 'pending'
                ? '...'
                : formatInterval(result.rangeLower, result.rangeUpper)
        row.appendChild(rangeCell)

        // Mean CI: confidence interval of the mean gain (precision of the mean).
        const ciMeanCell = document.createElement('td')
        ciMeanCell.className = 'p-1 text-right'
        ciMeanCell.textContent =
            result.status === 'pending'
                ? '...'
                : formatInterval(result.ciMeanLower, result.ciMeanUpper)
        row.appendChild(ciMeanCell)

        tbody.appendChild(row)
    }

    // Update count
    const completedCount = results.filter((r) => r.status !== 'pending').length
    if (countEl) {
        countEl.textContent = `Calculated ${completedCount}/${results.length} skills`
    }

    updateTotalsRow()
    persistResults()
}

// Re-render the results table from the current state. Registered so config
// loading can restore persisted results without a circular import.
registerRenderResults(renderResultsTable)

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

    recordUmaUndoSnapshot()

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

    recordUmaUndoSnapshot()

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

    // An owned row's discount only affects its refund; recompute via a fresh
    // simulation pass instead of the buy-cost paths below (the row itself
    // stays regardless of table membership).
    const existingRow = resultsMap.get(skillName)
    if (existingRow?.owned) {
        addPendingOwnedRow(skillName, existingRow.ownedAction ?? 'remove')
        return
    }

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
        // Owned rows carry a negated refund, not a buy cost; they are
        // recomputed by the next simulation instead.
        if (result.status !== 'pending' && !result.owned) {
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

    const calcOwned = getCalcOwned()
    const skillDataMap = getSkillData()
    for (const [siblingId, siblingMeta] of Object.entries(skillmeta)) {
        if (siblingMeta.groupId !== groupId) continue
        const siblingName = skillnames[siblingId]?.[0]
        if (!siblingName) continue

        calculatedResultsCache.delete(siblingName)

        // Purple variants and phantom entries never get rows of any kind.
        const simulatable =
            (siblingMeta.score ?? 1) >= 0 &&
            (!skillDataMap || siblingId in skillDataMap)
        const owned = isSkillOnUma(siblingName)
        const dominated = !owned && umaHasUpgradedVersion(siblingName)
        if (owned || dominated) {
            if (calcOwned && simulatable) {
                addPendingOwnedRow(siblingName, owned ? 'remove' : 'downgrade')
            } else {
                resultsMap.delete(siblingName)
                selectedSkills.delete(siblingName)
            }
            continue
        }
        // A sibling that is no longer owned/dominated must not keep a stale
        // owned row (e.g. right after a removal).
        if (resultsMap.get(siblingName)?.owned) {
            resultsMap.delete(siblingName)
            selectedSkills.delete(siblingName)
        }
        void returnSkillToResultsTable(siblingName)
    }
}

/**
 * Requeue every owned row in `skillName`'s group. Their refunds depend on the
 * discounts of all tiers in the group (a gold's refund includes the white
 * prerequisite, a downgrade's refund is the tier difference), so any discount
 * change in the group invalidates them — mirroring how buy rows update.
 */
export function refreshOwnedRowsForGroup(skillName: string): void {
    const skillmeta = getSkillmeta()
    const skillnames = getSkillnames()
    const resultsMap = getResultsMap()
    if (!skillmeta || !skillnames) return
    const skillId = findSkillId(skillName)
    const groupId = skillId ? skillmeta[skillId]?.groupId : null
    if (!groupId) return
    for (const [siblingId, siblingMeta] of Object.entries(skillmeta)) {
        if (siblingMeta.groupId !== groupId) continue
        const siblingName = skillnames[siblingId]?.[0]
        if (!siblingName) continue
        const row = resultsMap.get(siblingName)
        if (row?.owned) {
            getCalculatedResultsCache().delete(siblingName)
            addPendingOwnedRow(siblingName, row.ownedAction ?? 'remove')
        } else if (getCalculatedResultsCache().get(siblingName)?.owned) {
            // The Owned toggle is off (no row), but a cached owned result
            // would otherwise be restored with a stale refund later.
            getCalculatedResultsCache().delete(siblingName)
        }
    }
}

/**
 * Insert a pending owned row (removal/downgrade/unique toggle); the next
 * calculation pass fills in the negated stats and refund.
 */
function addPendingOwnedRow(
    skillName: string,
    action: NonNullable<SkillResult['ownedAction']>,
): void {
    getResultsMap().set(skillName, {
        skill: skillName,
        cost: 0,
        discount: 0,
        meanLength: 0,
        medianLength: 0,
        meanLengthPerCost: 0,
        minLength: 0,
        maxLength: 0,
        rangeLower: 0,
        rangeUpper: 0,
        ciMeanLower: 0,
        ciMeanUpper: 0,
        owned: true,
        ownedAction: action,
        hasCost: false,
        status: 'pending',
    })
    renderResultsTable()
    scheduleAutoCalculation()
}

/** Display name of the configured unique (matches simulation row naming). */
function uniqueDisplayName(): string | null {
    const unique = getCurrentConfig()?.uma?.unique
    if (!unique) return null
    const id = findSkillId(unique)
    return (id && getSkillnames()?.[id]?.[0]) || unique
}

/** Invalidate and re-queue the unique's disable/enable row. */
function refreshUniqueRow(): void {
    const config = getCurrentConfig()
    const name = uniqueDisplayName()
    if (!name) return
    getCalculatedResultsCache().delete(name)
    const disabled = config?.uma?.uniqueDisabled ?? false
    if (disabled || getCalcOwned()) {
        addPendingOwnedRow(name, disabled ? 'enable-unique' : 'disable-unique')
    } else {
        getResultsMap().delete(name)
        getSelectedSkills().delete(name)
    }
}

/** Disable or re-enable the uma's unique skill (greyed in the uma block). */
export function setUniqueDisabled(disabled: boolean): void {
    const config = getCurrentConfig()
    if (!config?.uma?.unique) return
    if ((config.uma.uniqueDisabled ?? false) === disabled) return
    recordUmaUndoSnapshot()
    config.uma.uniqueDisabled = disabled
    refreshUniqueRow()
    renderResultsTable()
    callRenderUma()
    autoSave()
}

/** Restore the uma skill state from before the last add/remove/replace. */
export function undoLastUmaAction(): void {
    const snapshot = popUmaUndoSnapshot()
    if (!snapshot) return
    const config = getCurrentConfig()
    if (!config) return
    if (!config.uma) config.uma = {}
    const before = new Set(config.uma.skills ?? [])
    const after = new Set(snapshot.skills)
    const uniqueToggled =
        (config.uma.uniqueDisabled ?? false) !==
        (snapshot.uniqueDisabled ?? false)
    config.uma.skills = [...snapshot.skills]
    config.uma.skillPoints = snapshot.skillPoints
    config.uma.uniqueDisabled = snapshot.uniqueDisabled
    for (const skill of new Set([...before, ...after])) {
        if (before.has(skill) !== after.has(skill)) {
            refreshGroupResults(skill)
        }
    }
    if (uniqueToggled) refreshUniqueRow()
    refreshResultsCosts()
    callRenderUma()
    callRenderSkills()
    autoSave()
    updateUndoButton()
}

/**
 * Enumerate the owned rows the current uma state implies: a removal row per
 * owned skill, a downgrade row per dominated group tier, and the unique's
 * disable/re-enable row. Mirrors the row set a calculation run produces.
 */
function forEachOwnedRow(
    callback: (
        skillName: string,
        action: NonNullable<SkillResult['ownedAction']>,
    ) => void,
): void {
    const config = getCurrentConfig()
    const skillmeta = getSkillmeta()
    const skillnames = getSkillnames()
    const skillDataMap = getSkillData()
    if (!config || !skillmeta || !skillnames) return
    const seen = new Set<string>()
    for (const umaSkill of config.uma?.skills ?? []) {
        const skillId = findSkillId(umaSkill)
        if (!skillId) continue
        const groupId = skillmeta[skillId]?.groupId
        if (!groupId) {
            const name = skillnames[skillId]?.[0] ?? umaSkill
            if (!seen.has(name)) {
                seen.add(name)
                callback(name, 'remove')
            }
            continue
        }
        for (const [siblingId, siblingMeta] of Object.entries(skillmeta)) {
            if (siblingMeta.groupId !== groupId) continue
            const name = skillnames[siblingId]?.[0]
            if (!name || seen.has(name)) continue
            const simulatable =
                (siblingMeta.score ?? 1) >= 0 &&
                (!skillDataMap || siblingId in skillDataMap)
            if (!simulatable) continue
            if (isSkillOnUma(name)) {
                seen.add(name)
                callback(name, 'remove')
            } else if (umaHasUpgradedVersion(name)) {
                seen.add(name)
                callback(name, 'downgrade')
            }
        }
    }
    const uniqueName = uniqueDisplayName()
    if (uniqueName && !seen.has(uniqueName)) {
        callback(
            uniqueName,
            (config.uma?.uniqueDisabled ?? false)
                ? 'enable-unique'
                : 'disable-unique',
        )
    }
}

/**
 * Re-add all owned rows when the header checkbox turns on. Previously
 * calculated values are restored from the cache; only rows without a cached
 * result (or whose action flipped since) are queued for calculation.
 */
export function restoreOwnedRows(): void {
    const cache = getCalculatedResultsCache()
    const resultsMap = getResultsMap()
    forEachOwnedRow((skillName, action) => {
        const cached = cache.get(skillName)
        if (cached?.owned && cached.ownedAction === action) {
            resultsMap.set(skillName, { ...cached, status: 'cached' })
        } else {
            addPendingOwnedRow(skillName, action)
        }
    })
}

/** Wire the header Undo button and the "Owned" calculation checkbox. */
export function setupResultsHeaderControls(): void {
    const undoBtn = document.getElementById(
        'undo-uma-btn',
    ) as HTMLButtonElement | null
    undoBtn?.addEventListener('click', () => {
        undoLastUmaAction()
    })

    const checkbox = document.getElementById(
        'calc-owned-checkbox',
    ) as HTMLInputElement | null
    checkbox?.addEventListener('change', () => {
        const config = getCurrentConfig()
        if (!config) return
        if (!config.filters) config.filters = {}
        config.filters.calcOwned = checkbox.checked
        if (checkbox.checked) {
            restoreOwnedRows()
        } else {
            const resultsMap = getResultsMap()
            const selectedSkills = getSelectedSkills()
            for (const [name, row] of resultsMap) {
                if (row.owned && row.ownedAction !== 'enable-unique') {
                    resultsMap.delete(name)
                    selectedSkills.delete(name)
                }
            }
        }
        renderResultsTable()
        autoSave()
    })
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
        rangeLower: 0,
        rangeUpper: 0,
        ciMeanLower: 0,
        ciMeanUpper: 0,
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
            if (!cachedResult) continue
            // Owned rows carry negated stats and a refund cost; reuse them
            // as-is (getSkillCostWithDiscount would compute a buy cost).
            if (cachedResult.owned || pending.owned) {
                if (cachedResult.owned && pending.owned) {
                    resultsMap.set(pending.skill, {
                        ...cachedResult,
                        skill: pending.skill,
                        status: 'cached',
                    })
                }
                continue
            }
            const cost = getSkillCostWithDiscount(pending.skill)
            resultsMap.set(pending.skill, {
                ...cachedResult,
                skill: pending.skill,
                cost,
                discount: pending.discount,
                meanLengthPerCost: cost > 0 ? cachedResult.meanLength / cost : 0,
                status: 'cached',
            })
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
