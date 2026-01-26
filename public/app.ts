import './input.css'
import { showToast } from './toast'

interface Skill {
    discount: number | null
    default?: number | null
}

interface Track {
    trackName?: string
    surface?: string
    distance?: number | string | null
    groundCondition?: string
    weather?: string
    season?: string
    numUmas?: number | null
    courseId?: string
}

interface Uma {
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

interface Config {
    skills: Record<string, Skill>
    track?: Track
    uma?: Uma
}

// Results from simulation
interface SkillResult {
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

interface SkillResultWithStatus extends SkillResult {
    status: 'cached' | 'fresh' | 'pending' | 'error'
    rawResults?: number[]
    errorMessage?: string
}

type SkillNames = Record<string, string[]>
type SkillMeta = Record<
    string,
    { baseCost?: number; groupId?: string; order?: number }
>
type CourseData = Record<
    string,
    {
        surface?: number
        distance?: number
        raceTrackId?: number | string
    }
>

// Skill data types for trigger checking
interface SkillDataAlternative {
    baseDuration: number
    condition: string
    effects: Array<{ modifier: number; target: number; type: number }>
    precondition: string
}

interface SkillDataEntry {
    alternatives: SkillDataAlternative[]
    rarity: number
    wisdomCheck: number
}

type SkillData = Record<string, SkillDataEntry>

// Skill restrictions for filtering
interface SkillRestrictions {
    distanceTypes?: number[]
    groundConditions?: number[]
    groundTypes?: number[]
    isBasisDistance?: number[]
    runningStyles?: number[]
    seasons?: number[]
    trackIds?: number[]
    weathers?: number[]
}

interface CurrentSettings {
    distanceType: number | null
    groundCondition: number | null
    groundType: number | null
    isBasisDistance: boolean | null
    runningStyle: number
    season: number | null
    trackId: number | null
    weather: number | null
}

// Mapping constants for skill trigger checking
// NOTE: Keep in sync with utils.ts STRATEGY_TO_RUNNING_STYLE
// Running style values verified from skill_data.json:
// 1=Front Runner (Nige), 2=Pace Chaser (Senkou), 3=Late Surger (Sasi), 4=End Closer (Oikomi), 5=Runaway (Oonige)
const STRATEGY_TO_RUNNING_STYLE: Record<string, number> = {
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

const TRACK_NAME_TO_ID: Record<string, number> = {
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

const CONDITION_MAP: Record<string, number> = {
    firm: 1,
    good: 2,
    heavy: 4,
    soft: 3,
}

const WEATHER_MAP: Record<string, number> = {
    cloudy: 2,
    rainy: 3,
    snowy: 4,
    sunny: 1,
}

const SEASON_MAP: Record<string, number> = {
    autumn: 3,
    fall: 3,
    sakura: 5,
    spring: 1,
    summer: 2,
    winter: 4,
}

const tracknames: Record<string, [string, string]> = {
    10001: ['', 'Sapporo'],
    10002: ['', 'Hakodate'],
    10003: ['', 'Niigata'],
    10004: ['', 'Fukushima'],
    10005: ['', 'Nakayama'],
    10006: ['', 'Tokyo'],
    10007: ['', 'Chukyo'],
    10008: ['', 'Kyoto'],
    10009: ['', 'Hanshin'],
    10010: ['', 'Kokura'],
    10101: ['', 'Ooi'],
}

let currentConfig: Config | null = null
let currentConfigFile: string | null = null
let saveTimeout: ReturnType<typeof setTimeout> | null = null
let pendingSavePromise: Promise<void> | null = null
let skillnames: SkillNames | null = null
let skillNameToId: Record<string, string> | null = null
let skillmeta: SkillMeta | null = null
let courseData: CourseData | null = null
let skillData: SkillData | null = null

// Cache for variant lookups (built once after skillnames loads)
let variantCache: Map<string, string[]> | null = null

// Results state
const resultsMap = new Map<string, SkillResultWithStatus>()
const selectedSkills = new Set<string>()
let sortColumn: keyof SkillResult = 'meanLengthPerCost'
let sortDirection: 'asc' | 'desc' = 'desc'
let lastCalculationTime: Date | null = null

// Frontend cache for calculated results (persists when skills are removed from table)
// Key: skillName, Value: result without status (raw calculation data)
const calculatedResultsCache = new Map<string, SkillResult>()

// Case-insensitive skill name lookup map (built once after skillnames loads)
let skillNameLookup: Map<string, string> | null = null

function buildSkillNameLookup(): void {
    if (!skillnames) return
    skillNameLookup = new Map()
    for (const [, names] of Object.entries(skillnames)) {
        if (Array.isArray(names) && names[0]) {
            const canonicalName = names[0]
            skillNameLookup.set(canonicalName.toLowerCase(), canonicalName)
        }
    }
}

function buildVariantCache(): void {
    if (!skillnames) return
    variantCache = new Map()
    for (const [, names] of Object.entries(skillnames)) {
        if (!Array.isArray(names) || !names[0]) continue
        const name = names[0]
        // Match names ending with " ○" or " ◎"
        const match = name.match(/^(.+) ([○◎])$/)
        if (match) {
            const baseName = match[1]
            if (!variantCache.has(baseName)) {
                variantCache.set(baseName, [])
            }
            variantCache.get(baseName)?.push(name)
        }
    }
}

// Static fields we care about for filtering
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

function parseConditionTerm(
    term: string,
): { field: StaticField; values: number[] } | null {
    const match = term.match(/^([a-z_]+)(==|>=|<=|>|<)(\d+)$/)
    if (!match) return null
    const field = match[1] as StaticField
    if (!STATIC_FIELDS.includes(field)) return null
    const operator = match[2]
    const value = parseInt(match[3], 10)
    const values = expandComparisonToValues(field, operator, value)
    return { field, values }
}

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

function mergeRestrictions(
    a: SkillRestrictions,
    b: SkillRestrictions,
): SkillRestrictions {
    const merged: SkillRestrictions = {}
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
            merged[field] = [...new Set([...aVals, ...bVals])]
        }
    }

    return merged
}

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
            const intersection = aVals.filter((v) => bVals.includes(v))
            if (intersection.length > 0) {
                result[field] = intersection
            } else {
                result[field] = []
            }
        } else if (bVals) {
            result[field] = bVals
        }
    }

    return result
}

