import { describe, it, expect } from 'vitest'
import {
    DistanceType,
    Surface,
    Orientation,
    type ThresholdStat,
} from '../uma-tools/uma-skill-tools/CourseData'
import {
    Grade,
    GroundCondition,
    Season,
    Time,
    parseGroundCondition,
    parseWeather,
    parseSeason,
    parseStrategyName,
    formatStrategyName,
    formatDistanceType,
    formatSurface,
    formatTurn,
    parseSurface,
    parseDistanceCategory,
    isRandomLocation,
    isRandomValue,
    shuffleArray,
    createWeightedSeasonArray,
    createWeightedWeatherArray,
    createWeightedConditionArray,
    findAllSkillIdsByName,
    findSkillIdByNameWithPreference,
    findSkillVariantsByName,
    processCourseData,
    calculateStatsFromRawResults,
    calculateSkillCost,
    formatTable,
    buildSkillNameLookup,
    getCanonicalSkillName,
    normalizeConfigSkillNames,
    getDistanceType,
    extractStaticRestrictions,
    canSkillTrigger,
    extractSkillRestrictions,
    STRATEGY_TO_RUNNING_STYLE,
    TRACK_NAME_TO_ID,
    type SkillResult,
    type SkillRestrictions,
    type CurrentSettings,
    type SkillDataEntry,
} from './utils'

// Tests to ensure local enum values match upstream uma-tools/uma-skill-tools/RaceParameters.ts
describe('enum values match upstream', () => {
    it('Grade values match RaceParameters', () => {
        expect(Grade.G1).toBe(100)
        expect(Grade.G2).toBe(200)
        expect(Grade.G3).toBe(300)
        expect(Grade.OP).toBe(400)
        expect(Grade.PreOP).toBe(700)
        expect(Grade.Maiden).toBe(800)
        expect(Grade.Debut).toBe(900)
        expect(Grade.Daily).toBe(999)
    })

    it('GroundCondition values match RaceParameters', () => {
        expect(GroundCondition.Good).toBe(1)
        expect(GroundCondition.Yielding).toBe(2)
        expect(GroundCondition.Soft).toBe(3)
        expect(GroundCondition.Heavy).toBe(4)
    })

    it('Season values match RaceParameters', () => {
        expect(Season.Spring).toBe(1)
        expect(Season.Summer).toBe(2)
        expect(Season.Autumn).toBe(3)
        expect(Season.Winter).toBe(4)
        expect(Season.Sakura).toBe(5)
    })

    it('Time values match RaceParameters', () => {
        expect(Time.NoTime).toBe(0)
        expect(Time.Morning).toBe(1)
        expect(Time.Midday).toBe(2)
        expect(Time.Evening).toBe(3)
        expect(Time.Night).toBe(4)
    })
})

describe('parseGroundCondition', () => {
    it.each([
        ['firm', GroundCondition.Good],
        ['Firm', GroundCondition.Good],
        ['FIRM', GroundCondition.Good],
        ['good', GroundCondition.Yielding],
        ['soft', GroundCondition.Soft],
        ['heavy', GroundCondition.Heavy],
    ])("parses '%s' to %d", (input, expected) => {
        expect(parseGroundCondition(input)).toBe(expected)
    })

    it('throws on invalid input', () => {
        expect(() => parseGroundCondition('invalid')).toThrow(
            'Invalid ground condition: invalid',
        )
    })
})

describe('parseWeather', () => {
    it.each([
        ['sunny', 1],
        ['Sunny', 1],
        ['cloudy', 2],
        ['rainy', 3],
        ['snowy', 4],
    ])("parses '%s' to %d", (input, expected) => {
        expect(parseWeather(input)).toBe(expected)
    })

    it('throws on invalid input', () => {
        expect(() => parseWeather('stormy')).toThrow('Invalid weather: stormy')
    })
})

describe('parseSeason', () => {
    it.each([
        ['spring', Season.Spring],
        ['Summer', Season.Summer],
        ['fall', Season.Autumn],
        ['autumn', Season.Autumn],
        ['winter', Season.Winter],
        ['sakura', Season.Sakura],
    ])("parses '%s' correctly", (input, expected) => {
        expect(parseSeason(input)).toBe(expected)
    })

    it('throws on invalid input', () => {
        expect(() => parseSeason('monsoon')).toThrow('Invalid season: monsoon')
    })
})

describe('parseStrategyName', () => {
    it.each([
        ['runaway', 'Oonige'],
        ['Runaway', 'Oonige'],
        ['front runner', 'Nige'],
        ['pace chaser', 'Senkou'],
        ['late surger', 'Sasi'],
        ['end closer', 'Oikomi'],
        ['oonige', 'Oonige'],
        ['Nige', 'Nige'],
    ])("parses '%s' to '%s'", (input, expected) => {
        expect(parseStrategyName(input)).toBe(expected)
    })

    it('throws on invalid input', () => {
        expect(() => parseStrategyName('sprinter')).toThrow(
            'Invalid strategy: sprinter',
        )
    })
})

describe('formatStrategyName', () => {
    it.each([
        ['Oonige', 'Runaway'],
        ['Nige', 'Front Runner'],
        ['Senkou', 'Pace Chaser'],
        ['Sasi', 'Late Surger'],
        ['Oikomi', 'End Closer'],
    ])("formats '%s' to '%s'", (input, expected) => {
        expect(formatStrategyName(input)).toBe(expected)
    })

    it('returns input unchanged for unknown strategy', () => {
        expect(formatStrategyName('Unknown')).toBe('Unknown')
    })
})

describe('formatDistanceType', () => {
    it.each([
        [1, 'Sprint'],
        [2, 'Mile'],
        [3, 'Medium'],
        [4, 'Long'],
    ])("formats %d to '%s'", (input, expected) => {
        expect(formatDistanceType(input)).toBe(expected)
    })

    it('throws on invalid input', () => {
        expect(() => formatDistanceType(5)).toThrow('Invalid distance type: 5')
    })
})

describe('formatSurface', () => {
    it('formats 1 to Turf', () => {
        expect(formatSurface(1)).toBe('Turf')
    })

    it('formats 2 to Dirt', () => {
        expect(formatSurface(2)).toBe('Dirt')
    })

    it('throws on invalid surface', () => {
        expect(() => formatSurface(0)).toThrow('Invalid surface: 0')
        expect(() => formatSurface(3)).toThrow('Invalid surface: 3')
    })
})

describe('formatTurn', () => {
    it('formats 1 to Right', () => {
        expect(formatTurn(1)).toBe('Right')
    })

    it('formats 2 to Left', () => {
        expect(formatTurn(2)).toBe('Left')
    })

    it('formats 4 to Straight', () => {
        expect(formatTurn(4)).toBe('Straight')
    })

    it('throws on invalid turn', () => {
        expect(() => formatTurn(0)).toThrow('Invalid turn: 0')
        expect(() => formatTurn(3)).toThrow('Invalid turn: 3')
        expect(() => formatTurn(5)).toThrow('Invalid turn: 5')
    })
})

describe('parseSurface', () => {
    it.each([
        ['turf', 1],
        ['Turf', 1],
        ['  turf  ', 1],
        ['dirt', 2],
        ['Dirt', 2],
    ])("parses '%s' to %d", (input, expected) => {
        expect(parseSurface(input)).toBe(expected)
    })

    it('returns null for undefined', () => {
        expect(parseSurface(undefined)).toBeNull()
    })

    it('returns null for unknown surface', () => {
        expect(parseSurface('grass')).toBeNull()
    })
})

