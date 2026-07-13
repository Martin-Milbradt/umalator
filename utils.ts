// Local constants mirroring const enum values (const enums aren't exported at runtime)
// Values must match ./uma-tools/uma-skill-tools/RaceParameters.ts
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
    Orientation,
    Surface,
    ThresholdStat,
} from './uma-tools/uma-skill-tools/CourseData'

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
    meanLength: number
    medianLength: number
    meanLengthPerCost: number
    minLength: number
    maxLength: number
    // Outcome spread: the central percentile band of individual per-race
    // results (e.g. 2.5th–97.5th for 95%). NOT a confidence interval of the
    // mean.
    rangeLower: number
    rangeUpper: number
    // Confidence interval of the MEAN gain (mean ± t·SE): how precisely the
    // average is estimated.
    ciMeanLower: number
    ciMeanUpper: number
    // Rows for skills the uma already has (or its disabled unique). Their
    // stats are negated (mean = what removing loses, cost = refunded SP);
    // ownedAction drives the row's button and hasCost=false blanks the cost
    // and mean/cost columns (unknown refund or unique).
    owned?: boolean
    ownedAction?: 'remove' | 'downgrade' | 'disable-unique' | 'enable-unique'
    hasCost?: boolean
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

export function deriveSeason(turn: string): Season {
    const month = parseInt(turn.split('_')[0]!, 10)
    if (month >= 3 && month <= 5) return Season.Spring
    if (month >= 6 && month <= 8) return Season.Summer
    if (month >= 9 && month <= 11) return Season.Autumn
    return Season.Winter
}

export function parseLocationToTrackName(location: string): string {
    return location.replace(/^[⇐⇒]\s*/, '').trim()
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
        ;[result[i], result[j]] = [result[j]!, result[i]!]
    }
    return result
}

// The weighted pools are returned in a fixed order, not shuffled. The worker
// (simulation.worker.ts) draws representative values from them by count and
// then shuffles the per-combination assignment with a seeded RNG, so the input
// order is irrelevant to the result and a fixed order keeps seeded runs
// reproducible. Weights are approximate in-game frequencies (exact provenance
// unverified; see the open tracking issue).
export function createWeightedSeasonArray(): Season[] {
    const result: Season[] = []
    for (let i = 0; i < 40; i++) result.push(Season.Spring)
    for (let i = 0; i < 22; i++) result.push(Season.Summer)
    for (let i = 0; i < 12; i++) result.push(Season.Autumn)
    for (let i = 0; i < 26; i++) result.push(Season.Winter)
    return result
}

export function createWeightedWeatherArray(): number[] {
    const result: number[] = []
    for (let i = 0; i < 58; i++) result.push(1)
    for (let i = 0; i < 30; i++) result.push(2)
    for (let i = 0; i < 11; i++) result.push(3)
    for (let i = 0; i < 1; i++) result.push(4)
    return result
}

export function createWeightedConditionArray(): GroundCondition[] {
    const result: GroundCondition[] = []
    for (let i = 0; i < 77; i++) result.push(GroundCondition.Good)
    for (let i = 0; i < 11; i++) result.push(GroundCondition.Yielding)
    for (let i = 0; i < 7; i++) result.push(GroundCondition.Soft)
    for (let i = 0; i < 5; i++) result.push(GroundCondition.Heavy)
    return result
}

export function findAllSkillIdsByName(
    skillName: string,
    skillNames: Record<string, string[]>,
): string[] {
    const matches: string[] = []
    const normalizedInput = skillName.toLowerCase()
    for (const [id, names] of Object.entries(skillNames)) {
        if (names[0]!.toLowerCase() === normalizedInput) {
            matches.push(id)
        }
    }
    return matches
}