function extractStaticRestrictions(
    condition: string,
    precondition?: string,
): SkillRestrictions {
    if (!condition) return {}

    const orBranches = condition.split('@')
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

function extractSkillRestrictions(
    skillDataEntry: SkillDataEntry,
): SkillRestrictions {
    if (
        !skillDataEntry.alternatives ||
        skillDataEntry.alternatives.length === 0
    ) {
        return {}
    }

    let mergedRestrictions: SkillRestrictions | null = null

    for (const alt of skillDataEntry.alternatives) {
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

function canSkillTrigger(
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

function getDistanceType(distanceMeters: number): number {
    if (distanceMeters <= 1400) return 1
    if (distanceMeters <= 1800) return 2
    if (distanceMeters <= 2400) return 3
    return 4
}

function isRandomValue(value: string | undefined | null): boolean {
    if (!value) return false
    return value.trim().toLowerCase() === '<random>'
}

function getCurrentSettings(): CurrentSettings {
    if (!currentConfig) {
        return {
            distanceType: null,
            groundCondition: null,
            groundType: null,
            isBasisDistance: null,
            runningStyle: 3,
            season: null,
            trackId: null,
            weather: null,
        }
    }

    const track = currentConfig.track
    const uma = currentConfig.uma

    // Distance type and basis distance
    let distanceType: number | null = null
    let isBasisDistance: boolean | null = null
    if (track?.distance) {
        if (typeof track.distance === 'number') {
            distanceType = getDistanceType(track.distance)
            isBasisDistance = track.distance % 400 === 0
        } else if (
            typeof track.distance === 'string' &&
            !isDistanceCategory(track.distance) &&
            !isRandomValue(track.distance)
        ) {
            const parsed = parseInt(track.distance, 10)
            if (!Number.isNaN(parsed)) {
                distanceType = getDistanceType(parsed)
                isBasisDistance = parsed % 400 === 0
            }
        }
        // If distance category or random, distanceType and isBasisDistance stay null
    }

    // Running style - always required, defaults to Pace Chaser (3)
    let runningStyle = 3
    if (uma?.strategy) {
        runningStyle = STRATEGY_TO_RUNNING_STYLE[uma.strategy] ?? 3
    }

    // Ground type (surface)
    let groundType: number | null = null
    if (track?.surface && !isRandomValue(track.surface)) {
        const surfaceLower = track.surface.toLowerCase()
        if (surfaceLower === 'turf') {
            groundType = 1
        } else if (surfaceLower === 'dirt') {
            groundType = 2
        }
    }

    // Ground condition
    let groundCondition: number | null = null
    if (track?.groundCondition && !isRandomValue(track.groundCondition)) {
        groundCondition =
            CONDITION_MAP[track.groundCondition.toLowerCase()] ?? null
    }

    // Weather
    let weather: number | null = null
    if (track?.weather && !isRandomValue(track.weather)) {
        weather = WEATHER_MAP[track.weather.toLowerCase()] ?? null
    }

    // Season
    let season: number | null = null
    if (track?.season && !isRandomValue(track.season)) {
        season = SEASON_MAP[track.season.toLowerCase()] ?? null
    }

    // Track ID
    let trackId: number | null = null
    if (track?.trackName && !isRandomValue(track.trackName)) {
        trackId = TRACK_NAME_TO_ID[track.trackName] ?? null
    }

    return {
        distanceType,
        groundCondition,
        groundType,
        isBasisDistance,
        runningStyle,
        season,
        trackId,
        weather,
    }
}

function canSkillTriggerByName(skillName: string): boolean {
    if (!skillData || !skillNameToId) return true // If data not loaded, don't filter

    const skillId = skillNameToId[skillName]
    if (!skillId) return true // Unknown skill, don't filter

    const entry = skillData[skillId]
    if (!entry) return true // No data for skill, don't filter

    const restrictions = extractSkillRestrictions(entry)
    const settings = getCurrentSettings()

    return canSkillTrigger(restrictions, settings)
}

;(async function loadSkillnamesOnInit() {
    const response = await fetch('/api/skillnames')
    if (!response.ok) {
        throw new Error(
            `Failed to load skillnames: ${response.status} ${response.statusText}`,
        )
    }
    skillnames = (await response.json()) as SkillNames
    if (!skillnames || typeof skillnames !== 'object') {
        throw new Error('Invalid skillnames data received')
    }
    skillNameToId = Object.fromEntries(
        Object.entries(skillnames).map(([id, names]) => [names[0], id]),
    )
    buildVariantCache()
    buildSkillNameLookup()
})().catch(() => {
    showToast({ type: 'error', message: 'Failed to load skill names' })
})
;(async function loadSkillmetaOnInit() {
    const response = await fetch('/api/skillmeta')
    if (!response.ok) {
        throw new Error(
            `Failed to load skillmeta: ${response.status} ${response.statusText}`,
        )
    }
    skillmeta = (await response.json()) as SkillMeta
    if (!skillmeta || typeof skillmeta !== 'object') {
        throw new Error('Invalid skillmeta data received')
    }
})().catch(() => {
    showToast({ type: 'error', message: 'Failed to load skill metadata' })
})
;(async function loadSkillDataOnInit() {
    const response = await fetch('/api/skilldata')
    if (!response.ok) {
        throw new Error(
            `Failed to load skilldata: ${response.status} ${response.statusText}`,
        )
    }
    skillData = (await response.json()) as SkillData
    if (!skillData || typeof skillData !== 'object') {
        throw new Error('Invalid skilldata received')
    }
})().catch(() => {
    showToast({ type: 'error', message: 'Failed to load skill data' })
})

async function waitForCourseData(): Promise<void> {
    if (courseData) {
        return
    }
    await new Promise<void>((resolve) => {
        const checkCourseData = setInterval(() => {
            if (courseData) {
                clearInterval(checkCourseData)
                resolve()
            }
        }, 50)
        setTimeout(() => {
            clearInterval(checkCourseData)
            resolve()
        }, 5000)
    })
}

;(async function loadCourseDataOnInit() {
    const response = await fetch('/api/coursedata')
    if (!response.ok) {
        throw new Error(
            `Failed to load course data: ${response.status} ${response.statusText}`,
        )
    }
    courseData = (await response.json()) as CourseData
    if (!courseData || typeof courseData !== 'object') {
        throw new Error('Invalid course data received')
    }
    if (currentConfig) {
        renderTrack()
    }
})().catch(() => {
    showToast({ type: 'error', message: 'Failed to load course data' })
})

function normalizeSkillName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[◎○×]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function getCanonicalSkillName(inputName: string): string {
    if (!skillNameLookup) return inputName
    const canonical = skillNameLookup.get(inputName.toLowerCase().trim())
    return canonical || inputName
}

function getBaseSkillName(skillName: string): string {
    return skillName.replace(/[◎○]$/, '').trim()
}

function getVariantsForBaseName(baseName: string): string[] {
    if (!variantCache) return []
    return variantCache.get(baseName) || []
}

function getOtherVariant(skillName: string): string | string[] | null {
    if (!variantCache) return null
    const baseName = getBaseSkillName(skillName)
    const hasCircle = skillName.endsWith(' ○')
    const hasDoubleCircle = skillName.endsWith(' ◎')

    if (!hasCircle && !hasDoubleCircle) {
        const variants = getVariantsForBaseName(baseName)
        if (variants.length === 2) {
            return variants
        }
        return null
    }

    const otherVariantName = hasCircle ? `${baseName} ◎` : `${baseName} ○`
    const variants = variantCache.get(baseName) || []

    // Check if the other variant exists in the cache
    if (variants.includes(otherVariantName)) {
        return otherVariantName
    }

    return null
}

type VariantDefaultOperation = 'remove' | 'set'

/**
 * Updates the default value for a skill and all its variants.
 * Handles both ○/◎ variant pairs consistently.
 */
function updateSkillVariantsDefault(
    skillName: string,
    operation: VariantDefaultOperation,
    newValue?: number | null,
): void {
    if (!currentConfig) return

    const baseName = getBaseSkillName(skillName)
    const variants = getVariantsForBaseName(baseName)

    // Determine which skills to update - always include skillName
    let skillsToUpdate: string[]
    if (variants.length === 2) {
        skillsToUpdate = [...new Set([skillName, ...variants])]
    } else {
        const otherVariant = getOtherVariant(skillName)
        if (otherVariant) {
            const variantsToAdd = Array.isArray(otherVariant)
                ? otherVariant
                : [otherVariant]
            skillsToUpdate = [skillName, ...variantsToAdd]
        } else {
            skillsToUpdate = [skillName]
        }
    }

    // Apply the operation to all relevant skills
    for (const variantName of skillsToUpdate) {
        if (!currentConfig.skills[variantName]) continue

        if (operation === 'remove') {
            delete currentConfig.skills[variantName].default
        } else if (operation === 'set' && newValue !== undefined) {
            currentConfig.skills[variantName].default = newValue
        }
    }
}

function findSkillId(skillName: string): string | null {
    if (!skillNameToId || !skillnames) return null
    if (skillNameToId[skillName]) {
        return skillNameToId[skillName]
    }

    const normalizedSkillName = normalizeSkillName(skillName)
    for (const [id, names] of Object.entries(skillnames)) {
        if (Array.isArray(names)) {
            for (const name of names) {
                if (name) {
                    const normalizedName = normalizeSkillName(name)
                    if (
                        normalizedName === normalizedSkillName ||
                        normalizedName.includes(normalizedSkillName) ||
                        normalizedSkillName.includes(normalizedName)
                    ) {
                        return id
                    }
                }
            }
        }
    }

    return null
}

function getSkillGroupId(skillName: string): string | null {
    if (!skillmeta) return null
    const skillId = findSkillId(skillName)
    if (!skillId) return null
    return skillmeta[skillId]?.groupId || null
}

function getSkillOrder(skillName: string): number {
    if (!skillmeta) return 0
    const skillId = findSkillId(skillName)
    if (!skillId) return 0
    return skillmeta[skillId]?.order ?? 0
}

/**
 * Check if Uma has an upgraded version of the given skill.
 * Upgraded skills have lower order numbers in the same groupId.
 */
function umaHasUpgradedVersion(skillName: string): boolean {
    if (!currentConfig?.uma?.skills || !skillmeta) return false

    const groupId = getSkillGroupId(skillName)
    if (!groupId) return false

    const skillOrder = getSkillOrder(skillName)

    for (const umaSkill of currentConfig.uma.skills) {
        const umaGroupId = getSkillGroupId(umaSkill)
        const umaOrder = getSkillOrder(umaSkill)
        if (umaGroupId === groupId && umaOrder < skillOrder) {
            return true
        }
    }
    return false
}

/**
 * Check if a skill is currently on Uma (exact match).
 */
function isSkillOnUma(skillName: string): boolean {
    return currentConfig?.uma?.skills?.includes(skillName) ?? false
}

/**
 * Get the skill from the same group that is currently on Uma.
 * Returns null if no skill from the group is on Uma.
 */
function getGroupVariantOnUma(skillName: string): string | null {
    if (!currentConfig?.uma?.skills || !skillmeta) return null

    const groupId = getSkillGroupId(skillName)
    if (!groupId) return null

    for (const umaSkill of currentConfig.uma.skills) {
        const umaGroupId = getSkillGroupId(umaSkill)
        if (umaGroupId === groupId) {
            return umaSkill
        }
    }
    return null
}

/**
 * Get the basic variant (higher order) of a skill in the same group.
 * Returns null if no basic variant exists.
 */
function getBasicVariant(skillName: string): string | null {
    if (!skillmeta || !skillnames) return null

    const skillId = findSkillId(skillName)
    if (!skillId) return null

    const currentMeta = skillmeta[skillId]
    if (!currentMeta?.groupId) return null

    const currentGroupId = currentMeta.groupId
    const currentOrder = currentMeta.order ?? 0

    // Find skill with higher order (basic version) in the same group
    for (const [otherId, otherMeta] of Object.entries(skillmeta)) {
        if (
            otherMeta.groupId === currentGroupId &&
            (otherMeta.order ?? 0) > currentOrder
        ) {
            const names = skillnames[otherId]
            if (names?.[0]) {
                return names[0]
            }
        }
    }
    return null
}

/**
 * Get the upgraded variant (lower order) of a skill in the same group.
 * Returns null if no upgraded variant exists.
 */
function getUpgradedVariant(skillName: string): string | null {
    if (!skillmeta || !skillnames) return null

    const skillId = findSkillId(skillName)
    if (!skillId) return null

    const currentMeta = skillmeta[skillId]
    if (!currentMeta?.groupId) return null

    const currentGroupId = currentMeta.groupId
    const currentOrder = currentMeta.order ?? 0

    // Find skill with lower order (upgraded version) in the same group
    for (const [otherId, otherMeta] of Object.entries(skillmeta)) {
        if (
            otherMeta.groupId === currentGroupId &&
            (otherMeta.order ?? 0) < currentOrder
        ) {
            const names = skillnames[otherId]
            if (names?.[0]) {
                return names[0]
            }
        }
    }
    return null
}

function getSkillBaseCost(skillName: string): number {
    if (!skillmeta) return 200
    const skillId = findSkillId(skillName)
    if (!skillId) return 200
    return skillmeta[skillId]?.baseCost ?? 200
}

// Skills to ignore when calculating prerequisite costs (negative/debuff skills)
const SKILLS_TO_IGNORE = [
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

/**
 * Calculate skill cost including prerequisite costs.
 * For upgraded skills (◎), this adds the cost of prerequisite skills (○)
 * that Uma doesn't already have.
 *
 * NOTE: This logic is intentionally duplicated from utils.ts:calculateSkillCost
 * to avoid complex build steps for sharing server-side code with the frontend.
 * Keep both implementations in sync when modifying cost calculation logic.
 */
function getSkillCostWithDiscount(skillName: string): number {
    const baseCost = getSkillBaseCost(skillName)
    const discount = currentConfig?.skills[skillName]?.discount ?? 0
    let totalCost = Math.ceil(baseCost * (1 - discount / 100))

    if (!skillmeta || !skillnames) return totalCost

    const skillId = findSkillId(skillName)
    if (!skillId) return totalCost

    const currentMeta = skillmeta[skillId]
    if (!currentMeta?.groupId) return totalCost

    const currentGroupId = currentMeta.groupId
    const currentOrder = currentMeta.order ?? 0
    const umaSkills = currentConfig?.uma?.skills || []

    // Find prerequisite skills (same groupId, higher order = basic versions)
    for (const [otherSkillId, otherMeta] of Object.entries(skillmeta)) {
        if (
            otherMeta.groupId === currentGroupId &&
            (otherMeta.order ?? 0) > currentOrder
        ) {
            const otherSkillNames = skillnames[otherSkillId]
            if (!otherSkillNames) continue

            // Skip negative/debuff skills (ending with " ×") and ignored skills
            const primaryName = otherSkillNames[0]
            if (
                primaryName.endsWith(' ×') ||
                SKILLS_TO_IGNORE.includes(primaryName)
            ) {
                continue
            }

            // Check if Uma already has this prerequisite
            const umaHasPrereq = umaSkills.some((umaSkill) => {
                const umaSkillId = findSkillId(umaSkill)
                return umaSkillId === otherSkillId
            })

            if (!umaHasPrereq) {
                // Add prerequisite cost with its discount
                const prereqBaseCost = otherMeta.baseCost ?? 200
                const prereqDiscount =
                    currentConfig?.skills[primaryName]?.discount ?? 0
                totalCost += Math.ceil(
                    prereqBaseCost * (1 - prereqDiscount / 100),
                )
            }
        }
    }

    return totalCost
}

async function loadConfigFiles(): Promise<void> {
    const response = await fetch('/api/configs')
    const files = (await response.json()) as string[]
    const select = document.getElementById('config-select') as HTMLSelectElement
    if (!select) return
    select.innerHTML = ''
    files.forEach((file) => {
        const option = document.createElement('option')
        option.value = file
        option.textContent = file
        select.appendChild(option)
    })
    await waitForCourseData()
    if (files.length > 0) {
        await loadConfig(files[0])
    }
}

async function loadConfig(filename: string): Promise<void> {
    const response = await fetch(`/api/config/${filename}`)
    const config = (await response.json()) as Config
    currentConfig = config
    currentConfigFile = filename
    const select = document.getElementById('config-select') as HTMLSelectElement
    if (select) {
        select.value = filename
    }

    renderSkills()
    renderTrack()
    renderUma()
}

function deleteSkill(skillName: string): void {
    if (!currentConfig) return
    const baseName = getBaseSkillName(skillName)
    const skillsToDelete = [baseName, `${baseName} ○`, `${baseName} ◎`]
    skillsToDelete.forEach((skillToDelete) => {
        delete currentConfig.skills[skillToDelete]
    })
}

function renderSkills(): void {
    const squareClasses =
        'py-0.5 px-1 w-6 h-6 rounded text-[13px] cursor-pointer transition-colors'
    if (!currentConfig) return
    const container = document.getElementById('skills-container')
    if (!container) return
    container.innerHTML = ''
    const skills = currentConfig.skills
    const umaSkills = currentConfig.uma?.skills || []

    const skillNames = Object.keys(skills)
    const skillsToRender = new Set<string>()
    const skillsToHide = new Set<string>()

    skillNames.forEach((skillName) => {
        const baseName = getBaseSkillName(skillName)
        const variants = getVariantsForBaseName(baseName)

        if (variants.length === 2) {
            skillsToHide.add(baseName)
            variants.forEach((variantName) => {
                skillsToRender.add(variantName)
                if (!skills[variantName]) {
                    const baseSkill = skills[baseName] || skills[skillName]
                    skills[variantName] = {
                        discount:
                            baseSkill.discount !== null &&
                            baseSkill.discount !== undefined
                                ? baseSkill.discount
                                : null,
                    }
                } else {
                    const baseSkill = skills[baseName] || skills[skillName]
                    if (
                        baseSkill.discount !== null &&
                        baseSkill.discount !== undefined
                    ) {
                        skills[variantName].discount = baseSkill.discount
                    }
                }
            })
        } else {
            const otherVariant = getOtherVariant(skillName)
            if (otherVariant) {
                const variantsToAdd = Array.isArray(otherVariant)
                    ? otherVariant
                    : [otherVariant]
                variantsToAdd.forEach((variantName) => {
                    if (!skillsToRender.has(variantName)) {
                        skillsToRender.add(variantName)
                        if (!skills[variantName]) {
                            const baseSkill = skills[skillName]
                            skills[variantName] = {
                                discount:
                                    baseSkill.discount !== null &&
                                    baseSkill.discount !== undefined
                                        ? baseSkill.discount
                                        : null,
                            }
                        } else {
                            const baseSkill = skills[skillName]
                            if (
                                baseSkill.discount !== null &&
                                baseSkill.discount !== undefined
                            ) {
                                skills[variantName].discount =
                                    baseSkill.discount
                            }
                        }
                    }
                })
            }
            if (!skillsToHide.has(skillName)) {
                skillsToRender.add(skillName)
            }
        }
    })

    // Pre-compute skill IDs to avoid O(n²) lookups in sort comparator
    const skillIdCache = new Map<string, number>()
    for (const name of skillsToRender) {
        const idStr = findSkillId(name)
        skillIdCache.set(name, idStr ? parseInt(idStr, 10) : 0)
    }
    const sortedSkillNames = Array.from(skillsToRender).sort((a, b) => {
        return (skillIdCache.get(a) || 0) - (skillIdCache.get(b) || 0)
    })

    // Filter out skills that cannot trigger under current settings
    const triggerableSkills = sortedSkillNames.filter(canSkillTriggerByName)

    triggerableSkills.forEach((skillName) => {
        const skill = skills[skillName]
        if (!skill) return

        if (skill.discount === undefined) {
            skill.discount = null
        }

        const div = document.createElement('div')
        div.className =
            'flex items-center gap-2 hover:bg-zinc-800 px-1 py-0.5 rounded'
        div.dataset.skill = skillName

        const currentDiscount = skill.discount
        const discountOptions: (number | null)[] = [null, 0, 10, 20, 30, 35, 40]
        const discountButtonGroup = document.createElement('div')
        discountButtonGroup.className = 'flex gap-1 items-center'
        discountButtonGroup.dataset.skill = skillName

        discountOptions.forEach((value) => {
            const button = document.createElement('button')
            button.className = `${squareClasses} bg-zinc-700 text-zinc-200 border border-zinc-600 hover:bg-zinc-600 hover:border-zinc-500`
            button.dataset.skill = skillName
            button.dataset.discount = value === null ? '-' : value.toString()
            button.textContent = value === null ? '-' : value.toString()
            if (
                currentDiscount === value ||
                (value === null &&
                    (currentDiscount === null || currentDiscount === undefined))
            ) {
                button.className = `${squareClasses} bg-sky-600 text-white border border-sky-600 hover:bg-sky-700 hover:border-sky-700`
            }
            discountButtonGroup.appendChild(button)
        })

        const lockButton = document.createElement('button')
        lockButton.className = `${squareClasses} bg-transparent text-zinc-500 border-none hover:text-zinc-200 hover:bg-zinc-700`
        lockButton.dataset.skill = skillName
        const skillDefault = skill.default
        const isDefaultActive =
            skillDefault !== undefined &&
            skillDefault !== null &&
            currentDiscount === skillDefault
        const isDefaultNull =
            (skillDefault === undefined || skillDefault === null) &&
            (currentDiscount === null || currentDiscount === undefined)
        const isLocked = isDefaultActive || isDefaultNull
        lockButton.textContent = isLocked ? '🔒' : '🔓'
        lockButton.title = isLocked
            ? 'Remove default'
            : 'Set current discount as default'
        lockButton.addEventListener('click', (e) => {
            e.stopPropagation()
            const target = e.target as HTMLElement
            const skillName = target.dataset.skill
            if (!skillName || !currentConfig) return
            const currentDiscount = currentConfig.skills[skillName]?.discount
            const skillDefault = currentConfig.skills[skillName]?.default
            const isCurrentlyDefault =
                (skillDefault !== undefined &&
                    skillDefault !== null &&
                    currentDiscount === skillDefault) ||
                ((skillDefault === undefined || skillDefault === null) &&
                    (currentDiscount === null || currentDiscount === undefined))
            if (isCurrentlyDefault) {
                updateSkillVariantsDefault(skillName, 'remove')
            } else if (
                currentDiscount === null ||
                currentDiscount === undefined
            ) {
                updateSkillVariantsDefault(skillName, 'remove')
            } else {
                updateSkillVariantsDefault(skillName, 'set', currentDiscount)
            }
            renderSkills()
            autoSave()
        })
        discountButtonGroup.appendChild(lockButton)

        const addToUmaButton = document.createElement('button')
        const isInUmaSkills = umaSkills.includes(skillName)
        const hasDiscount =
            skill.discount !== null && skill.discount !== undefined
        if (isInUmaSkills) {
            addToUmaButton.className = `${squareClasses} bg-red-600 text-white border-none hover:bg-red-700`
            addToUmaButton.textContent = '-'
            addToUmaButton.title = 'Remove from Uma skills'
        } else {
            if (hasDiscount) {
                addToUmaButton.className = `${squareClasses} bg-sky-600 text-white border-none hover:bg-sky-700`
            } else {
                addToUmaButton.className = `${squareClasses} opacity-40 bg-zinc-700 text-zinc-400 border border-zinc-600 hover:bg-zinc-600 hover:border-zinc-500`
            }
            addToUmaButton.textContent = '+'
            addToUmaButton.title = 'Add to Uma skills'
        }
        addToUmaButton.dataset.skill = skillName
        addToUmaButton.addEventListener('click', (e) => {
            e.stopPropagation()
            const target = e.target as HTMLElement
            const skillName = target.dataset.skill
            if (!skillName || !currentConfig) return
            if (!currentConfig.uma) {
                currentConfig.uma = {}
            }
            if (!currentConfig.uma.skills) {
                currentConfig.uma.skills = []
            }

            const currentlyInUmaSkills =
                currentConfig.uma.skills.includes(skillName)
            if (currentlyInUmaSkills) {
                // Removing skill
                removeSkillFromUma(skillName)
            } else {
                // Adding skill
                const cost = getSkillCostWithDiscount(skillName)
                addSkillToUmaFromTable(skillName, cost)
            }
            renderUma()
            renderSkills()
            autoSave()
        })

        const skillNameSpan = document.createElement('span')
        skillNameSpan.className = 'flex-1 cursor-pointer hover:text-teal-400'
        skillNameSpan.textContent = skillName
        skillNameSpan.title = 'Click to edit skill name'
        skillNameSpan.dataset.skill = skillName
        skillNameSpan.addEventListener('click', (e) => {
            e.stopPropagation()
            const target = e.target as HTMLElement
            const skillName = target.dataset.skill
            if (!skillName || !currentConfig) return
            const originalName = skillName
            const skillNameInput = document.createElement('input')
            skillNameInput.type = 'text'
            skillNameInput.className =
                'py-0.5 px-1 border-sky-500 min-w-[100px] m-0 bg-zinc-700 text-zinc-200 border rounded text-[13px] focus:outline-none focus:border-sky-400 flex-1'
            skillNameInput.value = originalName
            const spanTarget = e.target as HTMLElement
            skillNameInput.style.width = `${spanTarget.offsetWidth}px`
            skillNameInput.style.minWidth = '100px'

            const restoreSpan = () => {
                renderSkills()
            }

            const handleBlur = () => {
                const inputName = skillNameInput.value.trim()
                if (!inputName) {
                    deleteSkill(originalName)
                    renderSkills()
                    renderUma()
                    autoSave()
                } else {
                    const canonicalName = getCanonicalSkillName(inputName)
                    if (
                        canonicalName !== originalName &&
                        !currentConfig.skills[canonicalName]
                    ) {
                        const skillData = currentConfig.skills[originalName]
                        deleteSkill(originalName)
                        currentConfig.skills[canonicalName] = skillData
                        renderSkills()
                        renderUma()
                        autoSave()
                    } else {
                        restoreSpan()
                    }
                }
            }

            skillNameInput.addEventListener('blur', handleBlur)
            skillNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    skillNameInput.blur()
                } else if (e.key === 'Escape') {
                    restoreSpan()
                }
            })

            const parent = spanTarget.parentNode
            if (parent) {
                parent.replaceChild(skillNameInput, spanTarget)
            }
            skillNameInput.focus()
            skillNameInput.select()
        })

        const label = document.createElement('label')
        label.className = 'flex-1 m-0 flex items-center gap-2'
        label.appendChild(skillNameSpan)

        div.appendChild(addToUmaButton)
        div.appendChild(label)
        div.appendChild(discountButtonGroup)

        container.appendChild(div)
    })

    // Event delegation is set up once via setupSkillsContainerDelegation()
}

function calculateDropdownWidth(options: string[]): number {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return 120
    context.font =
        "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    let maxWidth = 0
    options.forEach((opt) => {
        const width = context.measureText(opt).width
        if (width > maxWidth) {
            maxWidth = width
        }
    })
    return Math.max(maxWidth + 30, 60)
}

const DISTANCE_CATEGORIES = ['<Sprint>', '<Mile>', '<Medium>', '<Long>']
const RANDOM_LOCATION = '<Random>'

function isRandomLocation(trackName: string | undefined | null): boolean {
    return (
        trackName !== undefined &&
        trackName !== null &&
        trackName.toLowerCase().trim() === '<random>'
    )
}

function isDistanceCategory(
    distance: string | number | null | undefined,
): boolean {
    if (!distance) return false
    const normalized = distance.toString().toLowerCase().trim()
    return ['<sprint>', '<mile>', '<medium>', '<long>'].includes(normalized)
}

function getAvailableDistances(
    trackName: string | undefined,
    surface: string | undefined,
): string[] {
    if (!courseData || !surface) {
        return DISTANCE_CATEGORIES
    }

    const surfaceValue = surface.toLowerCase() === 'turf' ? 1 : 2
    if (surfaceValue === null) {
        return DISTANCE_CATEGORIES
    }

    const isRandom = isRandomLocation(trackName)

    if (isRandom) {
        const distances = new Set<number>()
        for (const [, rawCourse] of Object.entries(courseData)) {
            if (!rawCourse || typeof rawCourse !== 'object') {
                continue
            }
            if (rawCourse.surface === surfaceValue) {
                if (rawCourse.distance !== undefined) {
                    distances.add(rawCourse.distance)
                }
            }
        }
        const distanceList = Array.from(distances)
            .sort((a, b) => a - b)
            .map((d) => d.toString())
        return [...DISTANCE_CATEGORIES, ...distanceList]
    }

    if (!trackName) {
        return DISTANCE_CATEGORIES
    }

    const normalizedTrackName = trackName.toLowerCase()
    const trackId = Object.keys(tracknames).find(
        (id) => tracknames[id][1]?.toLowerCase() === normalizedTrackName,
    )
    if (!trackId) {
        return DISTANCE_CATEGORIES
    }

    const distances = new Set<number>()
    for (const [, rawCourse] of Object.entries(courseData)) {
        if (!rawCourse || typeof rawCourse !== 'object') {
            continue
        }
        const raceTrackId = rawCourse.raceTrackId
        if (raceTrackId == null) {
            continue
        }
        if (
            raceTrackId.toString() === trackId &&
            rawCourse.surface === surfaceValue
        ) {
            if (rawCourse.distance !== undefined) {
                distances.add(rawCourse.distance)
            }
        }
    }

    const distanceList = Array.from(distances)
        .sort((a, b) => a - b)
        .map((d) => d.toString())
    return [...DISTANCE_CATEGORIES, ...distanceList]
}

function renderTrack(): void {
    if (!currentConfig) return
    const container = document.getElementById('track-container')
    if (!container) return
    container.innerHTML = ''
    const track = currentConfig.track || {}

    const trackLocations = Object.values(tracknames)
        .map((arr) => arr[1])
        .filter(Boolean)
        .sort() as string[]
    const locationOptions = [RANDOM_LOCATION, ...trackLocations]
    const locationWidth =
        locationOptions.length > 0
            ? calculateDropdownWidth(locationOptions)
            : 120

    const distanceOptions = getAvailableDistances(
        track.trackName,
        track.surface,
    )
    const distanceWidth =
        distanceOptions.length > 0
            ? calculateDropdownWidth(distanceOptions)
            : 60

    interface Field {
        key: keyof Track
        label: string
        type: 'select' | 'number' | 'text'
        options?: string[]
        width: number
        dynamic?: boolean
        min?: number
        max?: number
    }

    const fields: Field[] = [
        {
            key: 'trackName',
            label: 'Location',
            type: 'select',
            options: locationOptions,
            width: locationWidth,
        },
        {
            key: 'surface',
            label: 'Surface',
            type: 'select',
            options: ['Turf', 'Dirt'],
            width: calculateDropdownWidth(['Turf', 'Dirt']),
        },
        {
            key: 'distance',
            label: 'Distance',
            type: 'select',
            options: distanceOptions,
            width: distanceWidth,
            dynamic: true,
        },
        {
            key: 'groundCondition',
            label: 'Condition',
            type: 'select',
            options: ['<Random>', 'Firm', 'Good', 'Soft', 'Heavy'],
            width: calculateDropdownWidth([
                '<Random>',
                'Firm',
                'Good',
                'Soft',
                'Heavy',
            ]),
        },
        {
            key: 'weather',
            label: 'Weather',
            type: 'select',
            options: ['<Random>', 'Sunny', 'Cloudy', 'Rainy', 'Snowy'],
            width: calculateDropdownWidth([
                '<Random>',
                'Sunny',
                'Cloudy',
                'Rainy',
                'Snowy',
            ]),
        },
        {
            key: 'season',
            label: 'Season',
            type: 'select',
            options: [
                '<Random>',
                'Spring',
                'Summer',
                'Fall',
                'Winter',
                'Sakura',
            ],
            width: calculateDropdownWidth([
                '<Random>',
                'Spring',
                'Summer',
                'Fall',
                'Winter',
                'Sakura',
            ]),
        },
        { key: 'numUmas', label: 'Umas', type: 'number', width: 50, min: 1 },
        { key: 'courseId', label: 'Course ID', type: 'text', width: 70 },
    ]

    const trackLine = document.createElement('div')
    trackLine.className = 'flex flex-wrap items-center gap-1'

    fields.forEach((field) => {
        const wrapper = document.createElement('span')
        wrapper.className = 'inline-flex items-center gap-1'

        const label = document.createElement('span')
        label.className = 'text-zinc-300 text-[13px] whitespace-nowrap'
        label.textContent = `${field.label}: `
        wrapper.appendChild(label)

        let input: HTMLInputElement | HTMLSelectElement
        if (field.type === 'select') {
            input = document.createElement('select')
            input.className =
                'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500'
            if (field.width) {
                input.style.width = `${field.width}px`
            }
            field.options?.forEach((opt) => {
                const option = document.createElement('option')
                option.value = opt
                option.textContent = opt
                const trackValue = track[field.key]
                const trackValueStr = trackValue?.toString()?.toLowerCase()
                const optLower = opt.toLowerCase()
                if (
                    trackValue === opt ||
                    trackValueStr === opt ||
                    trackValueStr === optLower
                ) {
                    option.selected = true
                }
                input.appendChild(option)
            })
        } else {
            input = document.createElement('input')
            input.type = field.type
            input.className =
                'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500'
            const fieldValue = track[field.key]
            input.value =
                fieldValue === null || fieldValue === undefined
                    ? ''
                    : String(fieldValue)
            if (field.width) {
                input.style.width = `${field.width}px`
            }
            if (field.min !== undefined) {
                input.min = String(field.min)
            }
            if (field.max !== undefined) {
                input.max = String(field.max)
            }
        }

        input.dataset.key = field.key
        input.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement | HTMLSelectElement
            let value: string | number | null
            if (field.type === 'number') {
                const parsed = parseInt(target.value, 10)
                value =
                    target.value === '' || Number.isNaN(parsed) ? null : parsed
            } else {
                value = target.value
            }
            if (!currentConfig) return
            if (!currentConfig.track) {
                currentConfig.track = {}
            }
            ;(currentConfig.track as Record<string, unknown>)[field.key] = value

            if (field.key === 'trackName' || field.key === 'surface') {
                await waitForCourseData()

                const newTrackName =
                    field.key === 'trackName'
                        ? (value as string)
                        : currentConfig.track.trackName
                const newSurface =
                    field.key === 'surface'
                        ? (value as string)
                        : currentConfig.track.surface
                const newDistanceOptions = getAvailableDistances(
                    newTrackName,
                    newSurface,
                )

                const distanceSelect = container.querySelector(
                    'select[data-key="distance"]',
                ) as HTMLSelectElement
                if (distanceSelect) {
                    const currentDistance = currentConfig.track.distance
                    const currentDistanceStr = currentDistance?.toString()
                    distanceSelect.innerHTML = ''
                    newDistanceOptions.forEach((dist) => {
                        const option = document.createElement('option')
                        option.value = dist
                        option.textContent = dist
                        if (
                            dist === currentDistanceStr ||
                            dist.toLowerCase() ===
                                currentDistanceStr?.toLowerCase()
                        ) {
                            option.selected = true
                        }
                        distanceSelect.appendChild(option)
                    })

                    const isCurrentDistanceValid = newDistanceOptions.some(
                        (opt) =>
                            opt === currentDistanceStr ||
                            opt.toLowerCase() ===
                                currentDistanceStr?.toLowerCase(),
                    )
                    if (
                        !isCurrentDistanceValid &&
                        newDistanceOptions.length > 0
                    ) {
                        distanceSelect.value = newDistanceOptions[0]
                        if (isDistanceCategory(newDistanceOptions[0])) {
                            currentConfig.track.distance = newDistanceOptions[0]
                        } else {
                            currentConfig.track.distance = parseInt(
                                newDistanceOptions[0],
                                10,
                            )
                        }
                    } else if (newDistanceOptions.length === 0) {
                        currentConfig.track.distance = null
                    }
                }
            } else if (field.key === 'distance') {
                if (isDistanceCategory(value as string)) {
                    currentConfig.track.distance = value as string
                } else {
                    currentConfig.track.distance = parseInt(value as string, 10)
                }
            }

            // Re-render skills when settings that affect skill filtering change
            const skillFilterFields: (keyof Track)[] = [
                'trackName',
                'surface',
                'distance',
                'groundCondition',
                'weather',
                'season',
            ]
            if (skillFilterFields.includes(field.key)) {
                renderSkills()
            }

            // Clear simulation cache when track settings change (affects results)
            const simulationAffectingFields: (keyof Track)[] = [
                'courseId',
                'trackName',
                'surface',
                'distance',
                'groundCondition',
                'weather',
                'season',
                'numUmas',
            ]
            if (simulationAffectingFields.includes(field.key)) {
                calculatedResultsCache.clear()
            }

            autoSave()
        })
        wrapper.appendChild(input)

        trackLine.appendChild(wrapper)
    })

    container.appendChild(trackLine)
}

