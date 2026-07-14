import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSkillNameLookup } from './public/skillHelpers'
import {
    refreshOwnedRowsForGroup,
    restoreOwnedRows,
} from './public/resultsUI'
import { setDiscountForVariants } from './public/skillsUI'
import {
    getCalculatedResultsCache,
    getResultsMap,
    setCurrentConfig,
    setSkillmeta,
    setSkillNameToId,
    setSkillnames,
} from './public/state'
import type { SkillResult, SkillResultWithStatus } from './public/types'

// renderResultsTable reads document.getElementById and no-ops if the tbody is
// missing (same stub approach as upgrade-cascade.test.ts).
vi.stubGlobal('document', {
    getElementById: () => null,
})

const GOLD = 'Flash Forward'
const RARE = 'Medium Straightaways ◎'
const NORMAL = 'Medium Straightaways ○'
const OTHER = 'Concentration'

const ownedRow = (
    skill: string,
    action: SkillResult['ownedAction'],
): SkillResultWithStatus => ({
    skill,
    cost: -100,
    discount: 0,
    meanLength: -0.5,
    medianLength: -0.5,
    meanLengthPerCost: 0.005,
    minLength: -1,
    maxLength: 0,
    rangeLower: -1,
    rangeUpper: 0,
    ciMeanLower: -0.6,
    ciMeanUpper: -0.4,
    owned: true,
    ownedAction: action,
    hasCost: true,
    status: 'fresh',
})

const buyRow = (skill: string): SkillResultWithStatus => ({
    skill,
    cost: 100,
    discount: 0,
    meanLength: 0.5,
    medianLength: 0.5,
    meanLengthPerCost: 0.005,
    minLength: 0,
    maxLength: 1,
    rangeLower: 0,
    rangeUpper: 1,
    ciMeanLower: 0.4,
    ciMeanUpper: 0.6,
    status: 'fresh',
})

describe('discount changes update owned refunds in the group', () => {
    beforeAll(() => {
        setSkillmeta({
            '201103': { baseCost: 150, groupId: '20110', order: 20290 },
            '201101': { baseCost: 110, groupId: '20110', order: 20300 },
            '201102': { baseCost: 100, groupId: '20110', order: 20310 },
            '200011': { baseCost: 120, groupId: '20001', order: 100 },
        })
        setSkillnames({
            '201103': [GOLD],
            '201101': [RARE],
            '201102': [NORMAL],
            '200011': [OTHER],
        })
        setSkillNameToId({
            [GOLD]: '201103',
            [RARE]: '201101',
            [NORMAL]: '201102',
            [OTHER]: '200011',
        })
        buildSkillNameLookup()
    })

    beforeEach(() => {
        setCurrentConfig({
            skills: {
                [GOLD]: { discount: 10 },
                [RARE]: { discount: 10 },
                [NORMAL]: { discount: 10 },
                [OTHER]: { discount: 10 },
            },
            uma: { skills: [GOLD] },
        })
        getCalculatedResultsCache().clear()
        const results = getResultsMap()
        results.clear()
        // Uma owns the gold: removal row for it, downgrade rows for the tiers,
        // and a normal buy row in an unrelated group.
        results.set(GOLD, ownedRow(GOLD, 'remove'))
        results.set(RARE, ownedRow(RARE, 'downgrade'))
        results.set(NORMAL, ownedRow(NORMAL, 'downgrade'))
        results.set(OTHER, buyRow(OTHER))
    })

    it('updates every owned refund in place without requeueing', () => {
        refreshOwnedRowsForGroup(GOLD)
        const results = getResultsMap()
        // Stats are discount-independent, so the rows stay fresh...
        expect(results.get(GOLD)?.status).toBe('fresh')
        expect(results.get(RARE)?.status).toBe('fresh')
        expect(results.get(NORMAL)?.status).toBe('fresh')
        // ...and only the refunds recompute: full chain for the removal row
        // (10% off 150+110+100), tier difference for the downgrades.
        expect(results.get(GOLD)?.cost).toBe(-324)
        expect(results.get(GOLD)?.discount).toBe(10)
        expect(results.get(GOLD)?.hasCost).toBe(true)
        expect(results.get(RARE)?.cost).toBe(-135)
        expect(results.get(NORMAL)?.cost).toBe(-234)
        expect(results.get(GOLD)?.meanLengthPerCost).toBeCloseTo(-0.5 / -324)
        expect(results.get(OTHER)?.status).toBe('fresh')
        expect(results.get(OTHER)?.cost).toBe(100)
    })

    it('keeps the owned flags on the updated rows', () => {
        refreshOwnedRowsForGroup(NORMAL)
        const results = getResultsMap()
        expect(results.get(GOLD)?.owned).toBe(true)
        expect(results.get(GOLD)?.ownedAction).toBe('remove')
        expect(results.get(RARE)?.ownedAction).toBe('downgrade')
    })

    it('a discount change on a tier updates the whole group refunds', () => {
        setDiscountForVariants(RARE, 20)
        const results = getResultsMap()
        // The removal row's refund includes the tier's cost, so it recomputes
        // (135 + 20% off 110 + 90); no row goes back to pending.
        expect(results.get(GOLD)?.status).toBe('fresh')
        expect(results.get(GOLD)?.cost).toBe(-313)
        expect(results.get(RARE)?.status).toBe('fresh')
        expect(results.get(RARE)?.cost).toBe(-135)
        expect(results.get(NORMAL)?.cost).toBe(-223)
        expect(results.get(OTHER)?.status).toBe('fresh')
    })

    it('clearing the owned skill discount blanks the refunds', () => {
        setDiscountForVariants(GOLD, null)
        const results = getResultsMap()
        // Refund unknown: the rows stay but their cost columns blank.
        expect(results.get(GOLD)?.status).toBe('fresh')
        expect(results.get(GOLD)?.hasCost).toBe(false)
        expect(results.get(GOLD)?.cost).toBe(0)
        expect(results.get(RARE)?.hasCost).toBe(false)
        expect(results.get(NORMAL)?.hasCost).toBe(false)
    })
})

