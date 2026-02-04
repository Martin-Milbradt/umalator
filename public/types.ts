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
    skills?: string[]
    skillPoints?: number | null
}

export interface Config {
    skills: Record<string, Skill>
    track?: Track
    uma?: Uma
}

// Results from simulation
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

export interface SkillResultWithStatus extends SkillResult {
    status: 'cached' | 'fresh' | 'pending' | 'error'
    rawResults?: number[]
    errorMessage?: string
}

export type SkillNames = Record<string, string[]>
export type SkillMeta = Record<
    string,
    { baseCost?: number; groupId?: string; order?: number }
>
export type CourseData = Record<
    string,
    {
        surface?: number
        distance?: number
        raceTrackId?: number | string
        turn?: number
    }
>

// Skill data types for trigger checking
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

export type SkillData = Record<string, SkillDataEntry>

// Skill restrictions for filtering
export interface SkillRestrictions {
    distanceTypes?: number[]
    groundConditions?: number[]
    groundTypes?: number[]
    isBasisDistance?: number[]
    rotations?: number[]
    runningStyles?: number[]
    seasons?: number[]
    trackIds?: number[]
    weathers?: number[]
}

export interface CurrentSettings {
    distanceType: number | null
    groundCondition: number | null
    groundType: number | null
    isBasisDistance: boolean | null
    rotation: number | null
    runningStyle: number
    season: number | null
    trackId: number | null
    weather: number | null
}

// Static fields we care about for filtering
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

export type VariantDefaultOperation = 'remove' | 'set'