function renderUma(): void {
    if (!currentConfig) return
    const container = document.getElementById('uma-container')
    if (!container) return
    container.innerHTML = ''
    const uma = currentConfig.uma || {}

    const strategyOptions = [
        'Runaway',
        'Front Runner',
        'Pace Chaser',
        'Late Surger',
        'End Closer',
    ]
    const aptitudeOptions = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G']

    interface UmaField {
        key: keyof Uma
        label: string
        type: 'select' | 'number' | 'text'
        options?: string[]
        width: number
        min?: number
        max?: number
    }

    const fields: UmaField[] = [
        { key: 'speed', label: 'SPD', type: 'number', width: 65 },
        { key: 'stamina', label: 'STA', type: 'number', width: 65 },
        { key: 'power', label: 'PWR', type: 'number', width: 65 },
        { key: 'guts', label: 'GUT', type: 'number', width: 65 },
        { key: 'wisdom', label: 'WIT', type: 'number', width: 65 },
        {
            key: 'strategy',
            label: 'Strategy',
            type: 'select',
            options: strategyOptions,
            width: calculateDropdownWidth(strategyOptions),
        },
        {
            key: 'distanceAptitude',
            label: 'Distance',
            type: 'select',
            options: aptitudeOptions,
            width: 35,
        },
        {
            key: 'surfaceAptitude',
            label: 'Surface',
            type: 'select',
            options: aptitudeOptions,
            width: 35,
        },
        {
            key: 'styleAptitude',
            label: 'Style',
            type: 'select',
            options: aptitudeOptions,
            width: 35,
        },
        {
            key: 'mood',
            label: 'Mood',
            type: 'number',
            width: 45,
            min: -2,
            max: 2,
        },
        { key: 'unique', label: 'Unique', type: 'text', width: 280 },
        { key: 'skillPoints', label: 'SP', type: 'number', width: 65 },
    ]

    const createUmaField = (field: UmaField): HTMLElement => {
        const wrapper = document.createElement('span')
        wrapper.className = 'inline-flex items-center gap-1'

        const label = document.createElement('span')
        label.className = 'text-zinc-300 text-[13px] whitespace-nowrap'
        label.textContent = `${field.label}: `
        wrapper.appendChild(label)

        let input: HTMLInputElement | HTMLSelectElement
        if (field.type === 'select') {
            input = document.createElement('select')
            input.className =
                'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500'
            if (field.width) {
                input.style.width = `${field.width}px`
            }
            field.options?.forEach((opt) => {
                const option = document.createElement('option')
                option.value = opt
                option.textContent = opt
                if (uma[field.key] === opt) {
                    option.selected = true
                }
                input.appendChild(option)
            })
        } else {
            input = document.createElement('input')
            input.type = field.type
            input.className =
                'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500'
            const fieldValue = uma[field.key]
            input.value =
                fieldValue === null || fieldValue === undefined
                    ? ''
                    : String(fieldValue)
            if (field.width) {
                input.style.width = `${field.width}px`
            }
            if (field.min !== undefined) {
                input.min = String(field.min)
            }
            if (field.max !== undefined) {
                input.max = String(field.max)
            }
            // Highlight skillPoints in red when negative (over budget)
            if (
                field.key === 'skillPoints' &&
                typeof fieldValue === 'number' &&
                fieldValue < 0
            ) {
                input.classList.add('text-red-400', 'border-red-500')
            }
        }

        input.dataset.key = field.key
        input.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement | HTMLSelectElement
            let value: string | number | null
            if (field.type === 'number') {
                const parsed = parseInt(target.value, 10)
                value =
                    target.value === '' || Number.isNaN(parsed) ? null : parsed
            } else {
                value = target.value
            }
            if (!currentConfig) return
            if (!currentConfig.uma) {
                currentConfig.uma = {}
            }
            ;(currentConfig.uma as Record<string, unknown>)[field.key] = value

            // Re-render skills when strategy changes (affects running style filtering)
            if (field.key === 'strategy') {
                renderSkills()
            }

            // Clear simulation cache when uma settings that affect results change
            const simulationAffectingFields = [
                'speed',
                'stamina',
                'power',
                'guts',
                'wisdom',
                'strategy',
                'distanceAptitude',
                'surfaceAptitude',
                'styleAptitude',
                'mood',
            ]
            if (simulationAffectingFields.includes(field.key)) {
                calculatedResultsCache.clear()
            }

            autoSave()
        })
        wrapper.appendChild(input)

        return wrapper
    }

    // Skills section (first row)
    const skillsDiv = document.createElement('div')
    skillsDiv.className = 'flex flex-wrap items-center gap-1.5 mb-2'
    const skillsLabel = document.createElement('span')
    skillsLabel.className = 'text-zinc-300 text-[13px] whitespace-nowrap'
    skillsLabel.textContent = 'Skills:'
    skillsDiv.appendChild(skillsLabel)

    const skills = uma.skills || []

    function updateSkills(newSkills: string[]) {
        if (!currentConfig) return
        if (!currentConfig.uma) {
            currentConfig.uma = {}
        }
        currentConfig.uma.skills = newSkills
        renderUma()
        renderSkills()
        refreshResultsCosts()
        autoSave()
    }

    function createSkillPill(skill: string, index: number): HTMLElement {
        const pill = document.createElement('span')
        pill.className =
            'inline-flex items-center gap-1 px-2 py-1 bg-zinc-700 border border-zinc-600 text-zinc-200 rounded text-[13px] group hover:bg-zinc-600 transition-colors'

        const textSpan = document.createElement('span')
        textSpan.textContent = skill
        textSpan.className = 'cursor-text'
        textSpan.addEventListener('click', (e) => {
            e.stopPropagation()
            // Replace pill with edit input
            const editInput = document.createElement('input')
            editInput.type = 'text'
            editInput.value = skill
            editInput.className =
                'bg-zinc-800 text-zinc-200 text-[13px] px-1 py-1 rounded border border-sky-500 outline-none min-w-[100px]'
            editInput.style.width = `${Math.max(100, skill.length * 8)}px`

            const finishEdit = () => {
                const newValue = getCanonicalSkillName(editInput.value.trim())
                if (newValue && newValue !== skill) {
                    // Renaming skill - treat as remove old + add new

                    // Refund old skill cost
                    const oldCost = getSkillCostWithDiscount(skill)
                    if (
                        currentConfig?.uma?.skillPoints !== undefined &&
                        currentConfig?.uma?.skillPoints !== null
                    ) {
                        currentConfig.uma.skillPoints += oldCost
                    }

                    // Return old skill to results table
                    void returnSkillToResultsTable(skill)

                    // Handle old skill's variant restoration
                    const oldUpgradedVariant = getUpgradedVariant(skill)
                    if (!oldUpgradedVariant) {
                        restoreUpgradedSkillsForBasicSkill(skill)
                    }
                    const oldBasicVariant = getBasicVariant(skill)
                    if (oldBasicVariant) {
                        void returnSkillToResultsTable(oldBasicVariant)
                    }

                    // Check if new skill already on Uma
                    if (skills.includes(newValue)) {
                        // Just remove the old skill
                        const newSkills = skills.filter((_, i) => i !== index)
                        updateSkills(newSkills)
                        return
                    }

                    // Check if new skill's variant is already on Uma
                    const existingVariant = getGroupVariantOnUma(newValue)
                    if (existingVariant && existingVariant !== skill) {
                        // Another variant already exists, need to handle that
                        const existingCost =
                            getSkillCostWithDiscount(existingVariant)
                        if (
                            currentConfig?.uma?.skillPoints !== undefined &&
                            currentConfig?.uma?.skillPoints !== null
                        ) {
                            currentConfig.uma.skillPoints += existingCost
                        }
                        const existingVariantOrder =
                            getSkillOrder(existingVariant)
                        const newSkillOrder = getSkillOrder(newValue)
                        if (existingVariantOrder < newSkillOrder) {
                            void returnSkillToResultsTable(existingVariant)
                            restoreUpgradedSkillsForBasicSkill(newValue)
                        }
                        // Remove existing variant from skills array
                        const newSkills = skills.filter(
                            (s, i) => i !== index && s !== existingVariant,
                        )
                        newSkills.push(newValue)

                        // Deduct new skill cost
                        const newCost = getSkillCostWithDiscount(newValue)
                        if (
                            currentConfig?.uma?.skillPoints !== undefined &&
                            currentConfig?.uma?.skillPoints !== null
                        ) {
                            currentConfig.uma.skillPoints -= newCost
                        }

                        // Handle new skill's variant updates
                        const newBasicVariant = getBasicVariant(newValue)
                        if (!newBasicVariant) {
                            updateUpgradedSkillsForBasicSkill(newValue)
                        }
                        resultsMap.delete(newValue)
                        selectedSkills.delete(newValue)
                        if (newBasicVariant) {
                            resultsMap.delete(newBasicVariant)
                            selectedSkills.delete(newBasicVariant)
                        }

                        updateSkills(newSkills)
                    } else {
                        // No conflicting variant, just replace
                        const newSkills = [...skills]
                        newSkills[index] = newValue

                        // Deduct new skill cost
                        const newCost = getSkillCostWithDiscount(newValue)
                        if (
                            currentConfig?.uma?.skillPoints !== undefined &&
                            currentConfig?.uma?.skillPoints !== null
                        ) {
                            currentConfig.uma.skillPoints -= newCost
                        }

                        // Handle new skill's variant updates
                        const newBasicVariant = getBasicVariant(newValue)
                        if (!newBasicVariant) {
                            updateUpgradedSkillsForBasicSkill(newValue)
                        }
                        resultsMap.delete(newValue)
                        selectedSkills.delete(newValue)
                        if (newBasicVariant) {
                            resultsMap.delete(newBasicVariant)
                            selectedSkills.delete(newBasicVariant)
                        }

                        updateSkills(newSkills)
                    }
                } else if (!newValue) {
                    // Empty value removes the skill - refund cost
                    if (
                        currentConfig?.uma?.skillPoints !== undefined &&
                        currentConfig?.uma?.skillPoints !== null
                    ) {
                        const skillCost = getSkillCostWithDiscount(skill)
                        currentConfig.uma.skillPoints += skillCost
                    }
                    // Return skill to results table
                    void returnSkillToResultsTable(skill)

                    // Check if this was a basic skill - restore upgraded skill full stats
                    const upgradedVariant = getUpgradedVariant(skill)
                    if (upgradedVariant) {
                        restoreUpgradedSkillsForBasicSkill(skill)
                    }

                    // If this was an upgraded skill, also show basic skill in results
                    const basicVariant = getBasicVariant(skill)
                    if (basicVariant) {
                        void returnSkillToResultsTable(basicVariant)
                    }

                    const newSkills = skills.filter((_, i) => i !== index)
                    updateSkills(newSkills)
                } else {
                    renderUma()
                }
            }

            editInput.addEventListener('blur', finishEdit)
            editInput.addEventListener('keydown', (ke) => {
                if (ke.key === 'Enter') {
                    ke.preventDefault()
                    editInput.blur()
                } else if (ke.key === 'Escape') {
                    ke.preventDefault()
                    renderUma()
                }
            })

            pill.replaceWith(editInput)
            editInput.focus()
            editInput.select()
        })

        const removeBtn = document.createElement('button')
        removeBtn.type = 'button'
        removeBtn.className =
            'text-zinc-400 hover:text-zinc-100 transition-colors leading-none text-xs'
        removeBtn.innerHTML = '&times;'
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            // Refund skill cost
            if (
                currentConfig?.uma?.skillPoints !== undefined &&
                currentConfig?.uma?.skillPoints !== null
            ) {
                const skillCost = getSkillCostWithDiscount(skill)
                currentConfig.uma.skillPoints += skillCost
            }
            // Return skill to results table
            void returnSkillToResultsTable(skill)

            // Check if this was a basic skill - restore upgraded skill full stats
            const upgradedVariant = getUpgradedVariant(skill)
            if (upgradedVariant) {
                // This is a basic skill (has an upgraded variant), restore upgraded skills
                restoreUpgradedSkillsForBasicSkill(skill)
            }

            // If this was an upgraded skill, also show basic skill in results
            const basicVariant = getBasicVariant(skill)
            if (basicVariant) {
                void returnSkillToResultsTable(basicVariant)
            }

            const newSkills = skills.filter((_, i) => i !== index)
            updateSkills(newSkills)
        })

        pill.appendChild(textSpan)
        pill.appendChild(removeBtn)
        return pill
    }

    skills.forEach((skill, index) => {
        skillsDiv.appendChild(createSkillPill(skill, index))
    })

    // Add button (blue "+") to add new skills
    const addButton = document.createElement('button')
    addButton.type = 'button'
    addButton.className =
        'w-6 h-6 rounded text-lg leading-none cursor-pointer transition-colors bg-sky-600 text-white border-none hover:bg-sky-700 flex items-center justify-center p-0'
    addButton.textContent = '+'
    addButton.title = 'Add skill'
    addButton.addEventListener('click', () => {
        // Replace button with input
        const addInput = document.createElement('input')
        addInput.type = 'text'
        addInput.className =
            'bg-zinc-800 text-zinc-200 text-[13px] px-1 py-1 rounded border border-sky-500 outline-none min-w-[100px]'
        addInput.placeholder = 'Skill name...'

        const finishAdd = () => {
            const newSkill = getCanonicalSkillName(addInput.value.trim())
            if (newSkill) {
                // Check if already on Uma
                if (skills.includes(newSkill)) {
                    renderUma()
                    return
                }

                // Check if a variant from the same group is on Uma
                const existingVariant = getGroupVariantOnUma(newSkill)
                const existingVariantOrder = existingVariant
                    ? getSkillOrder(existingVariant)
                    : 0
                const newSkillOrder = getSkillOrder(newSkill)

                if (existingVariant) {
                    // Refund the existing variant's cost
                    const existingCost =
                        getSkillCostWithDiscount(existingVariant)
                    if (
                        currentConfig?.uma?.skillPoints !== undefined &&
                        currentConfig?.uma?.skillPoints !== null
                    ) {
                        currentConfig.uma.skillPoints += existingCost
                    }

                    // Handle stats restoration based on which variant is replaced
                    if (existingVariantOrder < newSkillOrder) {
                        // Existing is upgraded, new is basic - return upgraded to table
                        void returnSkillToResultsTable(existingVariant)
                        restoreUpgradedSkillsForBasicSkill(newSkill)
                    }

                    // Replace variant in skills array
                    const idx = skills.indexOf(existingVariant)
                    const newSkills = [...skills]
                    newSkills[idx] = newSkill

                    // Deduct new skill cost
                    const newSkillCost = getSkillCostWithDiscount(newSkill)
                    if (
                        currentConfig?.uma?.skillPoints !== undefined &&
                        currentConfig?.uma?.skillPoints !== null
                    ) {
                        currentConfig.uma.skillPoints -= newSkillCost
                    }

                    // Handle stats update for adding basic skill
                    const basicVariant = getBasicVariant(newSkill)
                    if (!basicVariant) {
                        updateUpgradedSkillsForBasicSkill(newSkill)
                    }

                    // Hide variants from results
                    resultsMap.delete(newSkill)
                    selectedSkills.delete(newSkill)
                    if (basicVariant) {
                        resultsMap.delete(basicVariant)
                        selectedSkills.delete(basicVariant)
                    }

                    updateSkills(newSkills)
                } else {
                    // No variant on Uma, just add the skill
                    const newSkillCost = getSkillCostWithDiscount(newSkill)
                    if (
                        currentConfig?.uma?.skillPoints !== undefined &&
                        currentConfig?.uma?.skillPoints !== null
                    ) {
                        currentConfig.uma.skillPoints -= newSkillCost
                    }

                    // Handle stats update for adding basic skill
                    const basicVariant = getBasicVariant(newSkill)
                    if (!basicVariant) {
                        updateUpgradedSkillsForBasicSkill(newSkill)
                    }

                    // Hide variants from results
                    resultsMap.delete(newSkill)
                    selectedSkills.delete(newSkill)
                    if (basicVariant) {
                        resultsMap.delete(basicVariant)
                        selectedSkills.delete(basicVariant)
                    }

                    updateSkills([...skills, newSkill])
                }
            } else {
                renderUma()
            }
        }

        addInput.addEventListener('blur', finishAdd)
        addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                addInput.blur()
            } else if (e.key === 'Escape') {
                e.preventDefault()
                renderUma()
            }
        })

        addButton.replaceWith(addInput)
        addInput.focus()
    })

    skillsDiv.appendChild(addButton)
    container.appendChild(skillsDiv)

    // Stats section (second row)
    const line = document.createElement('div')
    line.className = 'flex flex-wrap items-center gap-1 mb-2'
    fields.forEach((field) => {
        line.appendChild(createUmaField(field))
    })
    container.appendChild(line)
}

