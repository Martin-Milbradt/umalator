import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    buildSkillNameLookup,
    buildVariantCache,
} from './public/skillHelpers'
import { triggerCalculationForRenamedSkill } from './public/skillsUI'
import {
    getResultsMap,
    setCurrentConfig,
    setSkillmeta,
    setSkillNameToId,
    setSkillnames,
} from './public/state'

vi.stubGlobal('document', {
    getElementById: () => null,
})

const NORMAL = 'Late Surger Savvy ○'
const RARE = 'Late Surger Savvy ◎'

describe('triggerCalculationForRenamedSkill (regression for + → rename flow)', () => {
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
        getResultsMap().clear()
    })

    it('queues pending result for the renamed skill (and its variant) when discount is set', () => {
        // Simulates the post-rename state: "+" created the skill with
        // discount 0, the user typed a real name, and renderSkills auto-created
        // the sibling variant entry.
        setCurrentConfig({
            skills: {
                [NORMAL]: { discount: 0 },
                [RARE]: { discount: 0 },
            },
            uma: { skills: [] },
        })

        triggerCalculationForRenamedSkill(NORMAL, 0)

        const results = getResultsMap()
        expect(results.get(NORMAL)?.status).toBe('pending')
        expect(results.get(RARE)?.status).toBe('pending')
    })

    it('is a no-op when discount is null', () => {
        setCurrentConfig({
            skills: {
                [NORMAL]: { discount: null },
                [RARE]: { discount: null },
            },
            uma: { skills: [] },
        })

        triggerCalculationForRenamedSkill(NORMAL, null)

        expect(getResultsMap().size).toBe(0)
    })

    it('skips variants already on Uma', () => {
        setCurrentConfig({
            skills: {
                [NORMAL]: { discount: 0 },
                [RARE]: { discount: 0 },
            },
            uma: { skills: [NORMAL] },
        })

        triggerCalculationForRenamedSkill(NORMAL, 0)

        const results = getResultsMap()
        expect(results.has(NORMAL)).toBe(false)
        // Sibling can't be in the table either: the upgraded version is on Uma,
        // so umaHasUpgradedVersion(RARE) would be false but isSkillOnUma(NORMAL)
        // is true. The renamed-into ○ is filtered; ◎ is a separate skill in the
        // upgrade chain and remains visible.
        expect(results.get(RARE)?.status).toBe('pending')
    })
})
