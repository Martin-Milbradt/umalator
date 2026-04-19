import { describe, expect, it } from 'vitest'
import { filterSkillSuggestions } from './public/skillAutocomplete'
import type { SkillMeta, SkillNames } from './public/types'

const SKILLNAMES: SkillNames = {
    '200352': ['Corner Recovery ○'],
    '200353': ['Corner Recovery ×'],
    '200971': ['Sprint Corners ◎'],
    '200972': ['Sprint Corners ○'],
    '200351': ['Swinging Maestro'], // Corner Recovery's gold upgrade
    '100451': ['Pure Heart'], // Unique (baseCost: 0)
    '100691': ['Ambition to Surpass the Sakura'], // Unique
    '200011': ['Right-Handed ◎'],
}

const SKILLMETA: SkillMeta = {
    '200352': { baseCost: 170 },
    '200353': { baseCost: 100 },
    '200971': { baseCost: 160 },
    '200972': { baseCost: 130 },
    '200351': { baseCost: 170 },
    '100451': { baseCost: 0 },
    '100691': { baseCost: 0 },
    '200011': { baseCost: 110 },
}

describe('filterSkillSuggestions', () => {
    it('returns prefix matches before substring matches', () => {
        const results = filterSkillSuggestions(
            'corner',
            'regular',
            SKILLNAMES,
            SKILLMETA,
        )
        // Both Corner Recovery variants share the prefix and come before Sprint Corners.
        expect(new Set(results.slice(0, 2))).toEqual(
            new Set(['Corner Recovery ○', 'Corner Recovery ×']),
        )
        expect(results).toContain('Sprint Corners ◎')
        expect(results).toContain('Sprint Corners ○')
    })

    it('is case-insensitive', () => {
        const lower = filterSkillSuggestions(
            'pure',
            'unique',
            SKILLNAMES,
            SKILLMETA,
        )
        const upper = filterSkillSuggestions(
            'PURE',
            'unique',
            SKILLNAMES,
            SKILLMETA,
        )
        expect(upper).toEqual(lower)
        expect(lower).toContain('Pure Heart')
    })

    it('mode=unique excludes regular skills', () => {
        const results = filterSkillSuggestions(
            '',
            'unique',
            SKILLNAMES,
            SKILLMETA,
        )
        expect(results).toContain('Pure Heart')
        expect(results).toContain('Ambition to Surpass the Sakura')
        expect(results).not.toContain('Corner Recovery ○')
        expect(results).not.toContain('Right-Handed ◎')
    })

    it('mode=regular excludes uniques', () => {
        const results = filterSkillSuggestions(
            '',
            'regular',
            SKILLNAMES,
            SKILLMETA,
        )
        expect(results).not.toContain('Pure Heart')
        expect(results).toContain('Corner Recovery ○')
    })

    it('mode=all includes everything', () => {
        const results = filterSkillSuggestions(
            'r',
            'all',
            SKILLNAMES,
            SKILLMETA,
        )
        expect(results).toContain('Right-Handed ◎')
        expect(results).toContain('Pure Heart')
    })

    it('empty query returns the first `limit` matches alphabetically', () => {
        const results = filterSkillSuggestions(
            '',
            'regular',
            SKILLNAMES,
            SKILLMETA,
            3,
        )
        expect(results).toHaveLength(3)
        expect(results).toEqual([...results].sort())
    })

    it('returns [] when skillnames is null', () => {
        expect(
            filterSkillSuggestions('foo', 'regular', null, SKILLMETA),
        ).toEqual([])
    })

    it('falls back to baseCost=200 when skillmeta is null (treats all as regular)', () => {
        const results = filterSkillSuggestions(
            'pure',
            'regular',
            SKILLNAMES,
            null,
        )
        // Without meta, Pure Heart defaults to baseCost 200 → counted as regular.
        expect(results).toContain('Pure Heart')
    })

    it('respects the limit', () => {
        const results = filterSkillSuggestions(
            '',
            'all',
            SKILLNAMES,
            SKILLMETA,
            2,
        )
        expect(results).toHaveLength(2)
    })

    it('returns no matches when query has no hits', () => {
        const results = filterSkillSuggestions(
            'zzzzz',
            'regular',
            SKILLNAMES,
            SKILLMETA,
        )
        expect(results).toEqual([])
    })
})
