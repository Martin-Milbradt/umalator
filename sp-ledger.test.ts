import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    buildSkillNameLookup,
    getSkillChainValue,
    getSkillCostWithDiscount,
} from './public/skillHelpers'
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

// Same stub approach as owned-row-inversion.test.ts: renderResultsTable
// no-ops when the tbody is missing.
vi.stubGlobal('document', {
    getElementById: () => null,
})

// Two-tier circle chain: buying ◎ requires the ○ hint underneath it.
const RARE = 'Medium Straightaways ◎'
const NORMAL = 'Medium Straightaways ○'

// With 10% discounts: ○ costs 90, ◎'s own tier costs 99, full chain 189.
const NORMAL_COST = 90
const RARE_INCREMENT = 99
const RARE_CHAIN = RARE_INCREMENT + NORMAL_COST

const START_SP = 1000

describe('skill-point ledger with ○/◎ variants', () => {
    beforeAll(() => {
        setSkillmeta({
            '201101': { baseCost: 110, groupId: '20110', order: 20300 },
            '201102': { baseCost: 100, groupId: '20110', order: 20310 },
        })
        setSkillnames({
            '201101': [RARE],
            '201102': [NORMAL],
        })
        setSkillNameToId({
            [RARE]: '201101',
            [NORMAL]: '201102',
        })
        buildSkillNameLookup()
    })

    beforeEach(() => {
        setCurrentConfig({
            skills: {
                [RARE]: { discount: 10 },
                [NORMAL]: { discount: 10 },
            },
            uma: { skills: [], skillPoints: START_SP },
        })
        getCalculatedResultsCache().clear()
        getResultsMap().clear()
    })

    const skillPoints = () => getCurrentConfig()?.uma?.skillPoints

    it('chain value includes covered prerequisites, purchase price does not', () => {
        getCurrentConfig()!.uma!.skills = [NORMAL]
        expect(getSkillCostWithDiscount(RARE)).toBe(RARE_INCREMENT)
        expect(getSkillChainValue(RARE)).toBe(RARE_CHAIN)
    })

    it('buying ◎ fresh charges the full chain', () => {
        addSkillToUmaFromTable(RARE)
        expect(skillPoints()).toBe(START_SP - RARE_CHAIN)
    })

    it('buying then removing ◎ restores the starting budget', () => {
        addSkillToUmaFromTable(RARE)
        removeSkillFromUma(RARE)
        expect(skillPoints()).toBe(START_SP)
    })

    it('upgrading ○ → ◎ charges only the increment', () => {
        addSkillToUmaFromTable(NORMAL)
        expect(skillPoints()).toBe(START_SP - NORMAL_COST)

        addSkillToUmaFromTable(RARE)
        expect(getCurrentConfig()?.uma?.skills).toEqual([RARE])
        expect(skillPoints()).toBe(START_SP - RARE_CHAIN)
    })

    it('reaching ◎ directly or via ○ leaves identical budgets', () => {
        addSkillToUmaFromTable(RARE)
        const direct = skillPoints()

        setCurrentConfig({
            skills: {
                [RARE]: { discount: 10 },
                [NORMAL]: { discount: 10 },
            },
            uma: { skills: [], skillPoints: START_SP },
        })
        addSkillToUmaFromTable(NORMAL)
        addSkillToUmaFromTable(RARE)

        expect(skillPoints()).toBe(direct)
    })

    it('downgrading ◎ → ○ refunds only the increment', () => {
        addSkillToUmaFromTable(RARE)
        addSkillToUmaFromTable(NORMAL)

        expect(getCurrentConfig()?.uma?.skills).toEqual([NORMAL])
        expect(skillPoints()).toBe(START_SP - NORMAL_COST)
    })
})