describe('Owned toggle restores cached rows without recalculating', () => {
    beforeEach(() => {
        setCurrentConfig({
            skills: {
                [GOLD]: { discount: 10 },
                [RARE]: { discount: 10 },
                [NORMAL]: { discount: 10 },
            },
            uma: { skills: [GOLD] },
            filters: { calcOwned: true },
        })
        getCalculatedResultsCache().clear()
        getResultsMap().clear()
    })

    it('re-adds cached owned rows as cached, not pending', () => {
        const cache = getCalculatedResultsCache()
        const goldRow = ownedRow(GOLD, 'remove')
        const rareRow = ownedRow(RARE, 'downgrade')
        cache.set(GOLD, goldRow)
        cache.set(RARE, rareRow)
        cache.set(NORMAL, ownedRow(NORMAL, 'downgrade'))

        restoreOwnedRows()

        const results = getResultsMap()
        expect(results.get(GOLD)?.status).toBe('cached')
        expect(results.get(GOLD)?.cost).toBe(goldRow.cost)
        expect(results.get(GOLD)?.meanLength).toBe(goldRow.meanLength)
        expect(results.get(RARE)?.status).toBe('cached')
        expect(results.get(NORMAL)?.status).toBe('cached')
    })

    it('queues rows with no cached result for calculation', () => {
        getCalculatedResultsCache().set(GOLD, ownedRow(GOLD, 'remove'))

        restoreOwnedRows()

        const results = getResultsMap()
        expect(results.get(GOLD)?.status).toBe('cached')
        // The dominated tiers have no cache entry and must be calculated.
        expect(results.get(RARE)?.status).toBe('pending')
        expect(results.get(NORMAL)?.status).toBe('pending')
    })

    it('recalculates when the cached action no longer matches', () => {
        // Cached as a removal row, but the skill is now only dominated
        // (a downgrade row): the direction changed, so the value is stale.
        getCalculatedResultsCache().set(RARE, ownedRow(RARE, 'remove'))
        getCalculatedResultsCache().set(GOLD, ownedRow(GOLD, 'remove'))

        restoreOwnedRows()

        expect(getResultsMap().get(RARE)?.status).toBe('pending')
        expect(getResultsMap().get(RARE)?.ownedAction).toBe('downgrade')
    })

    it('discount changes while the toggle is off update the cache in place', () => {
        // Toggle off: no rows in the results map, but cached owned values
        // must not be restored with a stale refund later.
        getCalculatedResultsCache().set(GOLD, ownedRow(GOLD, 'remove'))
        getCalculatedResultsCache().set(RARE, ownedRow(RARE, 'downgrade'))

        refreshOwnedRowsForGroup(GOLD)

        expect(getCalculatedResultsCache().get(GOLD)?.cost).toBe(-324)
        expect(getCalculatedResultsCache().get(RARE)?.cost).toBe(-135)
        // No rows appear (the toggle is off, results map untouched).
        expect(getResultsMap().size).toBe(0)
    })
})
