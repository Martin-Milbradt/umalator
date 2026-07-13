import type { RawCourseData, SkillMeta as RootSkillMeta } from '../types'
import type { SkillDataEntry } from '../utils'

// Re-export shared types from the canonical homes so UI code can keep
// importing from './types' without changing call sites.
export type {
    CurrentSettings,
    SkillDataAlternative,
    SkillDataEntry,
    SkillRestrictions,
    StaticField,
} from '../utils'
export { STATIC_FIELDS } from '../utils'

export interface Skill {
    discount: number | null
    default?: number | null
}

export interface Track {
    trackName?: string
    surface?: string
    distance?: number | string | null
    groundCondition?: string
    weather?: string
    season?: string
    numUmas?: number | null
    courseId?: string
}

export interface Uma {
    speed?: number | null
    stamina?: number | null
    power?: number | null
    guts?: number | null
    wisdom?: number | null
    strategy?: string
    distanceAptitude?: string
    surfaceAptitude?: string
    styleAptitude?: string
    mood?: number | null
    unique?: string
    uniqueLv?: number | null
    skills?: string[]
    skillPoints?: number | null
}

export type AvailableFilter = 'filtered' | 'hint' | 'noHint' | 'unfiltered'

export interface Filters {
    hideOwned?: boolean
    available?: AvailableFilter
    showIcons?: boolean
}

export interface Config {
    skills: Record<string, Skill>
    track?: Track
    uma?: Uma
    filters?: Filters
    // Fixed RNG seed for reproducible runs; null/absent = random each run.
    seed?: number | null
}

// Results from simulation
export interface SkillResult {
    skill: string
    cost: number
    discount: number
    meanLength: number
    medianLength: number
    meanLengthPerCost: number
    minLength: number
    maxLength: number
    // Outcome spread: central percentile band of individual per-race results
    // (not a CI of the mean).
    rangeLower: number
    rangeUpper: number
    // Confidence interval of the mean gain (mean ± t·SE).
    ciMeanLower: number
    ciMeanUpper: number
}

export interface SkillResultWithStatus extends SkillResult {
    status: 'cached' | 'fresh' | 'pending' | 'error'
    rawResults?: number[]
    errorMessage?: string
}

export type SkillNames = Record<string, string[]>
// SkillMeta is the *record* (id -> entry) consumed across the UI; the
// inner shape comes from root types.ts so StaticData and the loaded
// JSON line up without an `as unknown as` cast.
export type SkillMeta = Record<string, RootSkillMeta>
export type CourseData = Record<string, RawCourseData>
export type SkillData = Record<string, SkillDataEntry>

export type VariantDefaultOperation = 'remove' | 'set'