describe('parseDistanceCategory', () => {
    it.each([
        ['<sprint>', 1],
        ['<Sprint>', 1],
        ['<mile>', 2],
        ['<medium>', 3],
        ['<long>', 4],
    ])("parses '%s' to %d", (input, expected) => {
        expect(parseDistanceCategory(input)).toBe(expected)
    })

    it('returns null for numeric input', () => {
        expect(parseDistanceCategory(1600)).toBeNull()
    })

    it('returns null for undefined', () => {
        expect(parseDistanceCategory(undefined)).toBeNull()
    })

    it('returns null for non-category string', () => {
        expect(parseDistanceCategory('1600')).toBeNull()
    })
})

describe('isRandomLocation', () => {
    it('returns true for <random>', () => {
        expect(isRandomLocation('<random>')).toBe(true)
        expect(isRandomLocation('<Random>')).toBe(true)
        expect(isRandomLocation('  <random>  ')).toBe(true)
    })

    it('returns false for other values', () => {
        expect(isRandomLocation('Kyoto')).toBe(false)
        expect(isRandomLocation(undefined)).toBe(false)
    })
})

describe('isRandomValue', () => {
    it('returns true for <random>', () => {
        expect(isRandomValue('<random>')).toBe(true)
        expect(isRandomValue('<RANDOM>')).toBe(true)
    })

    it('returns false for other values', () => {
        expect(isRandomValue('sunny')).toBe(false)
        expect(isRandomValue(undefined)).toBe(false)
    })
})

describe('shuffleArray', () => {
    it('returns a new array with same elements', () => {
        const input = [1, 2, 3, 4, 5]
        const result = shuffleArray(input)
        expect(result).not.toBe(input)
        expect(result.sort()).toEqual(input.sort())
    })

    it('does not modify original array', () => {
        const input = [1, 2, 3, 4, 5]
        const copy = [...input]
        shuffleArray(input)
        expect(input).toEqual(copy)
    })

    it('handles empty array', () => {
        expect(shuffleArray([])).toEqual([])
    })

    it('handles single element', () => {
        expect(shuffleArray([1])).toEqual([1])
    })
})

describe('createWeightedSeasonArray', () => {
    it('creates array with correct distribution', () => {
        const result = createWeightedSeasonArray()
        expect(result).toHaveLength(100)

        const counts = result.reduce(
            (acc, season) => {
                acc[season] = (acc[season] || 0) + 1
                return acc
            },
            {} as Record<number, number>,
        )

        expect(counts[Season.Spring]).toBe(40)
        expect(counts[Season.Summer]).toBe(22)
        expect(counts[Season.Autumn]).toBe(12)
        expect(counts[Season.Winter]).toBe(26)
    })
})

describe('createWeightedWeatherArray', () => {
    it('creates array with correct distribution', () => {
        const result = createWeightedWeatherArray()
        expect(result).toHaveLength(100)

        const counts = result.reduce(
            (acc, weather) => {
                acc[weather] = (acc[weather] || 0) + 1
                return acc
            },
            {} as Record<number, number>,
        )

        expect(counts[1]).toBe(58)
        expect(counts[2]).toBe(30)
        expect(counts[3]).toBe(11)
        expect(counts[4]).toBe(1)
    })
})

describe('createWeightedConditionArray', () => {
    it('creates array with correct distribution', () => {
        const result = createWeightedConditionArray()
        expect(result).toHaveLength(100)

        const counts = result.reduce(
            (acc, condition) => {
                acc[condition] = (acc[condition] || 0) + 1
                return acc
            },
            {} as Record<number, number>,
        )

        expect(counts[GroundCondition.Good]).toBe(77)
        expect(counts[GroundCondition.Yielding]).toBe(11)
        expect(counts[GroundCondition.Soft]).toBe(7)
        expect(counts[GroundCondition.Heavy]).toBe(5)
    })
})

describe('findAllSkillIdsByName', () => {
    const skillNames: Record<string, string[]> = {
        skill001: ['Speed Boost', 'スピードブースト'],
        skill002: ['Speed Boost', 'スピードブースト2'],
        skill003: ['Power Up', 'パワーアップ'],
    }

    it('finds all matching skill IDs', () => {
        const result = findAllSkillIdsByName('Speed Boost', skillNames)
        expect(result).toEqual(['skill001', 'skill002'])
    })

    it('returns empty array for no match', () => {
        const result = findAllSkillIdsByName('Unknown Skill', skillNames)
        expect(result).toEqual([])
    })

    it('returns single ID for unique match', () => {
        const result = findAllSkillIdsByName('Power Up', skillNames)
        expect(result).toEqual(['skill003'])
    })

    it('matches case-insensitively', () => {
        const result = findAllSkillIdsByName('speed boost', skillNames)
        expect(result).toEqual(['skill001', 'skill002'])
    })

    it('matches uppercase input', () => {
        const result = findAllSkillIdsByName('POWER UP', skillNames)
        expect(result).toEqual(['skill003'])
    })

    it('matches mixed case input', () => {
        const result = findAllSkillIdsByName('SpEeD bOoSt', skillNames)
        expect(result).toEqual(['skill001', 'skill002'])
    })
})

describe('findSkillIdByNameWithPreference', () => {
    const skillNames: Record<string, string[]> = {
        skill001: ['Dual Skill', 'デュアルスキル'],
        skill002: ['Dual Skill', 'デュアルスキル2'],
        skill003: ['Unique Only', 'ユニークのみ'],
    }
    const skillMeta: Record<string, { baseCost: number }> = {
        skill001: { baseCost: 0 },
        skill002: { baseCost: 150 },
        skill003: { baseCost: 0 },
    }

    it('prefers skill with cost > 0 when preferCostGreaterThanZero is true', () => {
        const result = findSkillIdByNameWithPreference(
            'Dual Skill',
            skillNames,
            skillMeta,
            true,
        )
        expect(result).toBe('skill002')
    })

    it('prefers skill with cost === 0 when preferCostGreaterThanZero is false', () => {
        const result = findSkillIdByNameWithPreference(
            'Dual Skill',
            skillNames,
            skillMeta,
            false,
        )
        expect(result).toBe('skill001')
    })

    it('returns null when no match found', () => {
        const result = findSkillIdByNameWithPreference(
            'Unknown',
            skillNames,
            skillMeta,
            true,
        )
        expect(result).toBeNull()
    })

    it('returns single match regardless of preference', () => {
        const result = findSkillIdByNameWithPreference(
            'Unique Only',
            skillNames,
            skillMeta,
            true,
        )
        expect(result).toBe('skill003')
    })

    it('matches case-insensitively', () => {
        const result = findSkillIdByNameWithPreference(
            'dual skill',
            skillNames,
            skillMeta,
            true,
        )
        expect(result).toBe('skill002')
    })

    it('matches uppercase input', () => {
        const result = findSkillIdByNameWithPreference(
            'UNIQUE ONLY',
            skillNames,
            skillMeta,
            false,
        )
        expect(result).toBe('skill003')
    })
})

