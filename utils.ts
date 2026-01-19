// Local constants mirroring const enum values (const enums aren't exported at runtime)
const GroundCondition = { Good: 1, Heavy: 4, Soft: 3, Yielding: 2 } as const
type GroundCondition = (typeof GroundCondition)[keyof typeof GroundCondition]
const Season = { Autumn: 3, Sakura: 5, Spring: 1, Summer: 2, Winter: 4 } as const
type Season = (typeof Season)[keyof typeof Season]
import type {
    DistanceType,
    Surface,
    Orientation,
    ThresholdStat,
} from '../uma-tools/uma-skill-tools/CourseData'

// Mapping constants for parsing functions
const CONDITION_MAP: Record<string, GroundCondition> = {
    firm: GroundCondition.Good,
    good: GroundCondition.Yielding,
    soft: GroundCondition.Soft,
    heavy: GroundCondition.Heavy,
}

const WEATHER_MAP: Record<string, number> = {
    sunny: 1,
    cloudy: 2,
    rainy: 3,
    snowy: 4,
}

const SEASON_MAP: Record<string, Season> = {
    spring: Season.Spring,
    summer: Season.Summer,
    fall: Season.Autumn,
    autumn: Season.Autumn,
    winter: Season.Winter,
    sakura: Season.Sakura,
}

const STRATEGY_TO_INTERNAL: Record<string, string> = {
    runaway: 'Oonige',
    'front runner': 'Nige',
    'pace chaser': 'Senkou',
    'late surger': 'Sasi',
    'end closer': 'Oikomi',
    oonige: 'Oonige',
    nige: 'Nige',
    senkou: 'Senkou',
    sasi: 'Sasi',
    oikomi: 'Oikomi',
}

const STRATEGY_TO_DISPLAY: Record<string, string> = {
    Oonige: 'Runaway',
    Nige: 'Front Runner',
    Senkou: 'Pace Chaser',
    Sasi: 'Late Surger',
    Oikomi: 'End Closer',
}

function parseWithMap<T>(
    value: string,
    map: Record<string, T>,
    context: string,
): T {
    const normalized = value.toLowerCase().trim()
    const result = map[normalized]
    if (result === undefined) {
        throw new Error(`Invalid ${context}: ${value}`)
    }
    return result
}

export interface CourseData {
    readonly raceTrackId: number
    readonly distance: number
    readonly distanceType: DistanceType
    readonly surface: Surface
    readonly turn: Orientation
    readonly courseSetStatus: readonly ThresholdStat[]
    readonly corners: readonly {
        readonly start: number
        readonly length: number
    }[]
    readonly straights: readonly {
        readonly start: number
        readonly end: number
        readonly frontType: number
    }[]
    readonly slopes: readonly {
        readonly start: number
        readonly length: number
        readonly slope: number
    }[]
    readonly courseWidth: number
    readonly horseLane: number
    readonly laneChangeAcceleration: number
    readonly laneChangeAccelerationPerFrame: number
    readonly maxLaneDistance: number
    readonly moveLanePoint: number
}

export interface SkillResult {
    skill: string
    cost: number
    discount: number
    numSimulations: number
    meanLength: number
    medianLength: number
    meanLengthPerCost: number
    minLength: number
    maxLength: number
    ciLower: number
    ciUpper: number
}

export function parseGroundCondition(name: string): GroundCondition {
    return parseWithMap(name, CONDITION_MAP, 'ground condition')
}

export function parseWeather(name: string): number {
    return parseWithMap(name, WEATHER_MAP, 'weather')
}

export function parseSeason(name: string): Season {
    return parseWithMap(name, SEASON_MAP, 'season')
}

export function parseStrategyName(name: string): string {
    return parseWithMap(name, STRATEGY_TO_INTERNAL, 'strategy')
}

export function formatStrategyName(japaneseName: string): string {
    return STRATEGY_TO_DISPLAY[japaneseName] ?? japaneseName
}

