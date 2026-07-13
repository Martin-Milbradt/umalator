import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SkillSet } from '../uma-tools/components/HorseDefTypes'
import type { RawCourseData } from '../types'
import { processCourseData } from '../utils'
import {
    type CompareHorseState,
    type CompareRaceParams,
    type RawSkillData,
    applyDynamicModifierScaling,
    dynamicModifierFactor,
    runComparison,
    uniqueLevelFactor,
} from './compare'

const umaToolsDir = resolve(
    import.meta.dirname,
    '..',
    'uma-tools',
    'umalator-global',
)
const courseData: Record<string, RawCourseData> = JSON.parse(
    readFileSync(resolve(umaToolsDir, 'course_data.json'), 'utf-8'),
)

// Hanshin Turf 1600m
const hanshin1600 = processCourseData(courseData['10304']!)

// "Luck Runs My Way": one alternative, self-contained random-position
// condition (phase_laterhalf_random), TargetSpeed + Accel effects.
const UNIQUE_ID = '100981'

const racedef: CompareRaceParams = {
    groundCondition: 1,
    weather: 1,
    season: 1,
    time: 0,
    grade: 100,
    skillId: '',
    numUmas: 18,
}

function makeUma(over: Partial<CompareHorseState>): CompareHorseState {
    return {
        outfitId: '',
        starCount: 3,
        speed: 1100,
        stamina: 900,
        power: 900,
        guts: 400,
        wisdom: 400,
        strategy: 'Senkou',
        distanceAptitude: 'A',
        surfaceAptitude: 'A',
        strategyAptitude: 'A',
        aptitudes: [
            'S',
            'S',
            'S',
            'S',
            'A',
            'A',
            'A',
            'A',
            'A',
            'A',
        ] as unknown as CompareHorseState['aptitudes'],
        skills: SkillSet([]),
        samplePolicies: new Map(),
        uniqueLv: 1,
        mood: 2,
        popularity: 1,
        ...over,
    }
}

function meanOf(results: number[]): number {
    return results.reduce((a, b) => a + b, 0) / results.length
}

describe('uniqueLevelFactor', () => {
    it.each([
        // stat-up effects share one table
        [1, 1, 1],
        [3, 5, 1.04],
        [5, 10, 1.1],
        // TargetSpeed
        [27, 1, 1],
        [27, 6, 1.13],
        [27, 10, 1.25],
        // Accel
        [31, 2, 1.02],
        [31, 7, 1.125],
        [31, 10, 1.2],
        // other effect types default to 2% per level
        [9, 6, 1.1],
        [37, 3, 1.04],
    ])('type %d at level %d scales by %f', (type, level, factor) => {
        expect(uniqueLevelFactor(type, level)).toBeCloseTo(factor, 10)
    })

    it('clamps out-of-range levels', () => {
        expect(uniqueLevelFactor(27, 0)).toBe(1)
        expect(uniqueLevelFactor(27, 99)).toBe(1.25)
    })
})

describe('runComparison', () => {
    it('is symmetric for identical umas (asitame smoke, power > 1200)', () => {
        // power 1300 exercises the Asiwotameru over-1200 hook on both sides
        const uma1 = makeUma({ power: 1300, mood: 0 })
        const uma2 = makeUma({ power: 1300, mood: 0 })
        const { results } = runComparison(
            50,
            hanshin1600,
            racedef,
            uma1,
            uma2,
            [987654321, 0],
            {},
        )
        expect(results).toHaveLength(50)
        expect(Math.abs(meanOf(results))).toBeLessThan(0.05)
    })

    it('gives a higher-level unique a positive mean gain', () => {
        const uma1 = makeUma({
            skills: SkillSet([UNIQUE_ID]),
            uniqueSkillId: UNIQUE_ID,
            uniqueLv: 1,
        })
        const uma2 = makeUma({
            skills: SkillSet([UNIQUE_ID]),
            uniqueSkillId: UNIQUE_ID,
            uniqueLv: 6,
        })
        const { results } = runComparison(
            100,
            hanshin1600,
            racedef,
            uma1,
            uma2,
            [987654321, 0],
            {},
        )
        // positive = uma2 (level 6) finishes ahead
        expect(meanOf(results)).toBeGreaterThan(0.01)
    })

    it('does not scale anything without uniqueSkillId', () => {
        const uma1 = makeUma({
            skills: SkillSet([UNIQUE_ID]),
            uniqueLv: 1,
        })
        const uma2 = makeUma({
            skills: SkillSet([UNIQUE_ID]),
            uniqueLv: 6,
        })
        const { results } = runComparison(
            50,
            hanshin1600,
            racedef,
            uma1,
            uma2,
            [987654321, 0],
            {},
        )
        expect(Math.abs(meanOf(results))).toBeLessThan(0.05)
    })
})