// Results table rendering
function renderResultsTable(): void {
    const tbody = document.getElementById('results-tbody')
    const countEl = document.getElementById('results-count')
    const lastRunEl = document.getElementById('results-last-run')
    if (!tbody) return

    tbody.innerHTML = ''

    // Filter out:
    // 1. Skills that are on Uma (exact match)
    // 2. Basic skills where Uma has the upgraded version
    const results = Array.from(resultsMap.values()).filter((result) => {
        // Don't show skills that are on Uma
        if (isSkillOnUma(result.skill)) return false
        // Don't show basic skills when Uma has the upgraded version
        if (umaHasUpgradedVersion(result.skill)) return false
        return true
    })

    // Clean up selectedSkills to remove any filtered-out skills
    for (const skill of selectedSkills) {
        if (isSkillOnUma(skill) || umaHasUpgradedVersion(skill)) {
            selectedSkills.delete(skill)
        }
    }

    if (results.length === 0) {
        if (countEl) countEl.textContent = 'No results yet'
        updateTotalsRow()
        return
    }

    // Sort results
    results.sort((a, b) => {
        const aVal = a[sortColumn]
        const bVal = b[sortColumn]
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortDirection === 'asc'
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal)
        }
        const aNum = Number(aVal)
        const bNum = Number(bVal)
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
    })

    for (const result of results) {
        const row = document.createElement('tr')
        row.className =
            'border-b border-zinc-700 hover:bg-zinc-700 ' +
            (result.status === 'pending' ? 'opacity-50' : '')
        row.dataset.skill = result.skill

        // Checkbox cell
        const checkCell = document.createElement('td')
        checkCell.className = 'p-1'
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.checked = selectedSkills.has(result.skill)
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedSkills.add(result.skill)
            } else {
                selectedSkills.delete(result.skill)
            }
            updateTotalsRow()
            updateSelectAllCheckbox()
        })
        checkCell.appendChild(checkbox)
        row.appendChild(checkCell)

        // Add to Uma button cell
        const addCell = document.createElement('td')
        addCell.className = 'p-1'
        const addBtn = document.createElement('button')
        addBtn.className =
            'bg-sky-600 text-white border-none rounded w-5 h-5 text-sm leading-none cursor-pointer flex items-center justify-center p-0 transition-colors hover:bg-sky-700 active:bg-sky-800'
        addBtn.textContent = '+'
        addBtn.title = 'Add to Uma skills'
        addBtn.addEventListener('click', () => {
            addSkillToUmaFromTable(result.skill, result.cost)
        })
        addCell.appendChild(addBtn)
        row.appendChild(addCell)

        // Skill name
        const skillCell = document.createElement('td')
        skillCell.className = 'p-1'
        skillCell.textContent = result.skill
        row.appendChild(skillCell)

        // Cost
        const costCell = document.createElement('td')
        costCell.className = 'p-1 text-right'
        costCell.textContent = result.cost.toString()
        row.appendChild(costCell)

        // Discount
        const discountCell = document.createElement('td')
        discountCell.className = 'p-1 text-right'
        discountCell.textContent =
            result.discount > 0 ? `${result.discount}%` : '-'
        row.appendChild(discountCell)

        // Sims
        const simsCell = document.createElement('td')
        simsCell.className = 'p-1 text-right'
        simsCell.textContent =
            result.status === 'pending'
                ? '...'
                : result.numSimulations.toString()
        row.appendChild(simsCell)

        // Mean
        const meanCell = document.createElement('td')
        meanCell.className = 'p-1 text-right'
        meanCell.textContent =
            result.status === 'pending' ? '...' : result.meanLength.toFixed(2)
        row.appendChild(meanCell)

        // Median
        const medianCell = document.createElement('td')
        medianCell.className = 'p-1 text-right'
        medianCell.textContent =
            result.status === 'pending' ? '...' : result.medianLength.toFixed(2)
        row.appendChild(medianCell)

        // Mean/Cost
        const effCell = document.createElement('td')
        effCell.className = 'p-1 text-right'
        effCell.textContent =
            result.status === 'pending'
                ? '...'
                : (result.meanLengthPerCost * 1000).toFixed(2)
        row.appendChild(effCell)

        // Min-Max
        const minMaxCell = document.createElement('td')
        minMaxCell.className = 'p-1 text-right'
        minMaxCell.textContent =
            result.status === 'pending'
                ? '...'
                : `${result.minLength.toFixed(2)}-${result.maxLength.toFixed(2)}`
        row.appendChild(minMaxCell)

        // CI
        const ciCell = document.createElement('td')
        ciCell.className = 'p-1 text-right'
        ciCell.textContent =
            result.status === 'pending'
                ? '...'
                : `${result.ciLower.toFixed(2)}-${result.ciUpper.toFixed(2)}`
        row.appendChild(ciCell)

        tbody.appendChild(row)
    }

    // Update count
    const completedCount = results.filter((r) => r.status !== 'pending').length
    if (countEl) {
        countEl.textContent = `Calculated ${completedCount}/${results.length} skills`
    }

    // Update last run time
    if (lastRunEl && lastCalculationTime) {
        lastRunEl.textContent = `Last run: ${lastCalculationTime.toLocaleTimeString()}`
    }

    updateTotalsRow()
}