export function formatDistanceType(distanceType: number): string {
    switch (distanceType) {
        case 1:
            return 'Sprint'
        case 2:
            return 'Mile'
        case 3:
            return 'Medium'
        case 4:
            return 'Long'
        default:
            throw new Error(`Invalid distance type: ${distanceType}`)
    }
}

export function formatSurface(surface: number): string {
    if (surface === 1) return 'Turf'
    if (surface === 2) return 'Dirt'
    throw new Error(`Invalid surface: ${surface}`)
}

export function formatTurn(turn: number): string {
    if (turn === 1) return 'Right'
    if (turn === 2) return 'Left'
    if (turn === 4) return 'Straight'
    throw new Error(`Invalid turn: ${turn}`)
}

export function parseSurface(surface: string | undefined): number | null {
    if (!surface) return null
    const normalized = surface.toLowerCase().trim()
    if (normalized === 'turf') return 1
    if (normalized === 'dirt') return 2
    return null
}

export function parseDistanceCategory(
    distance: string | number | undefined,
): number | null {
    if (typeof distance === 'number') return null
    if (!distance) return null
    const normalized = distance.toLowerCase().trim()
    switch (normalized) {
        case '<sprint>':
            return 1
        case '<mile>':
            return 2
        case '<medium>':
            return 3
        case '<long>':
            return 4
        default:
            return null
    }
}

export function isRandomLocation(trackName: string | undefined): boolean {
    if (!trackName) return false
    return trackName.toLowerCase().trim() === '<random>'
}

export function isRandomValue(value: string | undefined): boolean {
    if (!value) return false
    return value.toLowerCase().trim() === '<random>'
}

export function shuffleArray<T>(array: T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
}

export function createWeightedSeasonArray(): Season[] {
    const result: Season[] = []
    for (let i = 0; i < 40; i++) result.push(Season.Spring)
    for (let i = 0; i < 22; i++) result.push(Season.Summer)
    for (let i = 0; i < 12; i++) result.push(Season.Autumn)
    for (let i = 0; i < 26; i++) result.push(Season.Winter)
    return shuffleArray(result)
}

export function createWeightedWeatherArray(): number[] {
    const result: number[] = []
    for (let i = 0; i < 58; i++) result.push(1)
    for (let i = 0; i < 30; i++) result.push(2)
    for (let i = 0; i < 11; i++) result.push(3)
    for (let i = 0; i < 1; i++) result.push(4)
    return shuffleArray(result)
}

export function createWeightedConditionArray(): GroundCondition[] {
    const result: GroundCondition[] = []
    for (let i = 0; i < 77; i++) result.push(GroundCondition.Good)
    for (let i = 0; i < 11; i++) result.push(GroundCondition.Yielding)
    for (let i = 0; i < 7; i++) result.push(GroundCondition.Soft)
    for (let i = 0; i < 5; i++) result.push(GroundCondition.Heavy)
    return shuffleArray(result)
}

export function findAllSkillIdsByName(
    skillName: string,
    skillNames: Record<string, string[]>,
): string[] {
    const matches: string[] = []
    const normalizedInput = skillName.toLowerCase()
    for (const [id, names] of Object.entries(skillNames)) {
        if (names[0].toLowerCase() === normalizedInput) {
            matches.push(id)
        }
    }
    return matches
}

export function findSkillIdByNameWithPreference(
    skillName: string,
    skillNames: Record<string, string[]>,
    skillMeta: Record<string, { baseCost: number }>,
    preferCostGreaterThanZero: boolean,
): string | null {
    const matches = findAllSkillIdsByName(skillName, skillNames)
    if (matches.length === 0) {
        return null
    }
    if (matches.length === 1) {
        return matches[0]
    }

    const preferred = matches.filter((id) => {
        const baseCost = skillMeta[id]?.baseCost ?? 200
        return preferCostGreaterThanZero ? baseCost > 0 : baseCost === 0
    })

    if (preferred.length > 0) {
        return preferred[0]
    }

    return matches[0]
}

