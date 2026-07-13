import { describe, expect, it } from 'vitest'
import { filterSkillSuggestions } from './skillAutocomplete'
import type { SkillData, SkillMeta, SkillNames } from './types'

const skillnames: SkillNames = {
    // Regular skill with full data.
    '201111': ['Corner Recovery ○'],
    // Inherited unique with a real game record (cost 200, has skill_data).
    '900011': ['Shooting Star'],
    // Phantom auto-generated inherited unique: name only, no skill_data record.
    '90071': ['Warning Shot! (inherited)'],
    // Phantom debug entry: name only, no skill_data record.
    '100361': ['trigger:BEAT'],
}

const skillmeta: SkillMeta = {
    '201111': { baseCost: 120 },
    '900011': { baseCost: 200 },
    // The phantom entries have no skill_meta either; cost falls back to 200.
}

const entry = (): SkillData[string] => ({
    alternatives: [],
    rarity: 1,
    wisdomCheck: 0,
})

const skillData: SkillData = {
    '201111': entry(),
    '900011': entry(),
}

describe('filterSkillSuggestions skill_data filter', () => {
    it('drops names with no skill_data record once data is loaded', () => {
        const results = filterSkillSuggestions(
            '',
            'all',
            skillnames,
            skillmeta,
            10,
            null,
            skillData,
        )
        expect(results).toContain('Corner Recovery ○')
        expect(results).toContain('Shooting Star')
        expect(results).not.toContain('Warning Shot! (inherited)')
        expect(results).not.toContain('trigger:BEAT')
    })

    it('keeps all names while skill_data is still loading (null)', () => {
        const results = filterSkillSuggestions(
            '',
            'all',
            skillnames,
            skillmeta,
            10,
            null,
            null,
        )
        expect(results).toContain('Warning Shot! (inherited)')
        expect(results).toContain('trigger:BEAT')
    })

    it('still applies the mode filter alongside the data filter', () => {
        const results = filterSkillSuggestions(
            '',
            'unique',
            skillnames,
            skillmeta,
            10,
            null,
            skillData,
        )
        // Shooting Star (cost 200) is not a cost-0 base unique, so the unique
        // mode excludes it; the regular skill is excluded too.
        expect(results).not.toContain('Shooting Star')
        expect(results).not.toContain('Corner Recovery ○')
        expect(results).not.toContain('Warning Shot! (inherited)')
    })
})