function updateTotalsRow(): void {
    const totalsDiv = document.getElementById('results-totals')
    const costEl = document.getElementById('totals-cost')
    const meanEl = document.getElementById('totals-mean')
    const effEl = document.getElementById('totals-efficiency')
    const minmaxEl = document.getElementById('totals-minmax')
    if (!totalsDiv || !costEl || !meanEl || !effEl || !minmaxEl) return

    if (selectedSkills.size < 2) {
        totalsDiv.classList.add('hidden')
        return
    }

    totalsDiv.classList.remove('hidden')

    let totalCost = 0
    let totalMean = 0
    let totalMin = 0
    let totalMax = 0
    let validCount = 0

    for (const skillName of selectedSkills) {
        const result = resultsMap.get(skillName)
        if (result && result.status !== 'pending') {
            totalCost += result.cost
            totalMean += result.meanLength
            totalMin += result.minLength
            totalMax += result.maxLength
            validCount++
        }
    }

    if (validCount === 0) {
        totalsDiv.classList.add('hidden')
        return
    }

    const totalEfficiency = totalCost > 0 ? (totalMean / totalCost) * 1000 : 0

    costEl.textContent = `Cost: ${totalCost}`
    meanEl.textContent = `Mean: ${totalMean.toFixed(2)}`
    effEl.textContent = `Mean/Cost: ${totalEfficiency.toFixed(2)}`
    minmaxEl.textContent = `Min-Max: ${totalMin.toFixed(2)}-${totalMax.toFixed(2)}`
}