export function findSkillVariantsByName(
    baseSkillName: string,
    skillNames: Record<string, string[]>,
    skillMeta: Record<string, { baseCost: number }>,
): Array<{ skillId: string; skillName: string }> {
    const variants: Array<{ skillId: string; skillName: string }> = []
    const trimmedBaseName = baseSkillName.trim()
    const normalizedBaseName = trimmedBaseName.toLowerCase()

    const exactMatchId = findSkillIdByNameWithPreference(
        trimmedBaseName,
        skillNames,
        skillMeta,
        true,
    )
    if (exactMatchId) {
        const baseCost = skillMeta[exactMatchId]?.baseCost ?? 200
        if (baseCost > 0) {
            const canonicalName = skillNames[exactMatchId][0]
            variants.push({
                skillId: exactMatchId,
                skillName: canonicalName,
            })
            return variants
        }
    }

    for (const [id, names] of Object.entries(skillNames)) {
        const name = names[0]
        const normalizedName = name.toLowerCase()
        if (
            normalizedName === `${normalizedBaseName} ○` ||
            normalizedName === `${normalizedBaseName} ◎`
        ) {
            const baseCost = skillMeta[id]?.baseCost ?? 200
            if (baseCost > 0) {
                variants.push({ skillId: id, skillName: name })
            }
        }
    }

    return variants
}

export function processCourseData(rawCourse: {
    raceTrackId: number
    distance: number
    distanceType: DistanceType
    surface: Surface
    turn: Orientation
    courseSetStatus: readonly ThresholdStat[]
    corners: Array<{ start: number; length: number }>
    straights: readonly { start: number; end: number; frontType: number }[]
    slopes: readonly { start: number; length: number; slope: number }[]
    laneMax: number
    [key: string]: unknown
}): CourseData {
    const courseWidth = 11.25
    const horseLane = courseWidth / 18.0
    const laneChangeAcceleration = 0.02 * 1.5
    const laneChangeAccelerationPerFrame = laneChangeAcceleration / 15.0
    const maxLaneDistance = (courseWidth * rawCourse.laneMax) / 10000.0

    const corners =
        rawCourse.corners.length > 0
            ? rawCourse.corners
            : [{ start: rawCourse.distance, length: 0 }]

    const moveLanePoint = corners[0].start

    return {
        raceTrackId: rawCourse.raceTrackId,
        distance: rawCourse.distance,
        distanceType: rawCourse.distanceType,
        surface: rawCourse.surface,
        turn: rawCourse.turn,
        courseSetStatus: rawCourse.courseSetStatus,
        corners,
        straights: rawCourse.straights,
        slopes: rawCourse.slopes,
        courseWidth,
        horseLane,
        laneChangeAcceleration,
        laneChangeAccelerationPerFrame,
        maxLaneDistance,
        moveLanePoint,
    }
}

export function calculateStatsFromRawResults(
    rawResults: number[],
    cost: number,
    discount: number,
    skillName: string,
    ciPercent: number,
): SkillResult {
    const sorted = [...rawResults].sort((a, b) => a - b)
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const mid = Math.floor(sorted.length / 2)
    const median =
        sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid]
    const lowerPercentile = (100 - ciPercent) / 2
    const upperPercentile = 100 - lowerPercentile
    const lowerIndex = Math.floor(sorted.length * (lowerPercentile / 100))
    const upperIndex = Math.floor(sorted.length * (upperPercentile / 100))
    const ciLower = sorted[lowerIndex]
    const ciUpper = sorted[upperIndex]
    const meanLengthPerCost = mean / cost

    return {
        skill: skillName,
        cost,
        discount,
        numSimulations: rawResults.length,
        meanLength: mean,
        medianLength: median,
        meanLengthPerCost,
        minLength: min,
        maxLength: max,
        ciLower,
        ciUpper,
    }
}