describe('findSkillVariantsByName', () => {
    const skillNames: Record<string, string[]> = {
        skill001: ['Right-Handed', '右回り'],
        skill002: ['Right-Handed ○', '右回り○'],
        skill003: ['Right-Handed ◎', '右回り◎'],
        skill004: ['Unique Skill', 'ユニークスキル'],
    }
    const skillMeta: Record<string, { baseCost: number }> = {
        skill001: { baseCost: 0 },
        skill002: { baseCost: 100 },
        skill003: { baseCost: 150 },
        skill004: { baseCost: 0 },
    }

    it('finds ○ and ◎ variants when base has cost 0', () => {
        const result = findSkillVariantsByName(
            'Right-Handed',
            skillNames,
            skillMeta,
        )
        expect(result).toHaveLength(2)
        expect(result.map((v) => v.skillName)).toContain('Right-Handed ○')
        expect(result.map((v) => v.skillName)).toContain('Right-Handed ◎')
    })

    it('returns exact match when it has cost > 0', () => {
        const skillNamesWithCost: Record<string, string[]> = {
            skill001: ['Power Up', 'パワーアップ'],
        }
        const skillMetaWithCost: Record<string, { baseCost: number }> = {
            skill001: { baseCost: 120 },
        }
        const result = findSkillVariantsByName(
            'Power Up',
            skillNamesWithCost,
            skillMetaWithCost,
        )
        expect(result).toEqual([{ skillId: 'skill001', skillName: 'Power Up' }])
    })

    it('returns empty array when no match found', () => {
        const result = findSkillVariantsByName('Unknown', skillNames, skillMeta)
        expect(result).toEqual([])
    })

    it('matches case-insensitively', () => {
        const result = findSkillVariantsByName(
            'right-handed',
            skillNames,
            skillMeta,
        )
        expect(result).toHaveLength(2)
        expect(result.map((v) => v.skillName)).toContain('Right-Handed ○')
        expect(result.map((v) => v.skillName)).toContain('Right-Handed ◎')
    })

    it('returns canonical name even with wrong input casing', () => {
        const skillNamesWithCost: Record<string, string[]> = {
            skill001: ['Victoria por Plancha ☆', 'プランチャデビクトリア☆'],
        }
        const skillMetaWithCost: Record<string, { baseCost: number }> = {
            skill001: { baseCost: 120 },
        }
        const result = findSkillVariantsByName(
            'victoria POR plancha ☆',
            skillNamesWithCost,
            skillMetaWithCost,
        )
        expect(result).toEqual([
            { skillId: 'skill001', skillName: 'Victoria por Plancha ☆' },
        ])
    })
})

describe('processCourseData', () => {
    it('adds synthetic corner for straight courses', () => {
        const rawCourse = {
            raceTrackId: 10001,
            distance: 1000,
            distanceType: DistanceType.Short,
            surface: Surface.Turf,
            turn: Orientation.NoTurns,
            courseSetStatus: [] as readonly ThresholdStat[],
            corners: [],
            straights: [] as readonly {
                start: number
                end: number
                frontType: number
            }[],
            slopes: [] as readonly {
                start: number
                length: number
                slope: number
            }[],
            laneMax: 10000,
        }
        const result = processCourseData(rawCourse)
        expect(result.corners).toEqual([{ start: 1000, length: 0 }])
        expect(result.moveLanePoint).toBe(1000)
    })

    it('preserves existing corners', () => {
        const rawCourse = {
            raceTrackId: 10001,
            distance: 1000,
            distanceType: DistanceType.Short,
            surface: Surface.Turf,
            turn: Orientation.Clockwise,
            courseSetStatus: [] as readonly ThresholdStat[],
            corners: [{ start: 200, length: 100 }],
            straights: [] as readonly {
                start: number
                end: number
                frontType: number
            }[],
            slopes: [] as readonly {
                start: number
                length: number
                slope: number
            }[],
            laneMax: 10000,
        }
        const result = processCourseData(rawCourse)
        expect(result.corners).toEqual([{ start: 200, length: 100 }])
        expect(result.moveLanePoint).toBe(200)
    })

    it('calculates lane parameters correctly', () => {
        const rawCourse = {
            raceTrackId: 10001,
            distance: 1000,
            distanceType: DistanceType.Short,
            surface: Surface.Turf,
            turn: Orientation.Clockwise,
            courseSetStatus: [] as readonly ThresholdStat[],
            corners: [{ start: 100, length: 50 }],
            straights: [] as readonly {
                start: number
                end: number
                frontType: number
            }[],
            slopes: [] as readonly {
                start: number
                length: number
                slope: number
            }[],
            laneMax: 10000,
        }
        const result = processCourseData(rawCourse)
        expect(result.courseWidth).toBe(11.25)
        expect(result.horseLane).toBeCloseTo(0.625, 5)
        expect(result.laneChangeAcceleration).toBe(0.03)
        expect(result.maxLaneDistance).toBeCloseTo(11.25, 5)
    })
})

describe('calculateStatsFromRawResults', () => {
    it('calculates statistics correctly for odd-length array', () => {
        const rawResults = [1, 2, 3, 4, 5]
        const result = calculateStatsFromRawResults(
            rawResults,
            100,
            10,
            'Test Skill',
            95,
        )

        expect(result.skill).toBe('Test Skill')
        expect(result.cost).toBe(100)
        expect(result.discount).toBe(10)
        expect(result.numSimulations).toBe(5)
        expect(result.meanLength).toBe(3)
        expect(result.medianLength).toBe(3)
        expect(result.minLength).toBe(1)
        expect(result.maxLength).toBe(5)
        expect(result.meanLengthPerCost).toBe(0.03)
    })

    it('calculates median correctly for even-length array', () => {
        const rawResults = [1, 2, 3, 4]
        const result = calculateStatsFromRawResults(
            rawResults,
            100,
            0,
            'Test',
            95,
        )

        expect(result.medianLength).toBe(2.5)
    })

    it('calculates confidence interval correctly', () => {
        const rawResults = Array.from({ length: 100 }, (_, i) => i + 1)
        const result = calculateStatsFromRawResults(
            rawResults,
            100,
            0,
            'Test',
            95,
        )

        expect(result.ciLower).toBe(3)
        expect(result.ciUpper).toBe(98)
    })

    it('handles single result', () => {
        const rawResults = [42]
        const result = calculateStatsFromRawResults(
            rawResults,
            100,
            0,
            'Test',
            95,
        )

        expect(result.meanLength).toBe(42)
        expect(result.medianLength).toBe(42)
        expect(result.minLength).toBe(42)
        expect(result.maxLength).toBe(42)
    })

    it('accumulated results produce correct mean (simulating tiered passes)', () => {
        // Simulate 5 batches of 100 results each (like tiered simulation passes)
        // Use seeded random for reproducibility
        const seededRandom = (seed: number) => {
            const x = Math.sin(seed) * 10000
            return x - Math.floor(x)
        }

        const createBatch = (seedOffset: number) =>
            Array.from(
                { length: 100 },
                (_, i) => seededRandom(i + seedOffset) * 10,
            )

        const batch1 = createBatch(0)
        const batch2 = createBatch(100)
        const batch3 = createBatch(200)
        const batch4 = createBatch(300)
        const batch5 = createBatch(400)

        // Calculate mean of just first batch (100 sims)
        const result100 = calculateStatsFromRawResults(
            batch1,
            100,
            0,
            'Test',
            95,
        )

        // Accumulate all batches (500 sims, simulating tiered passes)
        const accumulated = [
            ...batch1,
            ...batch2,
            ...batch3,
            ...batch4,
            ...batch5,
        ]
        const result500 = calculateStatsFromRawResults(
            accumulated,
            100,
            0,
            'Test',
            95,
        )

        // Verify accumulation count is correct
        expect(result500.numSimulations).toBe(500)
        expect(result100.numSimulations).toBe(100)

        // Verify mean calculation is mathematically correct
        const expectedMean = accumulated.reduce((a, b) => a + b, 0) / 500
        expect(result500.meanLength).toBeCloseTo(expectedMean, 10)

        // Verify that accumulated mean is NOT just the first batch's mean
        // (this would catch a bug where we only use first batch)
        const batch1Mean = batch1.reduce((a, b) => a + b, 0) / 100
        expect(result500.meanLength).not.toBe(batch1Mean)

        // Verify accumulated mean equals weighted average of all batches
        const allBatchesMean =
            (batch1.reduce((a, b) => a + b, 0) +
                batch2.reduce((a, b) => a + b, 0) +
                batch3.reduce((a, b) => a + b, 0) +
                batch4.reduce((a, b) => a + b, 0) +
                batch5.reduce((a, b) => a + b, 0)) /
            500
        expect(result500.meanLength).toBeCloseTo(allBatchesMean, 10)
    })

    it('same distribution sampled twice produces similar means', () => {
        // This tests that if we run 100 vs 500 sims from the same distribution,
        // the means should be statistically similar (within reasonable variance)
        const seededRandom = (seed: number) => {
            const x = Math.sin(seed) * 10000
            return x - Math.floor(x)
        }

        // Create 500 samples from same distribution (mean ~5, range 0-10)
        const allSamples = Array.from(
            { length: 500 },
            (_, i) => seededRandom(i * 7) * 10,
        )

        const first100 = allSamples.slice(0, 100)
        const all500 = allSamples

        const result100 = calculateStatsFromRawResults(
            first100,
            100,
            0,
            'Test',
            95,
        )
        const result500 = calculateStatsFromRawResults(
            all500,
            100,
            0,
            'Test',
            95,
        )

        // Means should be within 20% of each other for same distribution
        const meanDiff = Math.abs(result100.meanLength - result500.meanLength)
        const relativeDiff = meanDiff / result500.meanLength
        expect(relativeDiff).toBeLessThan(0.2)
    })
})