export function findSkillIdByNameWithPreference(
    skillName: string,
    skillNames: Record<string, string[]>,
    skillMeta: Record<string, { baseCost?: number }>,
    preferCostGreaterThanZero: boolean,
): string | null {
    const matches = findAllSkillIdsByName(skillName, skillNames)
    if (matches.length === 0) {
        return null
    }
    if (matches.length === 1) {
        return matches[0]!
    }

    // Ids that only exist in skillnames (e.g. evolved skills in newer game
    // data) have no meta entry and cannot be simulated; when a name maps to
    // several ids, only consider the ones with real metadata.
    const withMeta = matches.filter((id) => skillMeta[id] != null)
    const candidates = withMeta.length > 0 ? withMeta : matches

    const preferred = candidates.filter((id) => {
        const baseCost = skillMeta[id]?.baseCost ?? 200
        return preferCostGreaterThanZero ? baseCost > 0 : baseCost === 0
    })

    if (preferred.length > 0) {
        return preferred[0]!
    }

    return candidates[0]!
}

/**
 * Builds the display-name -> skill id map used for name resolution. Newer
 * game data can list several ids for one name (e.g. an evolved skill
 * alongside the regular one, where only the regular one has meta/data);
 * prefer ids that can be simulated (present in skillData), then ids with
 * metadata (cost/icon), then the first one seen.
 */
export function buildSkillNameToIdMap(
    skillNames: Record<string, string[]>,
    skillMeta?: Record<string, unknown> | null,
    skillData?: Record<string, unknown> | null,
): Record<string, string> {
    const rank = (id: string): number =>
        (skillData && id in skillData ? 2 : 0) +
        (skillMeta && id in skillMeta ? 1 : 0)
    const map: Record<string, string> = {}
    for (const [id, names] of Object.entries(skillNames)) {
        const name = names[0]
        if (!name) continue
        const current = map[name]
        if (current === undefined || rank(id) > rank(current)) {
            map[name] = id
        }
    }
    return map
}