function updateSelectAllCheckbox(): void {
    const checkbox = document.getElementById(
        'select-all-checkbox',
    ) as HTMLInputElement | null
    if (!checkbox) return

    const allSkills = Array.from(resultsMap.keys())
    if (allSkills.length === 0) {
        checkbox.checked = false
        checkbox.indeterminate = false
        return
    }

    const selectedCount = allSkills.filter((s) => selectedSkills.has(s)).length
    checkbox.checked = selectedCount === allSkills.length
    checkbox.indeterminate =
        selectedCount > 0 && selectedCount < allSkills.length
}

function addSkillToUmaFromTable(skillName: string, cost: number): void {
    if (!currentConfig) return
    if (!currentConfig.uma) {
        currentConfig.uma = {}
    }
    if (!currentConfig.uma.skills) {
        currentConfig.uma.skills = []
    }

    // Check if skill is already on Uma
    if (currentConfig.uma.skills.includes(skillName)) return

    // Check if a variant from the same group is already on Uma
    const existingVariant = getGroupVariantOnUma(skillName)
    const existingVariantOrder = existingVariant
        ? getSkillOrder(existingVariant)
        : 0
    const newSkillOrder = getSkillOrder(skillName)

    if (existingVariant) {
        // Refund the existing variant's cost
        const existingCost = getSkillCostWithDiscount(existingVariant)
        if (
            currentConfig.uma.skillPoints !== undefined &&
            currentConfig.uma.skillPoints !== null
        ) {
            currentConfig.uma.skillPoints += existingCost
        }

        // If existing was basic (higher order) and we're adding upgraded (lower order)
        // The basic stays hidden, no need to return to table
        // If existing was upgraded and we're adding basic, return upgraded to table
        if (existingVariantOrder < newSkillOrder) {
            // Existing is upgraded, new is basic - return upgraded to table with full stats
            void returnSkillToResultsTable(existingVariant)
        }

        // Replace the existing variant with the new skill
        const idx = currentConfig.uma.skills.indexOf(existingVariant)
        if (idx !== -1) {
            currentConfig.uma.skills[idx] = skillName
        }
    } else {
        // No variant on Uma, just add the skill
        currentConfig.uma.skills.push(skillName)
    }

    // Deduct from skill points
    if (
        currentConfig.uma.skillPoints !== undefined &&
        currentConfig.uma.skillPoints !== null
    ) {
        currentConfig.uma.skillPoints -= cost
    }

    // Update upgraded skill stats if adding basic skill (show incremental)
    const basicVariant = getBasicVariant(skillName)
    if (!basicVariant) {
        // This is a basic skill (or has no variants), update upgraded skills
        updateUpgradedSkillsForBasicSkill(skillName)
    }

    // Remove from results table
    resultsMap.delete(skillName)
    selectedSkills.delete(skillName)

    // If adding upgraded skill, also hide basic from results
    if (basicVariant) {
        resultsMap.delete(basicVariant)
        selectedSkills.delete(basicVariant)
    }

    // Re-render
    refreshResultsCosts()
    renderUma()
    renderSkills()
    autoSave()
}

