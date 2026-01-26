/**
 * Type definitions for umalator-global-cli.
 * These types replace `any` usages for better type safety.
 */

import type { Mood } from '../uma-tools/uma-skill-tools/RaceParameters'
import type { CourseData } from './utils'

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
    mood?: Mood
    /** Skill IDs as either an array or a Record (from immutable Map serialization) */
    skills: Record<string, string> | string[]
}

/**
 * Simulation options for the race comparison engine.
 */
export interface SimulationOptions {
    seed: number | null
    useEnhancedSpurt?: boolean
    accuracyMode?: boolean
    pacemakerCount?: number
    allowRushedUma1?: boolean
    allowRushedUma2?: boolean
    allowDownhillUma1?: boolean
    allowDownhillUma2?: boolean
    allowSectionModifierUma1?: boolean
    allowSectionModifierUma2?: boolean
    skillCheckChanceUma1?: boolean
    skillCheckChanceUma2?: boolean
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
    racedef: import('../uma-tools/uma-skill-tools/RaceParameters').RaceParameters
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
    returnRawResults?: boolean
}

/**
 * Worker message result for successful simulation.
 */
export interface SimulationResult {
    skillName: string
    mean?: number
    median?: number
    min?: number
    max?: number
    ciLower?: number
    ciUpper?: number
    rawResults?: number[]
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
 * Skill metadata from skill_meta.json.
 */
export interface SkillMeta {
    baseCost: number
    groupId?: string
    order?: number
    iconId?: string
}

/**
 * Course data entry from course_data.json (raw format before processing).
 */
export interface RawCourseData {
    raceTrackId: number
    surface: number
    distanceType: number
    distance: number
    turn: number
    course: number
    finishTimeMax: number
    finishTimeMin: number
    courseSetStatus: readonly import('../uma-tools/uma-skill-tools/CourseData').ThresholdStat[]
    corners: Array<{ start: number; length: number }>
    straights: readonly { start: number; end: number; frontType: number }[]
    slopes: readonly { start: number; length: number; slope: number }[]
    laneMax: number
    [key: string]: unknown
}
