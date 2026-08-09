/**
 * Type definitions for umalator.
 * These types replace `any` usages for better type safety.
 */

import type {
    Mood,
    RaceParameters,
} from './uma-tools/uma-skill-tools/RaceParameters'
import type { CourseData } from './utils'

/**
 * Race parameters as umalator uses them: mood and popularity are per-uma
 * (they ride on HorseStateData), not per-race.
 */
export type RaceDef = Omit<RaceParameters, 'mood' | 'popularity'>

/**
 * Serialized horse state data passed to worker threads.
 * This matches the output of HorseState.toJS() from immutable.js Record.
 */
export interface HorseStateData {
    outfitId?: string
    speed: number
    stamina: number
    power: number
    guts: number
    wisdom: number
    strategy: string
    distanceAptitude: string
    surfaceAptitude: string
    strategyAptitude: string
    starCount?: 1 | 2 | 3 | 4 | 5
    aptitudes?: string[]
    mood?: Mood
    popularity?: number
    /** Skill ID of the unique skill (also present in `skills`); enables level scaling. */
    uniqueSkillId?: string
    /** Unique skill level, 1-10. Defaults to 1. */
    uniqueLv?: number
    /** Skill IDs as either an array or a Record (from immutable Map serialization) */
    skills: Record<string, string> | string[]
}

/**
 * Simulation options for the race comparison engine. Only options the
 * vendored runComparison (shared/compare.ts) actually consumes belong here.
 */
export interface SimulationOptions {
    seed: number | null
    usePosKeep?: boolean
    useIntChecks?: boolean
}

/**
 * Task data passed to the simulation worker thread.
 */
export interface SimulationTask {
    skillId: string
    skillName: string
    courses: CourseData[]
    racedef: RaceDef
    baseUma: HorseStateData
    simOptions: SimulationOptions
    numSimulations: number
    useRandomMood?: boolean
    useRandomSeason?: boolean
    useRandomWeather?: boolean
    useRandomCondition?: boolean
    weightedSeasons?: number[]
    weightedWeathers?: number[]
    weightedConditions?: number[]
    confidenceInterval?: number
}

/**
 * Worker message result for successful simulation. The worker always
 * returns raw per-sim values; stats are computed downstream by
 * calculateStatsFromRawResults so all callers share one math path.
 */
export interface SimulationResult {
    skillName: string
    rawResults: number[]
}

/**
 * Worker message from simulation worker.
 */
export interface WorkerMessage {
    success: boolean
    result?: SimulationResult
    error?: string
}

/**
 * Skill metadata from skill_meta.json. baseCost is optional because hint
 * variants and some unique skills lack it; callers tolerate undefined.
 */
export interface SkillMeta {
    baseCost?: number
    groupId?: string
    order?: number
    iconId?: string
    /** Negative for purple (debuff) skills; used to exclude them as tiers. */
    score?: number
}

/**
 * Course data entry from course_data.json (raw format before processing).
 * surface/distanceType/turn are the engine's const enums (plain numbers at
 * runtime); typing them as such lets processCourseData consume this shape
 * without casts.
 */
export interface RawCourseData {
    raceTrackId: number
    surface: import('./uma-tools/uma-skill-tools/CourseData').Surface
    distanceType: import('./uma-tools/uma-skill-tools/CourseData').DistanceType
    distance: number
    turn: import('./uma-tools/uma-skill-tools/CourseData').Orientation
    course: number
    finishTimeMax: number
    finishTimeMin: number
    courseSetStatus: readonly import('./uma-tools/uma-skill-tools/CourseData').ThresholdStat[]
    corners: Array<{ start: number; length: number }>
    straights: readonly { start: number; end: number; frontType: number }[]
    slopes: readonly { start: number; length: number; slope: number }[]
    laneMax: number
}