function removeSkillFromUma(skillName: string): void {
    if (!currentConfig?.uma?.skills) return

    const skillIndex = currentConfig.uma.skills.indexOf(skillName)
    if (skillIndex === -1) return

    // Refund skill cost
    const skillCost = getSkillCostWithDiscount(skillName)
    currentConfig.uma.skills.splice(skillIndex, 1)
    if (
        currentConfig.uma.skillPoints !== undefined &&
        currentConfig.uma.skillPoints !== null
    ) {
        currentConfig.uma.skillPoints += skillCost
    }

    // Return skill to results table (if it has a discount)
    void returnSkillToResultsTable(skillName)

    // Check if this was a basic skill - if so, restore upgraded skill full stats
    const upgradedVariant = getUpgradedVariant(skillName)
    if (upgradedVariant) {
        // This is a basic skill (has an upgraded variant), restore upgraded skills
        restoreUpgradedSkillsForBasicSkill(skillName)
    }

    // If this was an upgraded skill, also show basic skill in results again
    const basicVariant = getBasicVariant(skillName)
    if (basicVariant) {
        void returnSkillToResultsTable(basicVariant)
    }

    // Refresh costs since Uma skills changed
    refreshResultsCosts()
    renderResultsTable()
    renderUma()
    renderSkills()
    autoSave()
}