describe('calculateSkillCost', () => {
    const skillMeta: Record<
        string,
        { baseCost: number; groupId?: string; order?: number }
    > = {
        skill001: { baseCost: 200 },
        skill002: { baseCost: 150, groupId: '1', order: 1 },
        skill003: { baseCost: 100, groupId: '1', order: 2 },
    }
    const context = { skillMeta }

    it('calculates base cost without discount', () => {
        const result = calculateSkillCost('skill001', { discount: 0 }, context)
        expect(result).toBe(200)
    })

    it('applies discount correctly', () => {
        const result = calculateSkillCost('skill001', { discount: 10 }, context)
        expect(result).toBe(180)
    })

    it('rounds up after discount', () => {
        const result = calculateSkillCost('skill001', { discount: 15 }, context)
        expect(result).toBe(170)
    })

    it('uses default cost of 200 for unknown skill', () => {
        const result = calculateSkillCost('unknown', { discount: 0 }, context)
        expect(result).toBe(200)
    })

    it('handles null discount as 0', () => {
        const result = calculateSkillCost(
            'skill001',
            { discount: null },
            context,
        )
        expect(result).toBe(200)
    })
})

describe('formatTable', () => {
    it('formats results table correctly', () => {
        const results: SkillResult[] = [
            {
                skill: 'Skill A',
                cost: 100,
                discount: 10,
                numSimulations: 500,
                meanLength: 5.5,
                medianLength: 5.0,
                meanLengthPerCost: 0.055,
                minLength: 1.0,
                maxLength: 10.0,
                ciLower: 2.0,
                ciUpper: 9.0,
            },
        ]

        const output = formatTable(results, 95)
        expect(output).toContain('Skill')
        expect(output).toContain('Cost')
        expect(output).toContain('Discount')
        expect(output).toContain('Mean')
        expect(output).toContain('Skill A')
        expect(output).toContain('100')
        expect(output).toContain('10%')
        expect(output).toContain('5.50')
    })

    it('formats discount as dash when 0', () => {
        const results: SkillResult[] = [
            {
                skill: 'Test',
                cost: 100,
                discount: 0,
                numSimulations: 100,
                meanLength: 5.0,
                medianLength: 5.0,
                meanLengthPerCost: 0.05,
                minLength: 1.0,
                maxLength: 10.0,
                ciLower: 2.0,
                ciUpper: 8.0,
            },
        ]

        const output = formatTable(results, 95)
        expect(output).toContain('-')
    })

    it('handles multiple results', () => {
        const results: SkillResult[] = [
            {
                skill: 'Skill A',
                cost: 100,
                discount: 10,
                numSimulations: 500,
                meanLength: 5.5,
                medianLength: 5.0,
                meanLengthPerCost: 0.055,
                minLength: 1.0,
                maxLength: 10.0,
                ciLower: 2.0,
                ciUpper: 9.0,
            },
            {
                skill: 'Longer Skill Name',
                cost: 200,
                discount: 0,
                numSimulations: 300,
                meanLength: 3.0,
                medianLength: 2.5,
                meanLengthPerCost: 0.015,
                minLength: 0.5,
                maxLength: 6.0,
                ciLower: 1.0,
                ciUpper: 5.0,
            },
        ]

        const output = formatTable(results, 95)
        const lines = output.split('\n')
        expect(lines).toHaveLength(4)
        expect(lines[0]).toContain('Skill')
        expect(lines[2]).toContain('Skill A')
        expect(lines[3]).toContain('Longer Skill Name')
    })
})

describe('buildSkillNameLookup', () => {
    it('builds lookup map from skill names', () => {
        const skillNames: Record<string, string[]> = {
            skill001: ['Speed Boost', 'スピードブースト'],
            skill002: ['Power Up', 'パワーアップ'],
        }
        const lookup = buildSkillNameLookup(skillNames)
        expect(lookup.get('speed boost')).toBe('Speed Boost')
        expect(lookup.get('power up')).toBe('Power Up')
    })

    it('maps lowercase to canonical casing', () => {
        const skillNames: Record<string, string[]> = {
            skill001: ['Victoria por Plancha ☆', 'プランチャデビクトリア☆'],
        }
        const lookup = buildSkillNameLookup(skillNames)
        expect(lookup.get('victoria por plancha ☆')).toBe(
            'Victoria por Plancha ☆',
        )
    })

    it('handles empty skill names object', () => {
        const lookup = buildSkillNameLookup({})
        expect(lookup.size).toBe(0)
    })

    it('handles skill with empty names array', () => {
        const skillNames: Record<string, string[]> = {
            skill001: [],
            skill002: ['Valid Skill'],
        }
        const lookup = buildSkillNameLookup(skillNames)
        expect(lookup.size).toBe(1)
        expect(lookup.get('valid skill')).toBe('Valid Skill')
    })

    it('handles Japanese skill names', () => {
        const skillNames: Record<string, string[]> = {
            skill001: ['右回り○', 'Right-Handed ○'],
        }
        const lookup = buildSkillNameLookup(skillNames)
        expect(lookup.get('右回り○')).toBe('右回り○')
    })
})

describe('getCanonicalSkillName', () => {
    const skillNames: Record<string, string[]> = {
        skill001: ['Speed Boost', 'スピードブースト'],
        skill002: ['Power Up', 'パワーアップ'],
        skill003: ['Victoria por Plancha ☆', 'プランチャデビクトリア☆'],
    }
    const lookup = buildSkillNameLookup(skillNames)

    it('returns canonical name for lowercase input', () => {
        expect(getCanonicalSkillName('speed boost', lookup)).toBe('Speed Boost')
    })

    it('returns canonical name for uppercase input', () => {
        expect(getCanonicalSkillName('POWER UP', lookup)).toBe('Power Up')
    })

    it('returns canonical name for mixed case input', () => {
        expect(getCanonicalSkillName('SpEeD bOoSt', lookup)).toBe('Speed Boost')
    })

    it('preserves special characters in canonical name', () => {
        expect(getCanonicalSkillName('victoria por plancha ☆', lookup)).toBe(
            'Victoria por Plancha ☆',
        )
    })

    it('returns original input when not found in lookup', () => {
        expect(getCanonicalSkillName('Unknown Skill', lookup)).toBe(
            'Unknown Skill',
        )
    })

    it('returns original input for empty lookup', () => {
        const emptyLookup = new Map<string, string>()
        expect(getCanonicalSkillName('Speed Boost', emptyLookup)).toBe(
            'Speed Boost',
        )
    })
})