export function findSkillVariantsByName(
    baseSkillName: string,
    skillNames: Record<string, string[]>,
    skillMeta: Record<string, { baseCost?: number }>,
): Array<{ skillId: string; skillName: string }> {
    const variants: Array<{ skillId: string; skillName: string }> = []
    const trimmedBaseName = baseSkillName.trim()

    // If the caller passed a ○/◎ variant directly, strip the suffix and fall
    // through to the group search below so both siblings come back together.
    // Without this, a config key like "Right-Handed ◎" would only yield that
    // one variant — the ○ sibling would never be simulated.
    const variantSuffixMatch = /^(.+?) ([○◎])$/.exec(trimmedBaseName)
    const searchBaseName = variantSuffixMatch
        ? variantSuffixMatch[1]!
        : trimmedBaseName
    const normalizedBaseName = searchBaseName.toLowerCase()

    if (!variantSuffixMatch) {
        const exactMatchId = findSkillIdByNameWithPreference(
            trimmedBaseName,
            skillNames,
            skillMeta,
            true,
        )
        if (exactMatchId) {
            const baseCost = skillMeta[exactMatchId]?.baseCost ?? 200
            if (baseCost > 0) {
                const canonicalName = skillNames[exactMatchId]![0]!
                variants.push({
                    skillId: exactMatchId,
                    skillName: canonicalName,
                })
                return variants
            }
        }
    }

    for (const [id, names] of Object.entries(skillNames)) {
        const name = names[0]!
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

    const moveLanePoint = corners[0]!.start

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

/**
 * Standard normal quantile (inverse CDF) via Acklam's rational approximation,
 * accurate to ~1e-9 over (0,1). Used to turn a confidence level into a z-score.
 */
export function standardNormalQuantile(p: number): number {
    if (p <= 0 || p >= 1) {
        throw new Error(`standardNormalQuantile expects p in (0,1), got ${p}`)
    }
    const a0 = -3.969683028665376e1
    const a1 = 2.209460984245205e2
    const a2 = -2.759285104469687e2
    const a3 = 1.38357751867269e2
    const a4 = -3.066479806614716e1
    const a5 = 2.506628277459239
    const b0 = -5.447609879822406e1
    const b1 = 1.615858368580409e2
    const b2 = -1.556989798598866e2
    const b3 = 6.680131188771972e1
    const b4 = -1.328068155288572e1
    const c0 = -7.784894002430293e-3
    const c1 = -3.223964580411365e-1
    const c2 = -2.400758277161838
    const c3 = -2.549732539343734
    const c4 = 4.374664141464968
    const c5 = 2.938163982698783
    const d0 = 7.784695709041462e-3
    const d1 = 3.224671290700398e-1
    const d2 = 2.445134137142996
    const d3 = 3.754408661907416
    const pLow = 0.02425
    const pHigh = 1 - pLow

    if (p < pLow) {
        const q = Math.sqrt(-2 * Math.log(p))
        return (
            (((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5) /
            ((((d0 * q + d1) * q + d2) * q + d3) * q + 1)
        )
    }
    if (p <= pHigh) {
        const q = p - 0.5
        const r = q * q
        return (
            ((((((a0 * r + a1) * r + a2) * r + a3) * r + a4) * r + a5) * q) /
            (((((b0 * r + b1) * r + b2) * r + b3) * r + b4) * r + 1)
        )
    }
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return (
        -(((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5) /
        ((((d0 * q + d1) * q + d2) * q + d3) * q + 1)
    )
}

/** Two-sided z-score for a confidence level given as a percentage (e.g. 95). */
export function zForConfidenceLevel(ciPercent: number): number {
    return standardNormalQuantile((1 + ciPercent / 100) / 2)
}

/** Natural log of the gamma function (Lanczos approximation, g=7). */
function logGamma(x: number): number {
    const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ]
    if (x < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
    }
    const y = x - 1
    let a = c[0]!
    const t = y + 7.5
    for (let i = 1; i < 9; i++) a += c[i]! / (y + i)
    return (
        0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a)
    )
}

/** Lentz continued fraction for the incomplete beta (Numerical Recipes). */
function betaContinuedFraction(x: number, a: number, b: number): number {
    const MAX_ITER = 1000
    const EPS = 1e-15
    const TINY = 1e-300
    const qab = a + b
    const qap = a + 1
    const qam = a - 1
    let c = 1
    let d = 1 - (qab * x) / qap
    if (Math.abs(d) < TINY) d = TINY
    d = 1 / d
    let h = d
    for (let m = 1; m <= MAX_ITER; m++) {
        const m2 = 2 * m
        let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
        d = 1 + aa * d
        if (Math.abs(d) < TINY) d = TINY
        c = 1 + aa / c
        if (Math.abs(c) < TINY) c = TINY
        d = 1 / d
        h *= d * c
        aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
        d = 1 + aa * d
        if (Math.abs(d) < TINY) d = TINY
        c = 1 + aa / c
        if (Math.abs(c) < TINY) c = TINY
        d = 1 / d
        const del = d * c
        h *= del
        if (Math.abs(del - 1) < EPS) break
    }
    return h
}

/** Regularized lower incomplete beta I_x(a, b). */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
    if (x <= 0) return 0
    if (x >= 1) return 1
    const front = Math.exp(
        logGamma(a + b) -
            logGamma(a) -
            logGamma(b) +
            a * Math.log(x) +
            b * Math.log(1 - x),
    )
    if (x < (a + 1) / (a + b + 2)) {
        return (front * betaContinuedFraction(x, a, b)) / a
    }
    return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b
}

/** Inverse of the regularized incomplete beta via bisection. */
function inverseRegularizedIncompleteBeta(
    p: number,
    a: number,
    b: number,
): number {
    if (p <= 0) return 0
    if (p >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2
        if (regularizedIncompleteBeta(mid, a, b) < p) {
            lo = mid
        } else {
            hi = mid
        }
    }
    return (lo + hi) / 2
}

/**
 * Cornish-Fisher expansion of the t quantile from the normal quantile. Exact to
 * the eye for large df; used for df >= 50 where the beta continued fraction
 * converges slowly as x -> 1.
 */
function cornishFisherT(p: number, df: number): number {
    const z = standardNormalQuantile(p)
    const z3 = z ** 3
    const z5 = z ** 5
    const z7 = z ** 7
    const z9 = z ** 9
    const g1 = (z3 + z) / 4
    const g2 = (5 * z5 + 16 * z3 + 3 * z) / 96
    const g3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / 384
    const g4 = (79 * z9 + 776 * z7 + 1482 * z5 - 1920 * z3 - 945 * z) / 92160
    return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4
}

/**
 * Student's t quantile (inverse CDF) with `df` degrees of freedom. Small df use
 * the exact t-beta identity df/(df+T^2) ~ Beta(df/2, 1/2); large df use the
 * Cornish-Fisher expansion. Converges to the normal quantile as df grows.
 */
export function studentTQuantile(p: number, df: number): number {
    if (p <= 0 || p >= 1) {
        throw new Error(`studentTQuantile expects p in (0,1), got ${p}`)
    }
    if (df <= 0) {
        throw new Error(`studentTQuantile expects df > 0, got ${df}`)
    }
    if (p === 0.5) return 0
    if (df >= 50) return cornishFisherT(p, df)
    const upper = p > 0.5
    const tail = upper ? 1 - p : p
    const x = inverseRegularizedIncompleteBeta(2 * tail, df / 2, 0.5)
    const t = Math.sqrt((df * (1 - x)) / x)
    return upper ? t : -t
}

/** Two-sided t-score for a confidence level (percentage) at `df` degrees of freedom. */
export function tForConfidenceLevel(ciPercent: number, df: number): number {
    return studentTQuantile((1 + ciPercent / 100) / 2, df)
}

export function calculateStatsFromRawResults(
    rawResults: number[],
    cost: number,
    discount: number,
    skillName: string,
    ciPercent: number,
): SkillResult {
    if (rawResults.length === 0) {
        throw new Error('calculateStatsFromRawResults requires at least one result')
    }
    const sorted = [...rawResults].sort((a, b) => a - b)
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
    const min = sorted[0]!
    const max = sorted[sorted.length - 1]!
    const mid = Math.floor(sorted.length / 2)
    const median =
        sorted.length % 2 === 0
            ? (sorted[mid - 1]! + sorted[mid]!) / 2
            : sorted[mid]!
    const lowerPercentile = (100 - ciPercent) / 2
    const upperPercentile = 100 - lowerPercentile
    const lowerIndex = Math.floor(sorted.length * (lowerPercentile / 100))
    const upperIndex = Math.min(
        Math.floor(sorted.length * (upperPercentile / 100)),
        sorted.length - 1,
    )
    const rangeLower = sorted[lowerIndex]!
    const rangeUpper = sorted[upperIndex]!
    // cost may be negative (refund for removing an owned skill); the double
    // negation with a negated mean keeps the ratio comparable to buy rows.
    const meanLengthPerCost = cost !== 0 ? mean / cost : 0

    // Confidence interval of the mean: mean ± t_{n-1}·(s/√n), using the sample
    // standard deviation (n-1). Bounded data is never exactly normal, so the t
    // pivot is (like z) only asymptotically exact, but it is marginally more
    // honest at small n and converges to z as n grows. A single sample has
    // SE = 0, so the margin is 0 and the degrees of freedom are never evaluated.
    const variance =
        sorted.length > 1
            ? sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
              (sorted.length - 1)
            : 0
    const standardError = Math.sqrt(variance) / Math.sqrt(sorted.length)
    const margin =
        sorted.length > 1
            ? tForConfidenceLevel(ciPercent, sorted.length - 1) * standardError
            : 0

    return {
        skill: skillName,
        cost,
        discount,
        meanLength: mean,
        medianLength: median,
        meanLengthPerCost,
        minLength: min,
        maxLength: max,
        rangeLower,
        rangeUpper,
        ciMeanLower: mean - margin,
        ciMeanUpper: mean + margin,
    }
}

export interface SkillCostContext {
    skillMeta: Record<
        string,
        {
            baseCost?: number
            groupId?: string
            order?: number
            score?: number
        }
    >
    baseUmaSkillIds?: string[]
    skillNames?: Record<string, string[]>
    configSkills?: Record<string, { discount?: number | null }>
    skillIdToName?: Record<string, string>
    skillNameToConfigKey?: Record<string, string>
}

export { applyDiscount } from './shared/skill-cost'
import {
    applyDiscount as sharedApplyDiscount,
    calculateSkillCost as sharedCalculateSkillCost,
} from './shared/skill-cost'

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
    const discount = skillConfig.discount ?? 0

    // A caller that doesn't hand over Uma state or skill names can't resolve
    // prerequisites; charge only the skill itself. Distinct from passing `[]`,
    // which means "Uma has no group member" and still charges every prereq.
    if (!baseUmaSkillIds || !skillNames) {
        const baseCost = skillMeta[skillId]?.baseCost ?? 200
        return sharedApplyDiscount(baseCost, discount)
    }

    return sharedCalculateSkillCost({
        skillId,
        discount,
        skillMeta,
        skillNames,
        umaSkillIds: baseUmaSkillIds,
        getPrereqDiscount: (prereqId) => {
            if (!configSkills || !skillIdToName || !skillNameToConfigKey) {
                return 0
            }
            const canonicalName = skillIdToName[prereqId]
            if (!canonicalName) return 0
            const configKey =
                skillNameToConfigKey[canonicalName] || canonicalName
            return configSkills[configKey]?.discount ?? 0
        },
    })
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
    const trackName = trackNames[course.raceTrackId.toString()]![1]!
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
 * Represents static restrictions extracted from a skill's condition/precondition.
 * All fields are optional - undefined means no restriction on that field.
 */
export interface SkillRestrictions {
    distanceTypes?: number[] // e.g., [4] for Long-only
    groundConditions?: number[] // e.g., [3,4] for Soft or Heavy
    groundTypes?: number[] // e.g., [2] for Dirt only
    isBasisDistance?: number[] // [1] for standard (divisible by 400), [0] for non-standard
    rotations?: number[] // e.g., [1] for Clockwise, [2] for Counterclockwise
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
    rotation: number | null // 1=Clockwise, 2=Counterclockwise, 3=Unused, 4=NoTurns, null if random
    runningStyle: number // from uma.strategy (always known)
    season: number | null // null if <Random>
    trackId: number | null // null if <Random> location
    weather: number | null // null if <Random>
}

// Static field names we care about for filtering
export const STATIC_FIELDS = [
    'distance_type',
    'ground_condition',
    'ground_type',
    'is_basis_distance',
    'rotation',
    'running_style',
    'season',
    'track_id',
    'weather',
] as const

export type StaticField = (typeof STATIC_FIELDS)[number]

// Max values for fields that support inequality expansion
export const FIELD_MAX_VALUES: Partial<Record<StaticField, number>> = {
    distance_type: 4, // Sprint=1, Mile=2, Medium=3, Long=4
    ground_condition: 4, // Good=1, Yielding=2, Soft=3, Heavy=4
    ground_type: 2, // Turf=1, Dirt=2
    is_basis_distance: 1, // 0=non-standard, 1=standard (divisible by 400)
    rotation: 4, // Clockwise=1, Counterclockwise=2, UnusedOrientation=3, NoTurns=4
    running_style: 5, // Runaway=1, Front Runner=2, Pace Chaser=3, Late Surger=4, End Closer=5
    season: 5, // Spring=1, Summer=2, Autumn=3, Winter=4, Sakura=5
    weather: 4, // Sunny=1, Cloudy=2, Rainy=3, Snowy=4
}

// is_basis_distance is zero-indexed (0=non-basis, 1=basis); everything else
// starts at 1. Without this per-field minimum, `is_basis_distance<1` and
// `is_basis_distance<=0` both expanded to [] and silently dropped the skill
// from the pool.
export const FIELD_MIN_VALUES: Partial<Record<StaticField, number>> = {
    is_basis_distance: 0,
}

/**
 * Expand a comparison to an array of values based on operator.
 * For track_id, returns single value array since expansion is not meaningful.
 */
export function expandComparisonToValues(
    field: StaticField,
    operator: string,
    value: number,
): number[] {
    const maxValue = FIELD_MAX_VALUES[field]

    // For track_id or unknown fields, don't expand - return single value
    if (maxValue === undefined) {
        return [value]
    }

    const minValue = FIELD_MIN_VALUES[field] ?? 1

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
            for (let i = minValue; i <= value; i++) {
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
            for (let i = minValue; i < value; i++) {
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
export function parseConditionTerm(
    term: string,
): { field: StaticField; values: number[] } | null {
    // Match field, operator, and value
    const match = term.match(/^([a-z_]+)(==|>=|<=|>|<)(\d+)$/)
    if (!match) return null

    const field = match[1] as StaticField
    if (!STATIC_FIELDS.includes(field)) return null

    const operator = match[2]!
    const value = parseInt(match[3]!, 10)
    const values = expandComparisonToValues(field, operator, value)

    return { field, values }
}

const STATIC_FIELD_TO_RESTRICTION_KEY: Record<
    StaticField,
    keyof SkillRestrictions
> = {
    distance_type: 'distanceTypes',
    ground_condition: 'groundConditions',
    ground_type: 'groundTypes',
    is_basis_distance: 'isBasisDistance',
    rotation: 'rotations',
    running_style: 'runningStyles',
    season: 'seasons',
    track_id: 'trackIds',
    weather: 'weathers',
}

/**
 * Parse a single AND-branch (conditions separated by &) and extract static restrictions.
 * Returns restrictions that must ALL be satisfied for this branch.
 */
export function parseAndBranch(branch: string): SkillRestrictions {
    const restrictions: SkillRestrictions = {}
    const terms = branch.split('&')

    for (const term of terms) {
        const parsed = parseConditionTerm(term.trim())
        if (!parsed) continue

        // The same field can appear twice in one &-branch (e.g.
        // "distance_type>=2&distance_type<=3"). AND means both must hold, so
        // intersect rather than overwrite; a contradiction yields [] (impossible).
        const key = STATIC_FIELD_TO_RESTRICTION_KEY[parsed.field]
        const existing = restrictions[key]
        restrictions[key] = existing
            ? existing.filter((value) => parsed.values.includes(value))
            : parsed.values
    }

    return restrictions
}

/**
 * Merge two restriction sets (union for OR alternatives).
 * If any branch allows a value, the merged result allows it.
 */
export function mergeRestrictions(
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
        'rotations',
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
export function intersectRestrictions(
    a: SkillRestrictions,
    b: SkillRestrictions,
): SkillRestrictions {
    const result: SkillRestrictions = { ...a }

    const fields: (keyof SkillRestrictions)[] = [
        'distanceTypes',
        'groundConditions',
        'groundTypes',
        'isBasisDistance',
        'rotations',
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

    // Rotation (track orientation)
    if (restrictions.rotations) {
        if (restrictions.rotations.length === 0) {
            return false // Impossible condition from intersection
        }
        if (settings.rotation !== null) {
            if (!restrictions.rotations.includes(settings.rotation)) {
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
export interface SkillDataAlternative {
    baseDuration: number
    condition: string
    effects: Array<{ modifier: number; target: number; type: number }>
    precondition: string
}

export interface SkillDataEntry {
    alternatives: SkillDataAlternative[]
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