async function saveConfig(): Promise<void> {
    if (!currentConfigFile || !currentConfig) return

    try {
        await fetch(`/api/config/${currentConfigFile}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentConfig),
        })
    } catch {
        showToast({ type: 'error', message: 'Failed to save config' })
    }
}

function autoSave(): void {
    if (saveTimeout) {
        clearTimeout(saveTimeout)
    }
    saveTimeout = setTimeout(() => {
        pendingSavePromise = saveConfig()
    }, 500)
}

async function runCalculations(clearExisting = true): Promise<void> {
    if (!currentConfigFile) return
    const button = document.getElementById('run-button') as HTMLButtonElement
    const countEl = document.getElementById('results-count')
    if (!button) return
    button.disabled = true

    if (clearExisting) {
        // Clear previous results and cache, show calculating state
        resultsMap.clear()
        selectedSkills.clear()
        calculatedResultsCache.clear()
    }
    if (countEl) countEl.textContent = 'Running calculations...'
    renderResultsTable()

    if (saveTimeout) {
        clearTimeout(saveTimeout)
    }
    if (pendingSavePromise) {
        await pendingSavePromise
    }
    await saveConfig()

    try {
        const response = await fetch(
            `/api/simulate?configFile=${encodeURIComponent(currentConfigFile)}`,
            {
                method: 'GET',
            },
        )

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        if (!response.body) {
            throw new Error('Response body is null')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
            let result: ReadableStreamReadResult<Uint8Array>
            try {
                result = await reader.read()
            } catch (readError) {
                const err = readError as Error
                console.error('Error reading stream:', readError)
                button.disabled = false
                showToast({
                    type: 'error',
                    message: `Error reading stream: ${err.message}`,
                })
                break
            }

            const { done, value } = result
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6)) as {
                            type: string
                            phase?: string
                            result?: SkillResult
                            results?: SkillResult[]
                            error?: string
                            info?: string
                        }
                        if (data.type === 'started') {
                            // Calculation started
                        } else if (data.type === 'phase') {
                            // Phase update - could show in UI if desired
                            if (countEl && data.phase) {
                                countEl.textContent = data.phase
                            }
                        } else if (data.type === 'info') {
                            // Info message
                            if (data.info) {
                                showToast({ type: 'info', message: data.info })
                            }
                        } else if (data.type === 'result' && data.result) {
                            // Individual skill result - add to map
                            calculatedResultsCache.set(
                                data.result.skill,
                                data.result,
                            )
                            resultsMap.set(data.result.skill, {
                                ...data.result,
                                status: 'fresh',
                            })
                            renderResultsTable()
                        } else if (data.type === 'complete') {
                            button.disabled = false
                            lastCalculationTime = new Date()

                            // Update with final sorted results
                            if (data.results) {
                                for (const result of data.results) {
                                    calculatedResultsCache.set(
                                        result.skill,
                                        result,
                                    )
                                    resultsMap.set(result.skill, {
                                        ...result,
                                        status: 'fresh',
                                    })
                                }
                            }

                            renderResultsTable()
                        } else if (data.type === 'error') {
                            button.disabled = false
                            showToast({
                                type: 'error',
                                message: data.error || 'Simulation error',
                            })
                        }
                    } catch {
                        // Ignore keepalive messages, log unexpected parse errors
                        if (!line.includes('keepalive')) {
                            console.warn('SSE parse error:', line)
                        }
                    }
                }
            }
        }
    } catch (error) {
        const err = error as Error
        button.disabled = false
        showToast({ type: 'error', message: `Error: ${err.message}` })
    }
}

function resetUmaSkills(): void {
    if (!currentConfig) return
    if (!currentConfig.uma) {
        currentConfig.uma = {}
    }
    currentConfig.uma.skills = []

    if (currentConfig.skills) {
        const skills = currentConfig.skills
        Object.keys(skills).forEach((skillName) => {
            const skill = skills[skillName]
            if (skill.default !== undefined && skill.default !== null) {
                skills[skillName].discount = skill.default
            } else {
                skills[skillName].discount = null
            }
        })
    }

    // Clear results and cache since all discounts changed
    resultsMap.clear()
    selectedSkills.clear()
    calculatedResultsCache.clear()
    renderResultsTable()

    renderUma()
    renderSkills()
    autoSave()
}

const configSelect = document.getElementById(
    'config-select',
) as HTMLSelectElement
if (configSelect) {
    configSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement
        loadConfig(target.value)
    })
}

const duplicateButton = document.getElementById('duplicate-config-button')
if (duplicateButton) {
    duplicateButton.addEventListener('click', async () => {
        if (!currentConfigFile) {
            alert('No config file selected')
            return
        }

        const newName = prompt('Enter name for duplicated config file:')
        if (!newName || !newName.trim()) {
            return
        }

        let trimmedName = newName.trim()
        if (!trimmedName.toLowerCase().endsWith('.json')) {
            trimmedName += '.json'
        }

        try {
            const response = await fetch(
                `/api/config/${encodeURIComponent(currentConfigFile)}/duplicate`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ newName: trimmedName }),
                },
            )

            if (!response.ok) {
                let errorMessage = 'Failed to duplicate config file'
                try {
                    const error = (await response.json()) as { error?: string }
                    errorMessage = error.error || errorMessage
                } catch {
                    const text = await response.text()
                    errorMessage = text || errorMessage
                }
                alert(`Error: ${errorMessage}`)
                return
            }

            await loadConfigFiles()
            await loadConfig(trimmedName)
        } catch (error) {
            const err = error as Error
            alert(`Error: ${err.message}`)
        }
    })
}

const runButton = document.getElementById('run-button')
if (runButton) {
    runButton.addEventListener('click', () => runCalculations())
}

const resetButton = document.getElementById('reset-button')
if (resetButton) {
    resetButton.addEventListener('click', resetUmaSkills)
}

const addSkillButton = document.getElementById('add-skill-button')
if (addSkillButton) {
    addSkillButton.addEventListener('click', () => {
        if (!currentConfig) return
        if (!currentConfig.skills) {
            currentConfig.skills = {}
        }
        const newSkillName = 'New Skill'
        let counter = 1
        let finalName = newSkillName
        while (currentConfig.skills[finalName]) {
            finalName = `${newSkillName} ${counter}`
            counter++
        }
        currentConfig.skills[finalName] = {
            discount: 0,
        }
        renderSkills()

        setTimeout(() => {
            const skillItem = document.querySelector(
                `[data-skill="${finalName}"]`,
            )
            if (skillItem) {
                const editButton = skillItem.querySelector('.edit-skill-button')
                if (editButton) {
                    ;(editButton as HTMLElement).click()
                }
            }
        }, 100)

        autoSave()
    })
}

// Set up event delegation for discount buttons (single listener instead of per-button)
function setupSkillsContainerDelegation(): void {
    const container = document.getElementById('skills-container')
    if (!container) return

    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        // Only handle discount button clicks
        if (target.dataset.discount === undefined) return

        const skillName = target.dataset.skill
        const discountValue = target.dataset.discount
        if (!skillName || !discountValue || !currentConfig) return
        const discount =
            discountValue === '-' ? null : parseInt(discountValue, 10)
        if (!currentConfig.skills[skillName]) {
            currentConfig.skills[skillName] = { discount: null }
        }

        const currentDiscount = currentConfig.skills[skillName].discount
        const isCurrentlyActive =
            (discount === null &&
                (currentDiscount === null || currentDiscount === undefined)) ||
            (discount !== null && currentDiscount === discount)

        if (isCurrentlyActive) {
            const skillDefault = currentConfig.skills[skillName]?.default
            const isCurrentlyDefault =
                (skillDefault !== undefined &&
                    skillDefault !== null &&
                    currentDiscount === skillDefault) ||
                ((skillDefault === undefined || skillDefault === null) &&
                    (currentDiscount === null || currentDiscount === undefined))

            if (isCurrentlyDefault) {
                updateSkillVariantsDefault(skillName, 'remove')
            } else if (
                currentDiscount === null ||
                currentDiscount === undefined
            ) {
                updateSkillVariantsDefault(skillName, 'remove')
            } else {
                updateSkillVariantsDefault(skillName, 'set', currentDiscount)
            }
        } else {
            currentConfig.skills[skillName].discount =
                discount === null ? null : discount

            const baseName = getBaseSkillName(skillName)
            const variants = getVariantsForBaseName(baseName)
            if (variants.length === 2) {
                if (currentConfig.skills[baseName]) {
                    currentConfig.skills[baseName].discount = discount
                }
                variants.forEach((variantName) => {
                    if (currentConfig.skills[variantName]) {
                        currentConfig.skills[variantName].discount = discount
                    }
                })
            } else {
                const otherVariant = getOtherVariant(skillName)
                if (otherVariant) {
                    const variantsToUpdate = Array.isArray(otherVariant)
                        ? otherVariant
                        : [otherVariant]
                    variantsToUpdate.forEach((variantName) => {
                        if (currentConfig.skills[variantName]) {
                            currentConfig.skills[variantName].discount =
                                discount
                        }
                    })
                    if (
                        currentConfig.skills[baseName] &&
                        !skillName.endsWith(' ○') &&
                        !skillName.endsWith(' ◎')
                    ) {
                        currentConfig.skills[baseName].discount = discount
                    }
                }
            }

            // Update results table based on discount change
            updateResultsForDiscountChange(skillName, currentDiscount, discount)
        }

        renderSkills()
        autoSave()
    })
}

// Update results table when discount changes
function updateResultsForDiscountChange(
    skillName: string,
    oldDiscount: number | null | undefined,
    newDiscount: number | null,
): void {
    const hadDiscount = oldDiscount !== null && oldDiscount !== undefined
    const hasDiscount = newDiscount !== null

    if (hadDiscount && !hasDiscount) {
        // discount -> None: remove skill from table
        resultsMap.delete(skillName)
        selectedSkills.delete(skillName)
        renderResultsTable()
    } else if (!hadDiscount && hasDiscount) {
        // None -> discount: add skill as pending (needs calculation)
        addPendingSkillToResults(skillName, newDiscount)
    } else if (hadDiscount && hasDiscount && oldDiscount !== newDiscount) {
        // discount -> discount: update cost and mean/cost
        const existing = resultsMap.get(skillName)
        if (existing && existing.status !== 'pending') {
            const newCost = getSkillCostWithDiscount(skillName)
            existing.cost = newCost
            existing.discount = newDiscount
            existing.meanLengthPerCost =
                newCost > 0 ? existing.meanLength / newCost : 0
            renderResultsTable()
        }
    }
}

/**
 * Recalculate all costs in resultsMap when Uma's skills change.
 * This is needed because prerequisite costs depend on what skills Uma has.
 */
function refreshResultsCosts(): void {
    for (const [skillName, result] of resultsMap) {
        if (result.status !== 'pending') {
            const newCost = getSkillCostWithDiscount(skillName)
            result.cost = newCost
            result.meanLengthPerCost =
                newCost > 0 ? result.meanLength / newCost : 0
        }
    }
    renderResultsTable()
}

/**
 * When a basic skill is added/removed from Uma, mark upgraded skills for recalculation.
 * The frontend cache is keyed only by skill name (not Uma state), so we must invalidate it.
 * The server-side cache IS keyed by config hash (including Uma skills) and will return
 * fresh results for the new Uma state.
 */
function recalculateUpgradedSkillsForBasicChange(basicSkillName: string): void {
    if (!skillmeta || !skillnames || !currentConfig?.skills) return

    const basicSkillId = findSkillId(basicSkillName)
    if (!basicSkillId) return

    const basicMeta = skillmeta[basicSkillId]
    if (!basicMeta?.groupId) return

    const basicGroupId = basicMeta.groupId
    const basicOrder = basicMeta.order ?? 0

    // Find upgraded skills (lower order = upgraded) in the same group
    for (const [upgradedSkillId, upgradedMeta] of Object.entries(skillmeta)) {
        if (
            upgradedMeta.groupId === basicGroupId &&
            (upgradedMeta.order ?? 0) < basicOrder
        ) {
            const upgradedSkillNames = skillnames[upgradedSkillId]
            if (!upgradedSkillNames) continue

            const upgradedSkillName = upgradedSkillNames[0]

            // Only recalculate if the skill has a discount (is in the skill list)
            const skillConfig = currentConfig.skills[upgradedSkillName]
            if (
                !skillConfig ||
                skillConfig.discount === null ||
                skillConfig.discount === undefined
            ) {
                continue
            }

            // Invalidate frontend cache (keyed only by skill name, not Uma state)
            calculatedResultsCache.delete(upgradedSkillName)

            // Mark as pending for recalculation - server will return fresh results
            if (resultsMap.has(upgradedSkillName)) {
                addPendingSkillToResults(
                    upgradedSkillName,
                    skillConfig.discount,
                )
            }
        }
    }
}

// Aliases for clarity at call sites
// Semantic aliases for the same operation: both add and remove of a basic skill
// require recalculating upgraded variants. When basic skill is added, upgraded skills
// show incremental benefit; when removed, they show full standalone benefit.
// The recalculation logic is identical - mark upgraded skills as pending for re-simulation.
const updateUpgradedSkillsForBasicSkill =
    recalculateUpgradedSkillsForBasicChange
const restoreUpgradedSkillsForBasicSkill =
    recalculateUpgradedSkillsForBasicChange

/**
 * Add a skill back to the results table when removed from Uma.
 * Checks frontend cache first, then server cache; otherwise adds as pending.
 * Only adds if the skill has a discount set.
 */
async function returnSkillToResultsTable(skillName: string): Promise<void> {
    if (!currentConfig?.skills) return

    const skillConfig = currentConfig.skills[skillName]
    if (
        !skillConfig ||
        skillConfig.discount === null ||
        skillConfig.discount === undefined
    ) {
        return
    }

    // Check frontend cache first (most likely to have recent results)
    const cachedResult = calculatedResultsCache.get(skillName)
    if (cachedResult) {
        // Recalculate cost with current discount and prerequisites
        const cost = getSkillCostWithDiscount(skillName)
        resultsMap.set(skillName, {
            ...cachedResult,
            skill: skillName,
            cost,
            discount: skillConfig.discount,
            meanLengthPerCost: cost > 0 ? cachedResult.meanLength / cost : 0,
            status: 'cached',
        })
        renderResultsTable()
        return
    }

    // Not in frontend cache, add as pending (will trigger auto-calculation)
    addPendingSkillToResults(skillName, skillConfig.discount)
}

function addPendingSkillToResults(skillName: string, discount: number): void {
    const cost = getSkillCostWithDiscount(skillName)
    resultsMap.set(skillName, {
        skill: skillName,
        cost,
        discount,
        numSimulations: 0,
        meanLength: 0,
        medianLength: 0,
        meanLengthPerCost: 0,
        minLength: 0,
        maxLength: 0,
        ciLower: 0,
        ciUpper: 0,
        status: 'pending',
    })
    renderResultsTable()
    // Schedule auto-calculation for pending skills
    scheduleAutoCalculation()
}

// Debounced auto-calculation for pending skills
let autoCalculationTimeout: ReturnType<typeof setTimeout> | null = null
let autoCalculationInProgress = false

function scheduleAutoCalculation(): void {
    if (autoCalculationTimeout) {
        clearTimeout(autoCalculationTimeout)
    }
    autoCalculationTimeout = setTimeout(() => {
        autoCalculationTimeout = null
        void calculatePendingSkills()
    }, 300)
}

async function calculatePendingSkills(): Promise<void> {
    // Prevent overlapping calculations
    if (autoCalculationInProgress) return
    autoCalculationInProgress = true

    try {
        // Check if there are any pending skills
        const pendingSkills = Array.from(resultsMap.values()).filter(
            (r) => r.status === 'pending',
        )
        if (pendingSkills.length === 0) return

        // For each pending skill, check frontend cache first
        for (const pending of pendingSkills) {
            const cachedResult = calculatedResultsCache.get(pending.skill)
            if (cachedResult) {
                const cost = getSkillCostWithDiscount(pending.skill)
                resultsMap.set(pending.skill, {
                    ...cachedResult,
                    skill: pending.skill,
                    cost,
                    discount: pending.discount,
                    meanLengthPerCost:
                        cost > 0 ? cachedResult.meanLength / cost : 0,
                    status: 'cached',
                })
            }
        }

        renderResultsTable()

        // If still have pending skills after cache check, they need full calculation
        const stillPending = Array.from(resultsMap.values()).filter(
            (r) => r.status === 'pending',
        )
        if (stillPending.length > 0) {
            // Run selective calculation for only the pending skills
            const pendingSkillNames = stillPending.map((r) => r.skill)
            await runSelectiveCalculations(pendingSkillNames)
        }
    } finally {
        autoCalculationInProgress = false
        // Check if more skills became pending while we were calculating
        const newPending = Array.from(resultsMap.values()).filter(
            (r) => r.status === 'pending',
        )
        if (newPending.length > 0) {
            scheduleAutoCalculation()
        }
    }
}

/**
 * Run calculations for specific skills only.
 * More efficient than runCalculations(false) when only a few skills need updating.
 */
async function runSelectiveCalculations(skillNames: string[]): Promise<void> {
    if (!currentConfigFile || skillNames.length === 0) return

    // Save config first (Uma state may have changed)
    if (saveTimeout) {
        clearTimeout(saveTimeout)
    }
    if (pendingSavePromise) {
        await pendingSavePromise
    }
    await saveConfig()

    try {
        const skillsParam = encodeURIComponent(skillNames.join(','))
        const response = await fetch(
            `/api/simulate?configFile=${encodeURIComponent(currentConfigFile)}&skills=${skillsParam}`,
            { method: 'GET' },
        )

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        if (!response.body) {
            throw new Error('Response body is null')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
            let result: ReadableStreamReadResult<Uint8Array>
            try {
                result = await reader.read()
            } catch (readError) {
                const err = readError as Error
                console.error('Error reading stream:', readError)
                showToast({
                    type: 'error',
                    message: `Error reading stream: ${err.message}`,
                })
                break
            }

            if (result.done) break

            const chunk = decoder.decode(result.value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6))
                        if (data.type === 'result' && data.result) {
                            calculatedResultsCache.set(
                                data.result.skill,
                                data.result,
                            )
                            resultsMap.set(data.result.skill, {
                                ...data.result,
                                status: 'fresh',
                            })
                            renderResultsTable()
                        } else if (data.type === 'batch' && data.results) {
                            for (const result of data.results) {
                                calculatedResultsCache.set(result.skill, result)
                                resultsMap.set(result.skill, {
                                    ...result,
                                    status: 'fresh',
                                })
                            }
                            renderResultsTable()
                        } else if (data.type === 'error') {
                            console.error(
                                'Selective calculation error:',
                                data.error,
                            )
                            // Mark skills as error state
                            for (const skillName of skillNames) {
                                const existing = resultsMap.get(skillName)
                                if (existing?.status === 'pending') {
                                    resultsMap.set(skillName, {
                                        ...existing,
                                        status: 'error',
                                        errorMessage: data.error,
                                    } as SkillResultWithStatus)
                                }
                            }
                            renderResultsTable()
                        }
                    } catch {
                        // Ignore keepalive messages, log unexpected parse errors
                        if (!line.includes('keepalive')) {
                            console.warn('SSE parse error:', line)
                        }
                    }
                }
            }
        }
    } catch (error) {
        const err = error as Error
        console.error('Selective calculation error:', err)
        showToast({
            type: 'error',
            message: `Calculation failed: ${err.message}`,
        })
    }
}

setupSkillsContainerDelegation()

// Set up results table sorting
function setupResultsTableSorting(): void {
    const table = document.getElementById('results-table')
    if (!table) return

    table.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        const sortKey = target.dataset.sort as keyof SkillResult | undefined
        if (!sortKey) return

        if (sortColumn === sortKey) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'
        } else {
            sortColumn = sortKey
            sortDirection = sortKey === 'skill' ? 'asc' : 'desc'
        }
        renderResultsTable()
    })
}

// Set up select-all checkbox
function setupSelectAllCheckbox(): void {
    const checkbox = document.getElementById(
        'select-all-checkbox',
    ) as HTMLInputElement | null
    if (!checkbox) return

    checkbox.addEventListener('change', () => {
        const allSkills = Array.from(resultsMap.keys())
        if (checkbox.checked) {
            for (const s of allSkills) selectedSkills.add(s)
        } else {
            selectedSkills.clear()
        }
        renderResultsTable()
    })
}

setupResultsTableSorting()
setupSelectAllCheckbox()
loadConfigFiles()