describe('dynamicModifierFactor', () => {
    it.each([
        [1, 1],
        // flat ×1.2 group
        [3, 1.2],
        [7, 1.2],
        [10, 1.2],
        // gamble roll: 60% ×0, 30% ×0.02, 10% ×0.04 -> expectation 0.01
        [8, 0.01],
        [9, 0.01],
        // random ×1/1.4/1.8 -> expectation 1.4
        [25, 1.4],
        // runtime-dependent or pass-through types stay at 1
        [13, 1],
        [14, 1],
        [999, 1],
    ])('scaling %d scales by %f', (scaling, factor) => {
        expect(dynamicModifierFactor(scaling)).toBe(factor)
    })
})

describe('applyDynamicModifierScaling', () => {
    // Shaped like Risky Business: +0.25 target speed plus a "gamble" HP drain
    // stored as -100% with scaling 8.
    const raw: RawSkillData = {
        '202032': {
            alternatives: [
                {
                    effects: [
                        { type: 27, modifier: 2500, scaling: 1 },
                        { type: 9, modifier: -10000, scaling: 8 },
                    ],
                },
            ],
        },
    }

    const entry = (skillId: string) =>
        ({
            skillId,
            effects: [
                { type: 27, baseDuration: 1.8, modifier: 0.25 },
                { type: 9, baseDuration: 1.8, modifier: -1 },
            ],
        }) as never

    it('rescales dynamic effects and leaves static ones alone', () => {
        const sd = entry('202032')
        applyDynamicModifierScaling([sd], raw)
        const effects = (sd as { effects: { modifier: number }[] }).effects
        expect(effects[0]!.modifier).toBeCloseTo(0.25, 10)
        expect(effects[1]!.modifier).toBeCloseTo(-0.01, 10)
    })

    it('skips entries without a raw record (synthetic skills)', () => {
        const sd = entry('asitame')
        applyDynamicModifierScaling([sd], raw)
        const effects = (sd as { effects: { modifier: number }[] }).effects
        expect(effects[1]!.modifier).toBe(-1)
    })

    it('skips entries whose modifiers no longer match the raw data', () => {
        const sd = entry('202032')
        ;(sd as { effects: { modifier: number }[] }).effects[0]!.modifier = 0.3
        applyDynamicModifierScaling([sd], raw)
        const effects = (sd as { effects: { modifier: number }[] }).effects
        expect(effects[1]!.modifier).toBe(-1)
    })

    it('treats missing scaling fields as static (old-format data)', () => {
        const oldFormat: RawSkillData = {
            '202032': {
                alternatives: [
                    {
                        effects: [
                            { type: 27, modifier: 2500 },
                            { type: 9, modifier: -10000 },
                        ],
                    },
                ],
            },
        }
        const sd = entry('202032')
        applyDynamicModifierScaling([sd], oldFormat)
        const effects = (sd as { effects: { modifier: number }[] }).effects
        expect(effects[1]!.modifier).toBe(-1)
    })
})
