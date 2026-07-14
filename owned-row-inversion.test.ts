import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSkillNameLookup } from './public/skillHelpers'
import { addSkillToUmaFromTable, removeSkillFromUma } from './public/resultsUI'
import {
    getCalculatedResultsCache,
    getCurrentConfig,
    getResultsMap,
    setCurrentConfig,
    setSkillmeta,
    setSkillNameToId,
    setSkillnames,
} from './public/state'
import type { SkillResultWithStatus } from './public/types'

// renderResultsTable reads document.getElementById and no-ops if the tbody is
// missing (same stub approach as upgrade-cascade.test.ts).
vi.stubGlobal('document', {
    getElementById: () => null,
})

// A group-less skill (like an inherited unique) and a two-tier group.
const INHERITED = 'Red Shift/LP1211-M'
const RARE = 'Medium Straightaways ◎'
const NORMAL = 'Medium Straightaways ○'

const buyRow = (skill: string, cost: number): SkillResultWithStatus => ({
    skill,
    cost,
    discount: 20,
    meanLength: 0.5,
    medianLength: 0.45,
    meanLengthPerCost: 0.5 / cost,
    minLength: -0.1,
    maxLength: 1.2,
    rangeLower: 0.05,
    rangeUpper: 1,
    ciMeanLower: 0.4,
    ciMeanUpper: 0.6,
    status: 'fresh',
})

describe('taking/removing a skill derives the mirrored row by inversion', () => {
    beforeAll(() => {
        setSkillmeta({
            '900041': { baseCost: 200 },
            '201101': { baseCost: 110, groupId: '20110', order: 20300 },
            '201102': { baseCost: 100, groupId: '20110', order: 20310 },
        })
        setSkillnames({
            '900041': [INHERITED],
            '201101': [RARE],
            '201102': [NORMAL],
        })
        setSkillNameToId({
            [INHERITED]: '900041',
            [RARE]: '201101',
            [NORMAL]: '201102',
        })
        buildSkillNameLookup()
    })

    beforeEach(() => {
        setCurrentConfig({
            skills: {
                [INHERITED]: { discount: 20 },
                [RARE]: { discount: 10 },
                [NORMAL]: { discount: 10 },
            },
            uma: { skills: [], skillPoints: 1000 },
        })
        getCalculatedResultsCache().clear()
        const results = getResultsMap()
        results.clear()
        results.set(INHERITED, buyRow(INHERITED, 160))
        results.set(RARE, buyRow(RARE, 99))
        results.set(NORMAL, buyRow(NORMAL, 90))
    })

    it('take: the removal row is the negated buy row, no recalculation', () => {
        addSkillToUmaFromTable(INHERITED, 160)

        const row = getResultsMap().get(INHERITED)
        expect(row?.status).toBe('cached')
        expect(row?.owned).toBe(true)
        expect(row?.ownedAction).toBe('remove')
        expect(row?.hasCost).toBe(true)
        expect(row?.cost).toBe(-160)
        expect(row?.discount).toBe(20)
        expect(row?.meanLength).toBe(-0.5)
        expect(row?.medianLength).toBe(-0.45)
        expect(row?.meanLengthPerCost).toBe(0.5 / 160)
        expect(row?.minLength).toBe(-1.2)
        expect(row?.maxLength).toBe(0.1)
        expect(row?.rangeLower).toBe(-1)
        expect(row?.rangeUpper).toBe(-0.05)
        expect(row?.ciMeanLower).toBe(-0.6)
        expect(row?.ciMeanUpper).toBe(-0.4)

        // Cached so the Owned toggle restores it without a run.
        expect(getCalculatedResultsCache().get(INHERITED)?.owned).toBe(true)
        expect(getCurrentConfig()?.uma?.skillPoints).toBe(840)
    })

    it('remove: the buy row round-trips back, no recalculation', () => {
        addSkillToUmaFromTable(INHERITED, 160)
        removeSkillFromUma(INHERITED)

        const row = getResultsMap().get(INHERITED)
        expect(row?.status).toBe('cached')
        expect(row?.owned).toBeUndefined()
        expect(row?.cost).toBe(160)
        expect(row?.discount).toBe(20)
        expect(row?.meanLength).toBe(0.5)
        expect(row?.medianLength).toBe(0.45)
        expect(row?.minLength).toBe(-0.1)
        expect(row?.maxLength).toBe(1.2)
        expect(row?.rangeLower).toBe(0.05)
        expect(row?.rangeUpper).toBe(1)
        expect(getCurrentConfig()?.uma?.skillPoints).toBe(1000)
    })

    it('take with a pending buy row still queues a recalculation', () => {
        getResultsMap().set(INHERITED, {
            ...buyRow(INHERITED, 160),
            status: 'pending',
        })

        addSkillToUmaFromTable(INHERITED, 160)

        expect(getResultsMap().get(INHERITED)?.status).toBe('pending')
        expect(getResultsMap().get(INHERITED)?.owned).toBe(true)
    })

    it('replacing a group variant still queues a recalculation', () => {
        // The buy row for ◎ was simulated against a baseline that had ○, so
        // it cannot be inverted into the removal row after the replacement.
        const config = getCurrentConfig()
        config!.uma!.skills = [NORMAL]
        getResultsMap().delete(NORMAL)

        addSkillToUmaFromTable(RARE, 99)

        const row = getResultsMap().get(RARE)
        expect(row?.status).toBe('pending')
        expect(row?.owned).toBe(true)
        expect(row?.ownedAction).toBe('remove')
    })
})