describe('normalizeConfigSkillNames', () => {
    const skillNames: Record<string, string[]> = {
        skill001: ['Speed Boost', 'スピードブースト'],
        skill002: ['Power Up', 'パワーアップ'],
        skill003: ['Unique Ability', 'ユニークアビリティ'],
    }
    const lookup = buildSkillNameLookup(skillNames)

    it('normalizes skills object keys to canonical casing', () => {
        const config = {
            skills: {
                'speed boost': { discount: 10 },
                'POWER UP': { discount: 20 },
            },
        }
        const result = normalizeConfigSkillNames(config, lookup)
        expect(result.skills).toHaveProperty('Speed Boost')
        expect(result.skills).toHaveProperty('Power Up')
        expect(result.skills?.['Speed Boost']?.discount).toBe(10)
        expect(result.skills?.['Power Up']?.discount).toBe(20)
    })

    it('normalizes uma.skills array', () => {
        const config = {
            skills: {},
            uma: {
                skills: ['speed boost', 'POWER UP'],
            },
        }
        const result = normalizeConfigSkillNames(config, lookup)
        expect(result.uma?.skills).toEqual(['Speed Boost', 'Power Up'])
    })

    it('normalizes uma.unique', () => {
        const config = {
            skills: {},
            uma: {
                unique: 'unique ability',
            },
        }
        const result = normalizeConfigSkillNames(config, lookup)
        expect(result.uma?.unique).toBe('Unique Ability')
    })

    it('preserves skill data during normalization', () => {
        const config = {
            skills: {
                'speed boost': { discount: 15, default: 10 },
            },
        }
        const result = normalizeConfigSkillNames(config, lookup)
        expect(result.skills?.['Speed Boost']).toEqual({
            discount: 15,
            default: 10,
        })
    })

    it('returns config unchanged with empty lookup', () => {
        const config = {
            skills: {
                'speed boost': { discount: 10 },
            },
        }
        const emptyLookup = new Map<string, string>()
        const result = normalizeConfigSkillNames(config, emptyLookup)
        expect(result.skills).toHaveProperty('speed boost')
    })

    it('preserves unknown skill names', () => {
        const config = {
            skills: {
                'Unknown Skill': { discount: 5 },
                'speed boost': { discount: 10 },
            },
        }
        const result = normalizeConfigSkillNames(config, lookup)
        expect(result.skills).toHaveProperty('Unknown Skill')
        expect(result.skills).toHaveProperty('Speed Boost')
    })

    it('handles config without skills property', () => {
        const config = {
            uma: {
                skills: ['speed boost'],
            },
        }
        const result = normalizeConfigSkillNames(config, lookup)
        expect(result.uma?.skills).toEqual(['Speed Boost'])
    })

    it('handles config without uma property', () => {
        const config = {
            skills: {
                'speed boost': { discount: 10 },
            },
        }
        const result = normalizeConfigSkillNames(config, lookup)
        expect(result.skills).toHaveProperty('Speed Boost')
        expect(result.uma).toBeUndefined()
    })

    it('preserves other uma properties', () => {
        const config = {
            skills: {},
            uma: {
                skills: ['speed boost'],
                unique: 'unique ability',
                speed: 1200,
                stamina: 800,
            },
        }
        const result = normalizeConfigSkillNames(config, lookup)
        expect(result.uma?.speed).toBe(1200)
        expect(result.uma?.stamina).toBe(800)
    })
})

describe('getDistanceType', () => {
    it.each([
        [1000, 1],
        [1200, 1],
        [1400, 1],
        [1401, 2],
        [1600, 2],
        [1800, 2],
        [1801, 3],
        [2000, 3],
        [2400, 3],
        [2401, 4],
        [3000, 4],
        [3600, 4],
    ])('returns correct distance type for %dm', (distance, expected) => {
        expect(getDistanceType(distance)).toBe(expected)
    })
})

describe('STRATEGY_TO_RUNNING_STYLE', () => {
    it('maps Japanese strategy names', () => {
        expect(STRATEGY_TO_RUNNING_STYLE.Nige).toBe(1) // Front Runner
        expect(STRATEGY_TO_RUNNING_STYLE.Senkou).toBe(2) // Pace Chaser
        expect(STRATEGY_TO_RUNNING_STYLE.Sasi).toBe(3) // Late Surger
        expect(STRATEGY_TO_RUNNING_STYLE.Oikomi).toBe(4) // End Closer
        expect(STRATEGY_TO_RUNNING_STYLE.Oonige).toBe(5) // Runaway
    })

    it('maps English strategy names', () => {
        expect(STRATEGY_TO_RUNNING_STYLE['Front Runner']).toBe(1)
        expect(STRATEGY_TO_RUNNING_STYLE['Pace Chaser']).toBe(2)
        expect(STRATEGY_TO_RUNNING_STYLE['Late Surger']).toBe(3)
        expect(STRATEGY_TO_RUNNING_STYLE['End Closer']).toBe(4)
        expect(STRATEGY_TO_RUNNING_STYLE.Runaway).toBe(5)
    })
})

describe('TRACK_NAME_TO_ID', () => {
    it('maps track names to IDs', () => {
        expect(TRACK_NAME_TO_ID.Tokyo).toBe(10006)
        expect(TRACK_NAME_TO_ID.Nakayama).toBe(10005)
        expect(TRACK_NAME_TO_ID.Kyoto).toBe(10008)
        expect(TRACK_NAME_TO_ID.Hanshin).toBe(10009)
        expect(TRACK_NAME_TO_ID.Ooi).toBe(10101)
    })
})