export function calculateSkillCost(
    skillId: string,
    skillMeta: Record<
        string,
        { baseCost: number; groupId?: number; order?: number }
    >,
    skillConfig: { discount?: number | null },
    baseUmaSkillIds?: string[],
    skillNames?: Record<string, string[]>,
    allConfigSkills?: Record<string, { discount?: number | null }>,
    skillIdToName?: Record<string, string>,
    skillNameToConfigKey?: Record<string, string>,
): number {
    const currentSkill = skillMeta[skillId]
    const baseCost = currentSkill?.baseCost ?? 200
    const discount = skillConfig.discount ?? 0
    let totalCost = Math.ceil(baseCost * (1 - discount / 100))

    const skillsToIgnore = [
        '99 Problems',
        'G1 Averseness',
        'Gatekept',
        'Inner Post Averseness',
        'Outer Post Averseness',
        'Paddock Fright',
        'Wallflower',
        "You're Not the Boss of Me!",
        '♡ 3D Nail Art',
    ]

    if (currentSkill?.groupId && baseUmaSkillIds && skillNames) {
        const currentGroupId = currentSkill.groupId
        const currentOrder = currentSkill.order ?? 0

        for (const [otherSkillId, otherSkillMeta] of Object.entries(
            skillMeta,
        )) {
            if (
                otherSkillMeta.groupId === currentGroupId &&
                (otherSkillMeta.order ?? 0) > currentOrder &&
                !baseUmaSkillIds.includes(otherSkillId)
            ) {
                const otherSkillNames = skillNames[otherSkillId]
                if (otherSkillNames) {
                    const primaryName = otherSkillNames[0]
                    if (
                        primaryName.endsWith(' ×') ||
                        skillsToIgnore.includes(primaryName)
                    ) {
                        continue
                    }
                }

                let otherDiscount = 0
                if (allConfigSkills && skillIdToName && skillNameToConfigKey) {
                    const skillName = skillIdToName[otherSkillId]
                    if (skillName) {
                        const configKey =
                            skillNameToConfigKey[skillName] || skillName
                        otherDiscount =
                            allConfigSkills[configKey]?.discount ?? 0
                    }
                }

                const otherBaseCost = otherSkillMeta.baseCost ?? 200
                totalCost += Math.round(
                    otherBaseCost * (1 - otherDiscount / 100),
                )
            }
        }
    }

    return totalCost
}

export function findMatchingCoursesWithFilters(
    courseData: Record<
        string,
        {
            raceTrackId: number
            surface: number
            distanceType: number
            distance: number
            corners: Array<{ start: number; length: number }>
            laneMax: number
            [key: string]: unknown
        }
    >,
    trackNames: Record<string, string[]>,
    trackName: string | undefined,
    distance: number | string | undefined,
    surface?: string,
): Array<{ courseId: string; course: CourseData }> {
    const matches: Array<{ courseId: string; course: CourseData }> = []
    const surfaceValue = parseSurface(surface)
    const distanceCategory = parseDistanceCategory(distance)
    const exactDistance =
        typeof distance === 'number'
            ? distance
            : parseInt(distance as string, 10)
    const randomLocation = isRandomLocation(trackName)
    const normalizedTrackName = trackName?.toLowerCase().trim()

    for (const [courseId, rawCourse] of Object.entries(courseData)) {
        const courseTrackName =
            trackNames[rawCourse.raceTrackId.toString()]?.[1]
        if (!courseTrackName) {
            continue
        }

        if (surfaceValue !== null && rawCourse.surface !== surfaceValue) {
            continue
        }

        if (!randomLocation && normalizedTrackName) {
            if (courseTrackName.toLowerCase() !== normalizedTrackName) {
                continue
            }
        }

        if (distanceCategory !== null) {
            if (rawCourse.distanceType !== distanceCategory) {
                continue
            }
        } else if (!Number.isNaN(exactDistance)) {
            if (rawCourse.distance !== exactDistance) {
                continue
            }
        }

        const processedCourse = processCourseData(
            rawCourse as {
                raceTrackId: number
                distance: number
                distanceType: DistanceType
                surface: Surface
                turn: Orientation
                courseSetStatus: readonly ThresholdStat[]
                corners: Array<{ start: number; length: number }>
                straights: readonly {
                    start: number
                    end: number
                    frontType: number
                }[]
                slopes: readonly {
                    start: number
                    length: number
                    slope: number
                }[]
                laneMax: number
                [key: string]: unknown
            },
        )
        matches.push({ courseId, course: processedCourse })
    }

    return matches
}

