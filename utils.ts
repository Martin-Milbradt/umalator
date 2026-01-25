// Local constants mirroring const enum values (const enums aren't exported at runtime)
// Values must match ../uma-tools/uma-skill-tools/RaceParameters.ts
export const Grade = {
    Daily: 999,
    Debut: 900,
    G1: 100,
    G2: 200,
    G3: 300,
    Maiden: 800,
    OP: 400,
    PreOP: 700,
} as const
export type Grade = (typeof Grade)[keyof typeof Grade]
export const GroundCondition = {
    Good: 1,
    Heavy: 4,
    Soft: 3,
    Yielding: 2,
} as const
export type GroundCondition =
    (typeof GroundCondition)[keyof typeof GroundCondition]
export const Season = {
    Autumn: 3,
    Sakura: 5,
    Spring: 1,
    Summer: 2,
    Winter: 4,
} as const
export type Season = (typeof Season)[keyof typeof Season]
export const Time = {
    Evening: 3,
    Midday: 2,
    Morning: 1,
    Night: 4,
    NoTime: 0,
} as const
export type Time = (typeof Time)[keyof typeof Time]
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

export interface SkillCostContext {
    skillMeta: Record<
        string,
        { baseCost: number; groupId?: string; order?: number }
    >
    baseUmaSkillIds?: string[]
    skillNames?: Record<string, string[]>
    configSkills?: Record<string, { discount?: number | null }>
    skillIdToName?: Record<string, string>
    skillNameToConfigKey?: Record<string, string>
}

