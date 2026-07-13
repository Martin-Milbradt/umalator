import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SkillSet } from '../uma-tools/components/HorseDefTypes'
import type { RawCourseData } from '../types'
import { processCourseData } from '../utils'
import {
    type CompareHorseState,
    type CompareRaceParams,
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