describe('extractStaticRestrictions', () => {
    it('extracts single distance_type restriction', () => {
        const result = extractStaticRestrictions('distance_type==4&phase>=2')
        expect(result.distanceTypes).toEqual([4])
    })

    it('extracts single running_style restriction', () => {
        const result = extractStaticRestrictions('running_style==1&phase==0')
        expect(result.runningStyles).toEqual([1])
    })

    it('extracts track_id restriction', () => {
        const result = extractStaticRestrictions('track_id==10006')
        expect(result.trackIds).toEqual([10006])
    })

    it('extracts ground_condition restriction', () => {
        const result = extractStaticRestrictions('ground_condition==1')
        expect(result.groundConditions).toEqual([1])
    })

    it('extracts ground_type restriction', () => {
        const result = extractStaticRestrictions('ground_type==2&phase==1')
        expect(result.groundTypes).toEqual([2])
    })

    it('extracts weather restriction', () => {
        const result = extractStaticRestrictions('weather==3')
        expect(result.weathers).toEqual([3])
    })

    it('extracts season restriction', () => {
        const result = extractStaticRestrictions('season==2')
        expect(result.seasons).toEqual([2])
    })

    it('merges OR alternatives for same field', () => {
        const result = extractStaticRestrictions(
            'ground_condition==2@ground_condition==3@ground_condition==4',
        )
        expect(result.groundConditions).toEqual([2, 3, 4])
    })

    it('merges OR alternatives for season with spring/sakura', () => {
        const result = extractStaticRestrictions('season==1@season==5')
        expect(result.seasons).toEqual([1, 5])
    })

    it('returns empty for conditions without static restrictions', () => {
        const result = extractStaticRestrictions(
            'phase>=2&order>=1&order_rate<=50',
        )
        expect(result.distanceTypes).toBeUndefined()
        expect(result.runningStyles).toBeUndefined()
        expect(result.groundTypes).toBeUndefined()
    })

    it('handles empty condition string', () => {
        const result = extractStaticRestrictions('')
        expect(result).toEqual({})
    })

    it('intersects condition and precondition restrictions', () => {
        const result = extractStaticRestrictions(
            'running_style==1&phase==0',
            'distance_type==4',
        )
        expect(result.runningStyles).toEqual([1])
        expect(result.distanceTypes).toEqual([4])
    })

    it('handles OR in both condition and precondition', () => {
        const result = extractStaticRestrictions(
            'season==1@season==2',
            'weather==1@weather==2',
        )
        expect(result.seasons).toEqual([1, 2])
        expect(result.weathers).toEqual([1, 2])
    })

    it('returns undefined when OR branches have different field restrictions', () => {
        // If one OR branch has no restriction on a field, the merged result has no restriction
        const result = extractStaticRestrictions(
            'distance_type==4&phase==1@phase==2',
        )
        expect(result.distanceTypes).toBeUndefined()
    })
})