export function calculateSkillCost(
    skillId: string,
    skillConfig: { discount?: number | null },
    context: SkillCostContext,
): number {
    const {
        skillMeta,
        baseUmaSkillIds,
        skillNames,
        configSkills,
        skillIdToName,
        skillNameToConfigKey,
    } = context
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
                if (configSkills && skillIdToName && skillNameToConfigKey) {
                    const skillName = skillIdToName[otherSkillId]
                    if (skillName) {
                        const configKey =
                            skillNameToConfigKey[skillName] || skillName
                        otherDiscount = configSkills[configKey]?.discount ?? 0
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
            const canonicalName = getCanonicalSkillName(
                skillName,
                skillNameLookup,
            )
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
        config.uma.unique = getCanonicalSkillName(
            config.uma.unique,
            skillNameLookup,
        )
    }

    return config
}

// Mapping constants for skill trigger checking
// Running style values verified from skill_data.json:
// 1=Front Runner (Nige), 2=Pace Chaser (Senkou), 3=Late Surger (Sasi), 4=End Closer (Oikomi), 5=Runaway (Oonige)
export const STRATEGY_TO_RUNNING_STYLE: Record<string, number> = {
    'End Closer': 4,
    'Front Runner': 1,
    'Late Surger': 3,
    Nige: 1,
    Oikomi: 4,
    Oonige: 5,
    'Pace Chaser': 2,
    Runaway: 5,
    Sasi: 3,
    Senkou: 2,
}

export const TRACK_NAME_TO_ID: Record<string, number> = {
    Chukyo: 10007,
    Fukushima: 10004,
    Hakodate: 10002,
    Hanshin: 10009,
    Kokura: 10010,
    Kyoto: 10008,
    Nakayama: 10005,
    Niigata: 10003,
    Ooi: 10101,
    Sapporo: 10001,
    Tokyo: 10006,
}

/**
 * Gets distance type from distance in meters.
 * Distance types: 1=Sprint (<=1400m), 2=Mile (<=1800m), 3=Medium (<=2400m), 4=Long (>2400m)
 */
export function getDistanceType(distanceMeters: number): number {
    if (distanceMeters <= 1400) return 1 // Sprint
    if (distanceMeters <= 1800) return 2 // Mile
    if (distanceMeters <= 2400) return 3 // Medium
    return 4 // Long
}

/**
 * Checks if a skill name is compatible with the track orientation (handedness).
 * @param skillName - The name of the skill to check
 * @param orientation - Track orientation: 1=Right, 2=Left, 4=Straight, null=Random
 * @returns true if the skill is compatible with the track orientation
 */
export function isSkillCompatibleWithOrientation(
    skillName: string,
    orientation: number | null,
): boolean {
    // If orientation is null (random), allow all skills
    if (orientation === null) {
        return true
    }

    // Straight tracks (orientation === 4) have no handedness restriction
    if (orientation === 4) {
        return true
    }

    const isLeftHandedSkill = skillName.includes('Left-Handed')
    const isRightHandedSkill = skillName.includes('Right-Handed')

    // Right-handed track (orientation === 1): filter out Left-Handed skills
    if (orientation === 1 && isLeftHandedSkill) {
        return false
    }

    // Left-handed track (orientation === 2): filter out Right-Handed skills
    if (orientation === 2 && isRightHandedSkill) {
        return false
    }

    return true
}

/**
 * Represents static restrictions extracted from a skill's condition/precondition.
 * All fields are optional - undefined means no restriction on that field.
 */
export interface SkillRestrictions {
    distanceTypes?: number[] // e.g., [4] for Long-only
    groundConditions?: number[] // e.g., [3,4] for Soft or Heavy
    groundTypes?: number[] // e.g., [2] for Dirt only
    isBasisDistance?: number[] // [1] for standard (divisible by 400), [0] for non-standard
    runningStyles?: number[] // e.g., [3] for Pace Chaser only
    seasons?: number[] // e.g., [1] for Spring only
    trackIds?: number[] // e.g., [10001, 10005] for specific tracks
    weathers?: number[] // e.g., [3,4] for Rainy or Snowy
}

/**
 * Current settings for checking if a skill can trigger.
 * null values indicate random/unspecified settings where any value is acceptable.
 */
export interface CurrentSettings {
    distanceType: number | null // null if <Random> or distance category
    groundCondition: number | null // null if <Random>
    groundType: number | null // 1=Turf, 2=Dirt, null if random
    isBasisDistance: boolean | null // true if distance % 400 == 0, null if random/category
    orientation: number | null // 1=Right, 2=Left, 4=Straight, null if <Random>
    runningStyle: number // from uma.strategy (always known)
    season: number | null // null if <Random>
    trackId: number | null // null if <Random> location
    weather: number | null // null if <Random>
}

// Static field names we care about for filtering
const STATIC_FIELDS = [
    'distance_type',
    'ground_condition',
    'ground_type',
    'is_basis_distance',
    'running_style',
    'season',
    'track_id',
    'weather',
] as const

type StaticField = (typeof STATIC_FIELDS)[number]

// Max values for fields that support inequality expansion
const FIELD_MAX_VALUES: Partial<Record<StaticField, number>> = {
    distance_type: 4, // Sprint=1, Mile=2, Medium=3, Long=4
    ground_condition: 4, // Good=1, Yielding=2, Soft=3, Heavy=4
    ground_type: 2, // Turf=1, Dirt=2
    is_basis_distance: 1, // 0=non-standard, 1=standard (divisible by 400)
    running_style: 5, // Runaway=1, Front Runner=2, Pace Chaser=3, Late Surger=4, End Closer=5
    season: 5, // Spring=1, Summer=2, Autumn=3, Winter=4, Sakura=5
    weather: 4, // Sunny=1, Cloudy=2, Rainy=3, Snowy=4
}

/**
 * Expand a comparison to an array of values based on operator.
 * For track_id, returns single value array since expansion is not meaningful.
 */
function expandComparisonToValues(
    field: StaticField,
    operator: string,
    value: number,
): number[] {
    const maxValue = FIELD_MAX_VALUES[field]

    // For track_id or unknown fields, don't expand - return single value
    if (maxValue === undefined) {
        return [value]
    }

    switch (operator) {
        case '==':
            return [value]
        case '>=': {
            const values: number[] = []
            for (let i = value; i <= maxValue; i++) {
                values.push(i)
            }
            return values
        }
        case '<=': {
            const values: number[] = []
            for (let i = 1; i <= value; i++) {
                values.push(i)
            }
            return values
        }
        case '>': {
            const values: number[] = []
            for (let i = value + 1; i <= maxValue; i++) {
                values.push(i)
            }
            return values
        }
        case '<': {
            const values: number[] = []
            for (let i = 1; i < value; i++) {
                values.push(i)
            }
            return values
        }
        default:
            return [value]
    }
}

/**
 * Parse a single condition term like "distance_type==4" or "distance_type>=3"
 * and extract values if it's a static field.
 * Supports ==, >=, <=, >, < operators.
 * Returns null if not a static field or not a supported comparison.
 */
function parseConditionTerm(
    term: string,
): { field: StaticField; values: number[] } | null {
    // Match field, operator, and value
    const match = term.match(/^([a-z_]+)(==|>=|<=|>|<)(\d+)$/)
    if (!match) return null

    const field = match[1] as StaticField
    if (!STATIC_FIELDS.includes(field)) return null

    const operator = match[2]
    const value = parseInt(match[3], 10)
    const values = expandComparisonToValues(field, operator, value)

    return { field, values }
}

/**
 * Parse a single AND-branch (conditions separated by &) and extract static restrictions.
 * Returns restrictions that must ALL be satisfied for this branch.
 */
function parseAndBranch(branch: string): SkillRestrictions {
    const restrictions: SkillRestrictions = {}
    const terms = branch.split('&')

    for (const term of terms) {
        const parsed = parseConditionTerm(term.trim())
        if (!parsed) continue

        switch (parsed.field) {
            case 'distance_type':
                restrictions.distanceTypes = parsed.values
                break
            case 'ground_condition':
                restrictions.groundConditions = parsed.values
                break
            case 'ground_type':
                restrictions.groundTypes = parsed.values
                break
            case 'is_basis_distance':
                restrictions.isBasisDistance = parsed.values
                break
            case 'running_style':
                restrictions.runningStyles = parsed.values
                break
            case 'season':
                restrictions.seasons = parsed.values
                break
            case 'track_id':
                restrictions.trackIds = parsed.values
                break
            case 'weather':
                restrictions.weathers = parsed.values
                break
        }
    }

    return restrictions
}

/**
 * Merge two restriction sets (union for OR alternatives).
 * If any branch allows a value, the merged result allows it.
 */
function mergeRestrictions(
    a: SkillRestrictions,
    b: SkillRestrictions,
): SkillRestrictions {
    const merged: SkillRestrictions = {}

    // For each field, if both have restrictions, union them
    // If only one has restrictions, keep those (the other branch has no restriction = allows all)
    // If neither has restrictions, the merged result has no restriction

    const fields: (keyof SkillRestrictions)[] = [
        'distanceTypes',
        'groundConditions',
        'groundTypes',
        'isBasisDistance',
        'runningStyles',
        'seasons',
        'trackIds',
        'weathers',
    ]

    for (const field of fields) {
        const aVals = a[field]
        const bVals = b[field]

        if (aVals && bVals) {
            // Both branches have restrictions - union them
            merged[field] = [...new Set([...aVals, ...bVals])]
        }
        // If only one has restrictions, the other branch allows all values,
        // so the merged result has no restriction (undefined)
    }

    return merged
}

/**
 * Intersect two restriction sets (for combining condition and precondition).
 * Both must be satisfiable for the skill to trigger.
 */
function intersectRestrictions(
    a: SkillRestrictions,
    b: SkillRestrictions,
): SkillRestrictions {
    const result: SkillRestrictions = { ...a }

    const fields: (keyof SkillRestrictions)[] = [
        'distanceTypes',
        'groundConditions',
        'groundTypes',
        'isBasisDistance',
        'runningStyles',
        'seasons',
        'trackIds',
        'weathers',
    ]

    for (const field of fields) {
        const aVals = a[field]
        const bVals = b[field]

        if (aVals && bVals) {
            // Both have restrictions - intersect (values that satisfy both)
            const intersection = aVals.filter((v) => bVals.includes(v))
            if (intersection.length > 0) {
                result[field] = intersection
            } else {
                // No overlap - this combination can never trigger
                result[field] = []
            }
        } else if (bVals) {
            // Only b has restrictions
            result[field] = bVals
        }
        // If only a has restrictions, already in result from spread
    }

    return result
}

/**
 * Extract static restrictions from a condition string.
 * Handles OR-separated alternatives (split on @) and AND-separated conditions (split on &).
 */
export function extractStaticRestrictions(
    condition: string,
    precondition?: string,
): SkillRestrictions {
    if (!condition) return {}

    // Split by @ for OR alternatives
    const orBranches = condition.split('@')

    // Parse each OR branch and merge results
    let conditionRestrictions: SkillRestrictions | null = null

    for (const branch of orBranches) {
        const branchRestrictions = parseAndBranch(branch)

        if (conditionRestrictions === null) {
            conditionRestrictions = branchRestrictions
        } else {
            conditionRestrictions = mergeRestrictions(
                conditionRestrictions,
                branchRestrictions,
            )
        }
    }

    if (!conditionRestrictions) {
        conditionRestrictions = {}
    }

    // If there's a precondition, parse it and intersect with condition restrictions
    if (precondition) {
        const preOrBranches = precondition.split('@')
        let preconditionRestrictions: SkillRestrictions | null = null

        for (const branch of preOrBranches) {
            const branchRestrictions = parseAndBranch(branch)

            if (preconditionRestrictions === null) {
                preconditionRestrictions = branchRestrictions
            } else {
                preconditionRestrictions = mergeRestrictions(
                    preconditionRestrictions,
                    branchRestrictions,
                )
            }
        }

        if (preconditionRestrictions) {
            conditionRestrictions = intersectRestrictions(
                conditionRestrictions,
                preconditionRestrictions,
            )
        }
    }

    return conditionRestrictions
}

/**
 * Check if a skill can trigger under the current settings.
 * Returns true if the skill's restrictions are compatible with current settings.
 * Returns false if any restriction array exists but is empty (impossible condition).
 */
export function canSkillTrigger(
    restrictions: SkillRestrictions,
    settings: CurrentSettings,
): boolean {
    // Check each restriction field
    // If restriction array exists but is empty, condition is impossible - return false
    // If setting is null (random), that restriction passes (unless empty)
    // If restriction field is undefined, that field always passes
    // Otherwise, check if current value is in allowed values array

    // Distance type
    if (restrictions.distanceTypes) {
        if (restrictions.distanceTypes.length === 0) {
            return false // Impossible condition from intersection
        }
        if (settings.distanceType !== null) {
            if (!restrictions.distanceTypes.includes(settings.distanceType)) {
                return false
            }
        }
    }

    // Running style
    // Special case: Runaway (5) can use Front Runner (1) skills because there are no Runaway-specific skills
    if (restrictions.runningStyles) {
        if (restrictions.runningStyles.length === 0) {
            return false // Impossible condition from intersection
        }
        const effectiveRunningStyle = settings.runningStyle
        let matches = restrictions.runningStyles.includes(effectiveRunningStyle)
        // Runaway (5) can trigger Front Runner (1) skills
        if (
            !matches &&
            effectiveRunningStyle === 5 &&
            restrictions.runningStyles.includes(1)
        ) {
            matches = true
        }
        if (!matches) {
            return false
        }
    }

    // Ground type (surface)
    if (restrictions.groundTypes) {
        if (restrictions.groundTypes.length === 0) {
            return false // Impossible condition from intersection
        }
        if (settings.groundType !== null) {
            if (!restrictions.groundTypes.includes(settings.groundType)) {
                return false
            }
        }
    }

    // Basis distance (standard vs non-standard)
    if (restrictions.isBasisDistance) {
        if (restrictions.isBasisDistance.length === 0) {
            return false // Impossible condition from intersection
        }
        if (settings.isBasisDistance !== null) {
            const basisValue = settings.isBasisDistance ? 1 : 0
            if (!restrictions.isBasisDistance.includes(basisValue)) {
                return false
            }
        }
    }

    // Ground condition
    if (restrictions.groundConditions) {
        if (restrictions.groundConditions.length === 0) {
            return false // Impossible condition from intersection
        }
        if (settings.groundCondition !== null) {
            if (
                !restrictions.groundConditions.includes(
                    settings.groundCondition,
                )
            ) {
                return false
            }
        }
    }

    // Weather
    if (restrictions.weathers) {
        if (restrictions.weathers.length === 0) {
            return false // Impossible condition from intersection
        }
        if (settings.weather !== null) {
            if (!restrictions.weathers.includes(settings.weather)) {
                return false
            }
        }
    }

    // Season
    if (restrictions.seasons) {
        if (restrictions.seasons.length === 0) {
            return false // Impossible condition from intersection
        }
        if (settings.season !== null) {
            if (!restrictions.seasons.includes(settings.season)) {
                return false
            }
        }
    }

    // Track ID
    if (restrictions.trackIds) {
        if (restrictions.trackIds.length === 0) {
            return false // Impossible condition from intersection
        }
        if (settings.trackId !== null) {
            if (!restrictions.trackIds.includes(settings.trackId)) {
                return false
            }
        }
    }

    return true
}

/**
 * Skill data entry from skill_data.json.
 */
export interface SkillDataEntry {
    alternatives: Array<{
        baseDuration: number
        condition: string
        effects: Array<{ modifier: number; target: number; type: number }>
        precondition: string
    }>
    rarity: number
    wisdomCheck: number
}

/**
 * Extract restrictions from a skill data entry by merging restrictions from all alternatives.
 * A skill can trigger if ANY of its alternatives can trigger.
 */
export function extractSkillRestrictions(
    skillData: SkillDataEntry,
): SkillRestrictions {
    if (!skillData.alternatives || skillData.alternatives.length === 0) {
        return {}
    }

    let mergedRestrictions: SkillRestrictions | null = null

    for (const alt of skillData.alternatives) {
        const altRestrictions = extractStaticRestrictions(
            alt.condition,
            alt.precondition || undefined,
        )

        if (mergedRestrictions === null) {
            mergedRestrictions = altRestrictions
        } else {
            mergedRestrictions = mergeRestrictions(
                mergedRestrictions,
                altRestrictions,
            )
        }
    }

    return mergedRestrictions || {}
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