export function formatTrackDetails(
    course: CourseData,
    trackNames: Record<string, string[]>,
    groundCondition: string,
    weather: string,
    season: string,
    courseId?: string,
    numUmas?: number,
): string {
    const trackName = trackNames[course.raceTrackId.toString()][1]
    const distanceType = formatDistanceType(course.distanceType)
    const surface = formatSurface(course.surface)
    const turn = formatTurn(course.turn)
    const ground =
        groundCondition.charAt(0).toUpperCase() +
        groundCondition.slice(1).toLowerCase()
    const weatherFormatted =
        weather.charAt(0).toUpperCase() + weather.slice(1).toLowerCase()
    const seasonFormatted =
        season.charAt(0).toUpperCase() + season.slice(1).toLowerCase()
    const numUmasPart = numUmas ? `, ${numUmas} Umas` : ''
    const courseIdPart = courseId ? `, ID: ${courseId}` : ''
    return `${trackName}, ${course.distance}m (${distanceType}), ${surface}, ${turn}, ${seasonFormatted}, ${ground}, ${weatherFormatted}${numUmasPart}${courseIdPart}`
}

export function buildSkillNameLookup(
    skillNames: Record<string, string[]>,
): Map<string, string> {
    const lookup = new Map<string, string>()
    for (const [, names] of Object.entries(skillNames)) {
        if (Array.isArray(names) && names[0]) {
            const canonicalName = names[0]
            lookup.set(canonicalName.toLowerCase(), canonicalName)
        }
    }
    return lookup
}

export function getCanonicalSkillName(
    inputName: string,
    skillNameLookup: Map<string, string>,
): string {
    const canonical = skillNameLookup.get(inputName.toLowerCase())
    return canonical || inputName
}

interface ConfigSkill {
    discount?: number | null
    default?: number | null
}

interface ConfigBody {
    skills?: Record<string, ConfigSkill>
    uma?: {
        skills?: string[]
        unique?: string
        [key: string]: unknown
    }
    [key: string]: unknown
}

export function normalizeConfigSkillNames(
    config: ConfigBody,
    skillNameLookup: Map<string, string>,
): ConfigBody {
    if (skillNameLookup.size === 0) return config

    if (config.skills && typeof config.skills === 'object') {
        const normalizedSkills: Record<string, ConfigSkill> = {}
        for (const [skillName, skillData] of Object.entries(config.skills)) {
            const canonicalName = getCanonicalSkillName(skillName, skillNameLookup)
            normalizedSkills[canonicalName] = skillData
        }
        config.skills = normalizedSkills
    }

    if (config.uma?.skills && Array.isArray(config.uma.skills)) {
        config.uma.skills = config.uma.skills.map((skillName) =>
            getCanonicalSkillName(skillName, skillNameLookup),
        )
    }

    if (config.uma?.unique && typeof config.uma.unique === 'string') {
        config.uma.unique = getCanonicalSkillName(config.uma.unique, skillNameLookup)
    }

    return config
}

