import { beforeAll, describe, expect, it } from 'vitest'
import {
    buildSkillNameLookup,
    buildVariantCache,
    findSkillId,
    getBasicVariant,
    getUpgradedVariant,
    isValidSkillName,
} from './public/skillHelpers'
import {
    setSkillmeta,
    setSkillNameToId,
    setSkillnames,
} from './public/state'

describe('variant lookups exclude × purple variants', () => {
    beforeAll(() => {
        // Winter Runner group: ◎ (upgrade) -> ○ (base) -> × (purple, same group, higher order).
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

    it('getBasicVariant(○) is null — the × purple skill is not a prerequisite', () => {
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

describe('isValidSkillName (regression for "Trium" silent accept)', () => {
    beforeAll(() => {
        setSkillmeta({
            '100061': { baseCost: 100, groupId: 'g1', order: 1 },
            '200352': { baseCost: 170, groupId: 'g2', order: 2 },
            '201181': { baseCost: 130, groupId: 'g3', order: 3 },
            '201182': { baseCost: 100, groupId: 'g3', order: 4 },
        })
        setSkillnames({
            '100061': ['Triumphant Pulse'],
            '200352': ['Corner Recovery ○'],
            '201181': ['Long Corners ◎'],
            '201182': ['Long Corners ○'],
        })
        setSkillNameToId({
            'Triumphant Pulse': '100061',
            'Corner Recovery ○': '200352',
            'Long Corners ◎': '201181',
            'Long Corners ○': '201182',
        })
        buildSkillNameLookup()
        buildVariantCache()
    })

    it('rejects partial / unknown names like "Trium"', () => {
        expect(isValidSkillName('Trium')).toBe(false)
    })

    it('accepts canonical names case-insensitively', () => {
        expect(isValidSkillName('Triumphant Pulse')).toBe(true)
        expect(isValidSkillName('triumphant pulse')).toBe(true)
        expect(isValidSkillName('Corner Recovery ○')).toBe(true)
    })

    it('accepts base names of variant pairs (renderSkills expands them)', () => {
        expect(isValidSkillName('Long Corners')).toBe(true)
        expect(isValidSkillName('long corners')).toBe(true)
    })

    it('rejects empty / whitespace input', () => {
        expect(isValidSkillName('')).toBe(false)
        expect(isValidSkillName('   ')).toBe(false)
    })
})
