import { beforeAll, describe, expect, it } from 'vitest'
import {
    buildSkillNameLookup,
    findSkillId,
    getBasicVariant,
    getUpgradedVariant,
} from './public/skillHelpers'
import {
    setSkillmeta,
    setSkillNameToId,
    setSkillnames,
} from './public/state'

describe('variant lookups exclude × debuff variants', () => {
    beforeAll(() => {
        // Winter Runner group: ◎ (upgrade) -> ○ (base) -> × (debuff, same group, higher order).
        // The × variant is not part of the upgrade chain; it shouldn't be treated as
        // a more basic form of ○.
        setSkillmeta({
            '200201': { baseCost: 110, groupId: '20020', order: 1600 },
            '200202': { baseCost: 90, groupId: '20020', order: 1610 },
            '200203': { baseCost: 50, groupId: '20020', order: 1620 },
        })
        setSkillnames({
            '200201': ['Winter Runner ◎'],
            '200202': ['Winter Runner ○'],
            '200203': ['Winter Runner ×'],
        })
        setSkillNameToId({
            'Winter Runner ◎': '200201',
            'Winter Runner ○': '200202',
            'Winter Runner ×': '200203',
        })
        buildSkillNameLookup()
    })

    it('findSkillId resolves all three variants', () => {
        expect(findSkillId('Winter Runner ◎')).toBe('200201')
        expect(findSkillId('Winter Runner ○')).toBe('200202')
        expect(findSkillId('Winter Runner ×')).toBe('200203')
    })

    it('getBasicVariant(○) is null — the × debuff is not a prerequisite', () => {
        // Regression test for #44: when adding ○ to Uma, the caller uses
        // !getBasicVariant(○) to decide whether to invalidate the upgraded
        // variant's cache. Returning × here leaves the cache stale.
        expect(getBasicVariant('Winter Runner ○')).toBeNull()
    })

    it('getBasicVariant(◎) returns ○', () => {
        expect(getBasicVariant('Winter Runner ◎')).toBe('Winter Runner ○')
    })

    it('getUpgradedVariant(○) returns ◎', () => {
        expect(getUpgradedVariant('Winter Runner ○')).toBe('Winter Runner ◎')
    })

    it('getUpgradedVariant(◎) is null', () => {
        expect(getUpgradedVariant('Winter Runner ◎')).toBeNull()
    })

    it('getUpgradedVariant(×) is null — × is not upgraded to anything', () => {
        expect(getUpgradedVariant('Winter Runner ×')).toBeNull()
    })
})