export function formatTable(
    results: SkillResult[],
    confidenceInterval: number,
): string {
    const maxSkillLen = Math.max(
        ...results.map((r) => r.skill.length),
        'Skill'.length,
    )
    const maxCostLen = Math.max(
        ...results.map((r) => r.cost.toString().length),
        'Cost'.length,
    )
    const maxDiscountLen = Math.max(
        ...results.map((r) => (r.discount > 0 ? `${r.discount}%` : '-').length),
        'Discount'.length,
    )
    const maxSimulationsLen = Math.max(
        ...results.map((r) => r.numSimulations.toString().length),
        'Sims'.length,
    )
    const maxMeanLen = Math.max(
        ...results.map((r) => r.meanLength.toFixed(2).length),
        'Mean'.length,
    )
    const maxMedianLen = Math.max(
        ...results.map((r) => r.medianLength.toFixed(2).length),
        'Median'.length,
    )
    const maxRatioLen = Math.max(
        ...results.map((r) => (r.meanLengthPerCost * 1000).toFixed(2).length),
        'Mean/Cost'.length,
    )
    const maxMinMaxLen = Math.max(
        ...results.map(
            (r) => `${r.minLength.toFixed(2)}-${r.maxLength.toFixed(2)}`.length,
        ),
        'Min-Max'.length,
    )
    const ciLabel = `${confidenceInterval}% CI`
    const maxCILen = Math.max(
        ...results.map(
            (r) => `${r.ciLower.toFixed(2)}-${r.ciUpper.toFixed(2)}`.length,
        ),
        ciLabel.length,
    )

    const header = `Skill${' '.repeat(maxSkillLen - 'Skill'.length + 2)}Cost${' '.repeat(
        maxCostLen - 'Cost'.length + 2,
    )}Discount${' '.repeat(maxDiscountLen - 'Discount'.length + 2)}Sims${' '.repeat(
        maxSimulationsLen - 'Sims'.length + 2,
    )}Mean${' '.repeat(maxMeanLen - 'Mean'.length + 2)}Median${' '.repeat(
        maxMedianLen - 'Median'.length + 2,
    )}Mean/Cost${' '.repeat(maxRatioLen - 'Mean/Cost'.length + 2)}Min-Max${' '.repeat(
        maxMinMaxLen - 'Min-Max'.length + 2,
    )}${ciLabel}`
    const separator = '-'.repeat(header.length)

    const rows = results.map((r) => {
        const skillPad = ' '.repeat(maxSkillLen - r.skill.length + 2)
        const costPad = ' '.repeat(maxCostLen - r.cost.toString().length + 2)
        const discountStr = r.discount > 0 ? `${r.discount}%` : '-'
        const discountPad = ' '.repeat(maxDiscountLen - discountStr.length + 2)
        const simulationsPad = ' '.repeat(
            maxSimulationsLen - r.numSimulations.toString().length + 2,
        )
        const meanPad = ' '.repeat(
            maxMeanLen - r.meanLength.toFixed(2).length + 2,
        )
        const medianPad = ' '.repeat(
            maxMedianLen - r.medianLength.toFixed(2).length + 2,
        )
        const ratioPad = ' '.repeat(
            maxRatioLen - (r.meanLengthPerCost * 1000).toFixed(2).length + 2,
        )
        const minMaxStr = `${r.minLength.toFixed(2)}-${r.maxLength.toFixed(2)}`
        const minMaxPad = ' '.repeat(maxMinMaxLen - minMaxStr.length + 2)
        const ciStr = `${r.ciLower.toFixed(2)}-${r.ciUpper.toFixed(2)}`
        const ciPad = ' '.repeat(maxCILen - ciStr.length)
        return `${r.skill}${skillPad}${r.cost}${costPad}${discountStr}${discountPad}${
            r.numSimulations
        }${simulationsPad}${r.meanLength.toFixed(2)}${meanPad}${r.medianLength.toFixed(2)}${medianPad}${(
            r.meanLengthPerCost * 1000
        ).toFixed(2)}${ratioPad}${minMaxStr}${minMaxPad}${ciStr}${ciPad}`
    })

    return [header, separator, ...rows].join('\n')
}