describe('canSkillTrigger', () => {
    it('returns true when no restrictions', () => {
        const restrictions: SkillRestrictions = {}
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('returns true when distance type matches', () => {
        const restrictions: SkillRestrictions = { distanceTypes: [4] }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('returns false when distance type does not match', () => {
        const restrictions: SkillRestrictions = { distanceTypes: [4] }
        const settings: CurrentSettings = {
            distanceType: 2,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('returns true when distance type is null (random)', () => {
        const restrictions: SkillRestrictions = { distanceTypes: [4] }
        const settings: CurrentSettings = {
            distanceType: null,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('returns false when running style does not match', () => {
        const restrictions: SkillRestrictions = { runningStyles: [1] }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('returns true when running style matches one of allowed values', () => {
        const restrictions: SkillRestrictions = { runningStyles: [1, 2, 3] }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 2,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('returns false when track id does not match', () => {
        const restrictions: SkillRestrictions = { trackIds: [10006] }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10008,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('returns true when track id is null (random location)', () => {
        const restrictions: SkillRestrictions = { trackIds: [10006] }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('returns false when ground condition does not match', () => {
        const restrictions: SkillRestrictions = { groundConditions: [2, 3, 4] }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('returns true when ground condition is null (random)', () => {
        const restrictions: SkillRestrictions = { groundConditions: [2, 3, 4] }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: null,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('checks multiple restrictions together', () => {
        const restrictions: SkillRestrictions = {
            distanceTypes: [4],
            runningStyles: [3],
            groundTypes: [1],
        }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('returns false if any restriction fails', () => {
        const restrictions: SkillRestrictions = {
            distanceTypes: [4],
            runningStyles: [1], // Does not match
            groundTypes: [1],
        }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })
})

describe('extractSkillRestrictions', () => {
    it('extracts restrictions from skill with single alternative', () => {
        const skillData: SkillDataEntry = {
            alternatives: [
                {
                    baseDuration: 50000,
                    condition: 'distance_type==4&phase>=2',
                    effects: [],
                    precondition: '',
                },
            ],
            rarity: 4,
            wisdomCheck: 0,
        }
        const result = extractSkillRestrictions(skillData)
        expect(result.distanceTypes).toEqual([4])
    })

    it('merges restrictions from multiple alternatives', () => {
        const skillData: SkillDataEntry = {
            alternatives: [
                {
                    baseDuration: 50000,
                    condition: 'running_style==1&phase==0',
                    effects: [],
                    precondition: '',
                },
                {
                    baseDuration: 50000,
                    condition: 'running_style==2&phase==0',
                    effects: [],
                    precondition: '',
                },
            ],
            rarity: 4,
            wisdomCheck: 0,
        }
        const result = extractSkillRestrictions(skillData)
        expect(result.runningStyles).toEqual([1, 2])
    })

    it('returns empty for skill without restrictions', () => {
        const skillData: SkillDataEntry = {
            alternatives: [
                {
                    baseDuration: 50000,
                    condition: 'phase>=2&order>=1',
                    effects: [],
                    precondition: '',
                },
            ],
            rarity: 4,
            wisdomCheck: 0,
        }
        const result = extractSkillRestrictions(skillData)
        expect(result.distanceTypes).toBeUndefined()
        expect(result.runningStyles).toBeUndefined()
    })

    it('returns empty for skill with no alternatives', () => {
        const skillData: SkillDataEntry = {
            alternatives: [],
            rarity: 4,
            wisdomCheck: 0,
        }
        const result = extractSkillRestrictions(skillData)
        expect(result).toEqual({})
    })

    it('handles precondition in alternatives', () => {
        const skillData: SkillDataEntry = {
            alternatives: [
                {
                    baseDuration: 50000,
                    condition: 'phase>=2',
                    effects: [],
                    precondition: 'ground_type==2',
                },
            ],
            rarity: 4,
            wisdomCheck: 0,
        }
        const result = extractSkillRestrictions(skillData)
        expect(result.groundTypes).toEqual([2])
    })
})

describe('extractStaticRestrictions with inequality operators', () => {
    it('expands distance_type>=3 to [3, 4]', () => {
        const result = extractStaticRestrictions('distance_type>=3')
        expect(result.distanceTypes).toEqual([3, 4])
    })

    it('expands distance_type<=2 to [1, 2]', () => {
        const result = extractStaticRestrictions('distance_type<=2')
        expect(result.distanceTypes).toEqual([1, 2])
    })

    it('expands distance_type>2 to [3, 4]', () => {
        const result = extractStaticRestrictions('distance_type>2')
        expect(result.distanceTypes).toEqual([3, 4])
    })

    it('expands distance_type<3 to [1, 2]', () => {
        const result = extractStaticRestrictions('distance_type<3')
        expect(result.distanceTypes).toEqual([1, 2])
    })

    it('expands ground_condition>=3 to [3, 4]', () => {
        const result = extractStaticRestrictions('ground_condition>=3')
        expect(result.groundConditions).toEqual([3, 4])
    })

    it('expands running_style<=3 to [1, 2, 3]', () => {
        const result = extractStaticRestrictions('running_style<=3')
        expect(result.runningStyles).toEqual([1, 2, 3])
    })

    it('expands season>=4 to [4, 5]', () => {
        const result = extractStaticRestrictions('season>=4')
        expect(result.seasons).toEqual([4, 5])
    })

    it('expands weather<=2 to [1, 2]', () => {
        const result = extractStaticRestrictions('weather<=2')
        expect(result.weathers).toEqual([1, 2])
    })

    it('does not expand track_id with inequality', () => {
        const result = extractStaticRestrictions('track_id>=10006')
        expect(result.trackIds).toEqual([10006])
    })

    it('handles >= at boundary (max value)', () => {
        const result = extractStaticRestrictions('distance_type>=4')
        expect(result.distanceTypes).toEqual([4])
    })

    it('handles <= at boundary (1)', () => {
        const result = extractStaticRestrictions('ground_type<=1')
        expect(result.groundTypes).toEqual([1])
    })

    it('handles > at max-1 (produces single value)', () => {
        const result = extractStaticRestrictions('ground_type>1')
        expect(result.groundTypes).toEqual([2])
    })

    it('handles < at 2 (produces single value)', () => {
        const result = extractStaticRestrictions('ground_type<2')
        expect(result.groundTypes).toEqual([1])
    })

    it('handles > at max (produces empty array)', () => {
        const result = extractStaticRestrictions('ground_type>2')
        expect(result.groundTypes).toEqual([])
    })

    it('handles < at 1 (produces empty array)', () => {
        const result = extractStaticRestrictions('distance_type<1')
        expect(result.distanceTypes).toEqual([])
    })
})

describe('canSkillTrigger with empty restriction arrays', () => {
    it('returns false when distanceTypes is empty array', () => {
        const restrictions: SkillRestrictions = { distanceTypes: [] }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('returns false when runningStyles is empty array', () => {
        const restrictions: SkillRestrictions = { runningStyles: [] }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('returns false when groundTypes is empty array', () => {
        const restrictions: SkillRestrictions = { groundTypes: [] }
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('returns false when empty array even with null setting', () => {
        const restrictions: SkillRestrictions = { distanceTypes: [] }
        const settings: CurrentSettings = {
            distanceType: null, // Random distance type
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('returns false when intersection produces empty array', () => {
        // Condition requires distance_type==1, precondition requires distance_type==4
        // Intersection produces empty array - impossible condition
        const result = extractStaticRestrictions(
            'distance_type==1',
            'distance_type==4',
        )
        expect(result.distanceTypes).toEqual([])
        const settings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 3,
            groundType: 1,
            isBasisDistance: null,
            groundCondition: 1,
            weather: 1,
            season: 1,
            trackId: 10006,
        }
        expect(canSkillTrigger(result, settings)).toBe(false)
    })
})

describe('skill filtering by distance type', () => {
    // Tests for filtering skills like "Long Straightaways ○" (distance_type==4),
    // "Medium Straightaways ○" (distance_type==3), etc.

    it('getDistanceType: 2000m maps to Medium (3)', () => {
        expect(getDistanceType(2000)).toBe(3)
    })

    it('getDistanceType: 3000m maps to Long (4)', () => {
        expect(getDistanceType(3000)).toBe(4)
    })

    it('Long Straightaways ○ is filtered OUT when distance is 2000m (Medium)', () => {
        // Long Straightaways ○ has condition: distance_type==4
        const restrictions = extractStaticRestrictions(
            'distance_type==4&straight_random==1',
        )
        expect(restrictions.distanceTypes).toEqual([4])

        const settings: CurrentSettings = {
            distanceType: getDistanceType(2000), // 3 (Medium)
            runningStyle: 3,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(settings.distanceType).toBe(3) // Verify 2000m -> Medium
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('Medium Straightaways ○ triggers when distance is 2000m (Medium)', () => {
        // Medium Straightaways ○ has condition: distance_type==3
        const restrictions = extractStaticRestrictions(
            'distance_type==3&straight_random==1',
        )
        expect(restrictions.distanceTypes).toEqual([3])

        const settings: CurrentSettings = {
            distanceType: getDistanceType(2000), // 3 (Medium)
            runningStyle: 3,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('Long Straightaways ○ triggers when distance is 3000m (Long)', () => {
        // Long Straightaways ○ has condition: distance_type==4
        const restrictions = extractStaticRestrictions(
            'distance_type==4&straight_random==1',
        )
        expect(restrictions.distanceTypes).toEqual([4])

        const settings: CurrentSettings = {
            distanceType: getDistanceType(3000), // 4 (Long)
            runningStyle: 3,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(settings.distanceType).toBe(4) // Verify 3000m -> Long
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('Medium Straightaways ○ is filtered OUT when distance is 3000m (Long)', () => {
        // Medium Straightaways ○ has condition: distance_type==3
        const restrictions = extractStaticRestrictions(
            'distance_type==3&straight_random==1',
        )
        expect(restrictions.distanceTypes).toEqual([3])

        const settings: CurrentSettings = {
            distanceType: getDistanceType(3000), // 4 (Long)
            runningStyle: 3,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('Sprint Straightaways ○ only triggers at Sprint distances (<=1400m)', () => {
        const restrictions = extractStaticRestrictions(
            'distance_type==1&straight_random==1',
        )
        expect(restrictions.distanceTypes).toEqual([1])

        // 1200m = Sprint
        const sprintSettings: CurrentSettings = {
            distanceType: getDistanceType(1200), // 1 (Sprint)
            runningStyle: 3,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(sprintSettings.distanceType).toBe(1)
        expect(canSkillTrigger(restrictions, sprintSettings)).toBe(true)

        // 1600m = Mile
        const mileSettings: CurrentSettings = {
            distanceType: getDistanceType(1600), // 2 (Mile)
            runningStyle: 3,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(mileSettings.distanceType).toBe(2)
        expect(canSkillTrigger(restrictions, mileSettings)).toBe(false)
    })

    it('Mile Straightaways ○ only triggers at Mile distances (1401-1800m)', () => {
        const restrictions = extractStaticRestrictions(
            'distance_type==2&straight_random==1',
        )
        expect(restrictions.distanceTypes).toEqual([2])

        // 1600m = Mile
        const mileSettings: CurrentSettings = {
            distanceType: getDistanceType(1600), // 2 (Mile)
            runningStyle: 3,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, mileSettings)).toBe(true)

        // 2000m = Medium
        const mediumSettings: CurrentSettings = {
            distanceType: getDistanceType(2000), // 3 (Medium)
            runningStyle: 3,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, mediumSettings)).toBe(false)
    })

    it('skills with distance_type restriction pass when distanceType is null (random)', () => {
        const restrictions = extractStaticRestrictions(
            'distance_type==4&straight_random==1',
        )

        const randomSettings: CurrentSettings = {
            distanceType: null, // Random distance (e.g., <Random> or distance category)
            runningStyle: 3,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        // When distanceType is null (random), skill should pass (might trigger)
        expect(canSkillTrigger(restrictions, randomSettings)).toBe(true)
    })
})

describe('extractSkillRestrictions integration with distance filtering', () => {
    it('extracts distance_type from skill with alternatives', () => {
        // Simulating Long Straightaways ○ skill data
        const skillData: SkillDataEntry = {
            alternatives: [
                {
                    baseDuration: 30000,
                    condition: 'distance_type==4&straight_random==1',
                    effects: [],
                    precondition: '',
                },
            ],
            rarity: 1,
            wisdomCheck: 1,
        }
        const restrictions = extractSkillRestrictions(skillData)
        expect(restrictions.distanceTypes).toEqual([4])
    })

    it('combines distance filter with running style filter', () => {
        // Skill that requires both Long distance AND Front Runner
        const restrictions = extractStaticRestrictions(
            'distance_type==4&running_style==1&phase>=2',
        )
        expect(restrictions.distanceTypes).toEqual([4])
        expect(restrictions.runningStyles).toEqual([1])

        // Long distance, Front Runner - should pass
        const validSettings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 1,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, validSettings)).toBe(true)

        // Long distance, Pace Chaser - should fail (wrong running style)
        const wrongStyleSettings: CurrentSettings = {
            distanceType: 4,
            runningStyle: 2,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, wrongStyleSettings)).toBe(false)

        // Medium distance, Front Runner - should fail (wrong distance)
        const wrongDistanceSettings: CurrentSettings = {
            distanceType: 3,
            runningStyle: 1,
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, wrongDistanceSettings)).toBe(false)
    })
})

describe('skill filtering by strategy', () => {
    // Use canonical "<Strategy> Straightaways ○" skills which have running_style==N conditions

    it('Front Runner Straightaways ○ triggers for Front Runner', () => {
        // running_style==1
        const restrictions = extractStaticRestrictions(
            'running_style==1&straight_random==1',
        )
        const settings: CurrentSettings = {
            distanceType: null,
            runningStyle: STRATEGY_TO_RUNNING_STYLE['Front Runner'], // 1
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('Front Runner Straightaways ○ does NOT trigger for Pace Chaser', () => {
        const restrictions = extractStaticRestrictions(
            'running_style==1&straight_random==1',
        )
        const settings: CurrentSettings = {
            distanceType: null,
            runningStyle: STRATEGY_TO_RUNNING_STYLE['Pace Chaser'], // 2
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('Pace Chaser Straightaways ○ triggers for Pace Chaser', () => {
        // running_style==2
        const restrictions = extractStaticRestrictions(
            'running_style==2&straight_random==1',
        )
        const settings: CurrentSettings = {
            distanceType: null,
            runningStyle: STRATEGY_TO_RUNNING_STYLE['Pace Chaser'], // 2
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('Pace Chaser Straightaways ○ does NOT trigger for Front Runner', () => {
        const restrictions = extractStaticRestrictions(
            'running_style==2&straight_random==1',
        )
        const settings: CurrentSettings = {
            distanceType: null,
            runningStyle: STRATEGY_TO_RUNNING_STYLE['Front Runner'], // 1
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('Late Surger Straightaways ○ triggers for Late Surger', () => {
        // running_style==3
        const restrictions = extractStaticRestrictions(
            'running_style==3&straight_random==1',
        )
        const settings: CurrentSettings = {
            distanceType: null,
            runningStyle: STRATEGY_TO_RUNNING_STYLE['Late Surger'], // 3
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('End Closer Straightaways ○ triggers for End Closer', () => {
        // running_style==4
        const restrictions = extractStaticRestrictions(
            'running_style==4&straight_random==1',
        )
        const settings: CurrentSettings = {
            distanceType: null,
            runningStyle: STRATEGY_TO_RUNNING_STYLE['End Closer'], // 4
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    // Special case: Runaway uses Front Runner skills
    it('Front Runner Straightaways ○ triggers for Runaway (special case)', () => {
        // Runaway (5) should match running_style==1 skills because there are no Runaway-specific skills
        const restrictions = extractStaticRestrictions(
            'running_style==1&straight_random==1',
        )
        const settings: CurrentSettings = {
            distanceType: null,
            runningStyle: STRATEGY_TO_RUNNING_STYLE.Runaway, // 5
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('Pace Chaser Straightaways ○ does NOT trigger for Runaway', () => {
        const restrictions = extractStaticRestrictions(
            'running_style==2&straight_random==1',
        )
        const settings: CurrentSettings = {
            distanceType: null,
            runningStyle: STRATEGY_TO_RUNNING_STYLE.Runaway, // 5
            groundType: null,
            isBasisDistance: null,
            groundCondition: null,
            weather: null,
            season: null,
            trackId: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })
})

describe('A Small Breather filtering', () => {
    it('A Small Breather (Late Surger skill) should NOT trigger for Pace Chaser', () => {
        // A Small Breather has condition: running_style==3&phase_random==2
        const restrictions = extractStaticRestrictions(
            'running_style==3&phase_random==2',
        )
        expect(restrictions.runningStyles).toEqual([3]) // Late Surger

        const settings: CurrentSettings = {
            distanceType: 4,
            groundCondition: 1,
            groundType: 1,
            isBasisDistance: false,
            runningStyle: STRATEGY_TO_RUNNING_STYLE['Pace Chaser'], // 2
            season: 4,
            trackId: 10005,
            weather: 1,
        }
        expect(settings.runningStyle).toBe(2) // Verify Pace Chaser = 2
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('A Small Breather (Late Surger skill) SHOULD trigger for Late Surger', () => {
        const restrictions = extractStaticRestrictions(
            'running_style==3&phase_random==2',
        )
        expect(restrictions.runningStyles).toEqual([3])

        const settings: CurrentSettings = {
            distanceType: 4,
            groundCondition: 1,
            groundType: 1,
            isBasisDistance: false,
            runningStyle: STRATEGY_TO_RUNNING_STYLE['Late Surger'], // 3
            season: 4,
            trackId: 10005,
            weather: 1,
        }
        expect(settings.runningStyle).toBe(3) // Verify Late Surger = 3
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })
})

describe('is_basis_distance filtering', () => {
    it('extracts is_basis_distance==1 restriction for standard distance skills', () => {
        const result = extractStaticRestrictions(
            'is_basis_distance==1&phase>=2',
        )
        expect(result.isBasisDistance).toEqual([1])
    })

    it('extracts is_basis_distance==0 restriction for non-standard distance skills', () => {
        const result = extractStaticRestrictions(
            'is_basis_distance==0&phase>=2',
        )
        expect(result.isBasisDistance).toEqual([0])
    })

    it('returns true for standard distance skill on 2400m (divisible by 400)', () => {
        const restrictions: SkillRestrictions = { isBasisDistance: [1] }
        const settings: CurrentSettings = {
            distanceType: 3,
            groundCondition: 1,
            groundType: 1,
            isBasisDistance: true, // 2400m % 400 == 0
            runningStyle: 3,
            season: 1,
            trackId: 10006,
            weather: 1,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('returns false for standard distance skill on 2500m (not divisible by 400)', () => {
        const restrictions: SkillRestrictions = { isBasisDistance: [1] }
        const settings: CurrentSettings = {
            distanceType: 4,
            groundCondition: 1,
            groundType: 1,
            isBasisDistance: false, // 2500m % 400 != 0
            runningStyle: 3,
            season: 1,
            trackId: 10006,
            weather: 1,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('returns true for non-standard distance skill on 2500m', () => {
        const restrictions: SkillRestrictions = { isBasisDistance: [0] }
        const settings: CurrentSettings = {
            distanceType: 4,
            groundCondition: 1,
            groundType: 1,
            isBasisDistance: false, // 2500m % 400 != 0
            runningStyle: 3,
            season: 1,
            trackId: 10006,
            weather: 1,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('returns false for non-standard distance skill on 2000m', () => {
        const restrictions: SkillRestrictions = { isBasisDistance: [0] }
        const settings: CurrentSettings = {
            distanceType: 3,
            groundCondition: 1,
            groundType: 1,
            isBasisDistance: true, // 2000m % 400 == 0
            runningStyle: 3,
            season: 1,
            trackId: 10006,
            weather: 1,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })

    it('returns true when isBasisDistance is null (random/category)', () => {
        const restrictions: SkillRestrictions = { isBasisDistance: [1] }
        const settings: CurrentSettings = {
            distanceType: null,
            groundCondition: null,
            groundType: null,
            isBasisDistance: null, // Random courses
            runningStyle: 3,
            season: null,
            trackId: null,
            weather: null,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(true)
    })

    it('returns false for empty isBasisDistance array (impossible condition)', () => {
        const restrictions: SkillRestrictions = { isBasisDistance: [] }
        const settings: CurrentSettings = {
            distanceType: 3,
            groundCondition: 1,
            groundType: 1,
            isBasisDistance: true,
            runningStyle: 3,
            season: 1,
            trackId: 10006,
            weather: 1,
        }
        expect(canSkillTrigger(restrictions, settings)).toBe(false)
    })
})
