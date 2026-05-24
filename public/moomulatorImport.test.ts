import { describe, expect, it } from 'vitest'
import { convertMoomulatorConfig } from './moomulatorImport'
import type { Config, SkillMeta, SkillNames } from './types'

const skillnames: SkillNames = {
    '100501': ['Nemesis'],
    '200172': ['Spring Runner ○'],
    '200331': ['Professor of Curvature'],
    '900061': ['Triumphant Pulse'],
}

const skillmeta: SkillMeta = {
    '100501': { baseCost: 0 },
    '200172': { baseCost: 90 },
    '200331': { baseCost: 170 },
    '900061': { baseCost: 200 },
}

describe('convertMoomulatorConfig', () => {
    it('maps stats, mood, and aptitudes', () => {
        const { config } = convertMoomulatorConfig(
            {
                speed: 1200,
                stamina: 673,
                power: 1159,
                guts: 494,
                wisdom: 1156,
                mood: 0,
                distanceAptitude: 'S',
                surfaceAptitude: 'A',
                strategyAptitude: 'B',
            },
            skillnames,
            skillmeta,
        )
        expect(config.uma).toMatchObject({
            speed: 1200,
            stamina: 673,
            power: 1159,
            guts: 494,
            wisdom: 1156,
            mood: 0,
            distanceAptitude: 'S',
            surfaceAptitude: 'A',
            styleAptitude: 'B',
        })
    })

    it('translates Japanese strategy to English display name', () => {
        for (const [jp, en] of [
            ['Oikomi', 'End Closer'],
            ['Senkou', 'Pace Chaser'],
            ['Sasi', 'Late Surger'],
            ['Sashi', 'Late Surger'],
            ['Nige', 'Front Runner'],
            ['Oonige', 'Runaway'],
        ]) {
            const { config } = convertMoomulatorConfig(
                { strategy: jp },
                skillnames,
                skillmeta,
            )
            expect(config.uma?.strategy).toBe(en)
        }
    })

    it('splits skill IDs: cost-0 becomes unique, others go to skills', () => {
        const { config, unknownSkillIds } = convertMoomulatorConfig(
            { skills: ['100501', '200172', '200331', '900061'] },
            skillnames,
            skillmeta,
        )
        expect(config.uma?.unique).toBe('Nemesis')
        expect(config.uma?.skills).toEqual([
            'Spring Runner ○',
            'Professor of Curvature',
            'Triumphant Pulse',
        ])
        expect(unknownSkillIds).toEqual([])
    })

    it('reports unknown skill IDs without throwing', () => {
        const { config, unknownSkillIds } = convertMoomulatorConfig(
            { skills: ['200172', '999999'] },
            skillnames,
            skillmeta,
        )
        expect(config.uma?.skills).toEqual(['Spring Runner ○'])
        expect(unknownSkillIds).toEqual(['999999'])
    })

    it('skips invalid aptitude values', () => {
        const { config } = convertMoomulatorConfig(
            { distanceAptitude: 'Z', surfaceAptitude: 'A' },
            skillnames,
            skillmeta,
        )
        expect(config.uma?.distanceAptitude).toBeUndefined()
        expect(config.uma?.surfaceAptitude).toBe('A')
    })

    it('adds every owned skill (including unique) to available at 0% discount', () => {
        const { config } = convertMoomulatorConfig(
            { skills: ['100501', '200172', '900061'] },
            skillnames,
            skillmeta,
        )
        expect(config.skills).toEqual({
            Nemesis: { discount: 0 },
            'Spring Runner ○': { discount: 0 },
            'Triumphant Pulse': { discount: 0 },
        })
    })

    it('uses the template for track and existing skill discounts; clipboard skills fill the rest at 0%', () => {
        const template: Config = {
            skills: {
                'Spring Runner ○': { discount: 30 },
                'Some Other Skill': { discount: 10 },
            },
            track: { distance: 2400, trackName: 'Tokyo' },
            filters: { hideOwned: true },
        }
        const { config } = convertMoomulatorConfig(
            { skills: ['200172', '200331'] },
            skillnames,
            skillmeta,
            template,
        )
        expect(config.skills).toEqual({
            'Spring Runner ○': { discount: 30 },
            'Some Other Skill': { discount: 10 },
            'Professor of Curvature': { discount: 0 },
        })
        expect(config.track).toEqual({ distance: 2400, trackName: 'Tokyo' })
        expect(config.filters).toEqual({ hideOwned: true })
    })

    it('null template behaves like no template', () => {
        const { config } = convertMoomulatorConfig(
            { skills: ['200172'] },
            skillnames,
            skillmeta,
            null,
        )
        expect(config.skills).toEqual({ 'Spring Runner ○': { discount: 0 } })
        expect(config.track).toBeUndefined()
    })

    it('produces an empty skills-to-test map when no skills and no template', () => {
        const { config } = convertMoomulatorConfig({}, skillnames, skillmeta)
        expect(config.skills).toEqual({})
        expect(config.uma).toBeDefined()
    })

    it('rejects non-object input', () => {
        expect(() =>
            convertMoomulatorConfig(null, skillnames, skillmeta),
        ).toThrow(/object/)
        expect(() =>
            convertMoomulatorConfig([], skillnames, skillmeta),
        ).toThrow(/object/)
    })

    it('matches the full moomulator example shape', () => {
        const moomulator = {
            outfitId: '105001',
            speed: 1200,
            stamina: 673,
            power: 1159,
            guts: 494,
            wisdom: 1156,
            strategy: 'Oikomi',
            distanceAptitude: 'S',
            surfaceAptitude: 'A',
            strategyAptitude: 'A',
            mood: 0,
            skills: ['100501', '200172', '200331', '900061'],
            forcedSkillPositions: {},
        }
        const { config } = convertMoomulatorConfig(
            moomulator,
            skillnames,
            skillmeta,
        )
        expect(config).toEqual({
            skills: {
                Nemesis: { discount: 0 },
                'Spring Runner ○': { discount: 0 },
                'Professor of Curvature': { discount: 0 },
                'Triumphant Pulse': { discount: 0 },
            },
            uma: {
                speed: 1200,
                stamina: 673,
                power: 1159,
                guts: 494,
                wisdom: 1156,
                mood: 0,
                strategy: 'End Closer',
                distanceAptitude: 'S',
                surfaceAptitude: 'A',
                styleAptitude: 'A',
                unique: 'Nemesis',
                skills: [
                    'Spring Runner ○',
                    'Professor of Curvature',
                    'Triumphant Pulse',
                ],
            },
        })
    })
})
