import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    buildSkillNameLookup,
    buildVariantCache,
    getDiscountVariants,
} from './public/skillHelpers'
import { setDiscountForVariants } from './public/skillsUI'
import {
    getCalculatedResultsCache,
    getCurrentConfig,
    getResultsMap,
    setCurrentConfig,
    setSkillmeta,
    setSkillNameToId,
    setSkillnames,
} from './public/state'

vi.stubGlobal('document', {
    getElementById: () => null,
})

// Late Surger Savvy is a ○/◎ pair with no gold upgrade — the scenario the
// user reported: setting a discount on one variant should register both.
const NORMAL = 'Late Surger Savvy ○'
const RARE = 'Late Surger Savvy ◎'

describe('getDiscountVariants', () => {
    beforeAll(() => {
        setSkillmeta({
            '201541': { baseCost: 130, groupId: '20154', order: 21180 },
            '201542': { baseCost: 110, groupId: '20154', order: 21190 },
        })
        setSkillnames({
            '201541': [RARE],
            '201542': [NORMAL],
        })
        setSkillNameToId({
            [RARE]: '201541',
            [NORMAL]: '201542',
        })
        buildSkillNameLookup()
        buildVariantCache()
    })

    it('returns both siblings regardless of which one is passed', () => {
        expect(getDiscountVariants(NORMAL).sort()).toEqual([NORMAL, RARE].sort())
        expect(getDiscountVariants(RARE).sort()).toEqual([NORMAL, RARE].sort())
    })

    it('always includes the input skill first', () => {
        expect(getDiscountVariants(NORMAL)[0]).toBe(NORMAL)
        expect(getDiscountVariants(RARE)[0]).toBe(RARE)
    })
})

describe('setDiscountForVariants propagates to results map', () => {
    beforeAll(() => {
        setSkillmeta({
            '201541': { baseCost: 130, groupId: '20154', order: 21180 },
            '201542': { baseCost: 110, groupId: '20154', order: 21190 },
        })
        setSkillnames({
            '201541': [RARE],
            '201542': [NORMAL],
        })
        setSkillNameToId({
            [RARE]: '201541',
            [NORMAL]: '201542',
        })
        buildSkillNameLookup()
        buildVariantCache()
    })

    beforeEach(() => {
        setCurrentConfig({
            skills: {
                [NORMAL]: { discount: null },
                [RARE]: { discount: null },
            },
            uma: { skills: [] },
        })
        getResultsMap().clear()
        getCalculatedResultsCache().clear()
    })

    it('adding a discount to ○ registers a pending result for BOTH ○ and ◎', () => {
        // Regression test: before the fix, only the clicked skill got a pending
        // entry in the results map. ◎'s config was updated but no row was shown
        // until "Run Calculations" was clicked.
        setDiscountForVariants(NORMAL, 10)

        const results = getResultsMap()
        expect(results.get(NORMAL)?.status).toBe('pending')
        expect(results.get(RARE)?.status).toBe('pending')
    })

    it('propagates the discount to both variants in config', () => {
        setDiscountForVariants(RARE, 20)
        const config = getCurrentConfig()
        expect(config?.skills[NORMAL]?.discount).toBe(20)
        expect(config?.skills[RARE]?.discount).toBe(20)
    })

    it('clearing the discount removes BOTH entries from the results map', () => {
        setDiscountForVariants(NORMAL, 10)
        setDiscountForVariants(NORMAL, null)

        const results = getResultsMap()
        expect(results.has(NORMAL)).toBe(false)
        expect(results.has(RARE)).toBe(false)
    })

    it('changing the discount updates cost without re-queueing a sim', () => {
        // Seed a cached result so the existing-entry path runs.
        setDiscountForVariants(NORMAL, 10)
        // Promote both to fresh as if a sim had returned.
        for (const skill of [NORMAL, RARE]) {
            const entry = getResultsMap().get(skill)
            if (entry) entry.status = 'fresh'
        }

        setDiscountForVariants(NORMAL, 20)

        const results = getResultsMap()
        // Both are still present and still marked fresh; only cost/discount update.
        expect(results.get(NORMAL)?.status).toBe('fresh')
        expect(results.get(RARE)?.status).toBe('fresh')
        expect(results.get(NORMAL)?.discount).toBe(20)
        expect(results.get(RARE)?.discount).toBe(20)
    })
})
