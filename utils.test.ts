import { describe, it, expect } from 'vitest'
import {
    GroundCondition,
    Season,
} from '../uma-tools/uma-skill-tools/RaceParameters'
import {
    DistanceType,
    Surface,
    Orientation,
    type ThresholdStat,
} from '../uma-tools/uma-skill-tools/CourseData'
import {
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
    type SkillResult,
} from './utils'

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
})

describe('calculateSkillCost', () => {
    const skillMeta: Record<
        string,
        { baseCost: number; groupId?: number; order?: number }
    > = {
        skill001: { baseCost: 200 },
        skill002: { baseCost: 150, groupId: 1, order: 1 },
        skill003: { baseCost: 100, groupId: 1, order: 2 },
    }

    it('calculates base cost without discount', () => {
        const result = calculateSkillCost('skill001', skillMeta, {
            discount: 0,
        })
        expect(result).toBe(200)
    })

    it('applies discount correctly', () => {
        const result = calculateSkillCost('skill001', skillMeta, {
            discount: 10,
        })
        expect(result).toBe(180)
    })

    it('rounds up after discount', () => {
        const result = calculateSkillCost('skill001', skillMeta, {
            discount: 15,
        })
        expect(result).toBe(170)
    })

    it('uses default cost of 200 for unknown skill', () => {
        const result = calculateSkillCost('unknown', skillMeta, {
            discount: 0,
        })
        expect(result).toBe(200)
    })

    it('handles null discount as 0', () => {
        const result = calculateSkillCost('skill001', skillMeta, {
            discount: null,
        })
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
