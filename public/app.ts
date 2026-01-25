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
}

interface Config {
    skills: Record<string, Skill>
    track?: Track
    uma?: Uma
}

type SkillNames = Record<string, string[]>
type SkillMeta = Record<string, { groupId?: string }>
type CourseData = Record<
    string,
    {
        surface?: number
        distance?: number
        raceTrackId?: number | string
        turn?: number
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

function isSkillCompatibleWithOrientation(
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
            orientation: null,
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

    // Orientation (track handedness)
    let orientation: number | null = null
    if (track?.courseId && courseData) {
        const course = courseData[track.courseId]
        if (course?.turn !== undefined) {
            orientation = course.turn
        }
    }

    return {
        distanceType,
        groundCondition,
        groundType,
        isBasisDistance,
        orientation,
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

    // Check handedness compatibility first
    if (!isSkillCompatibleWithOrientation(skillName, settings.orientation)) {
        return false
    }

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
                const skillIndex = currentConfig.uma.skills.indexOf(skillName)
                if (skillIndex !== -1) {
                    currentConfig.uma.skills.splice(skillIndex, 1)
                }
            } else {
                const newSkillGroupId = getSkillGroupId(skillName)
                let replaced = false

                if (newSkillGroupId) {
                    for (let i = 0; i < currentConfig.uma.skills.length; i++) {
                        const existingSkill = currentConfig.uma.skills[i]
                        const existingGroupId = getSkillGroupId(existingSkill)
                        if (existingGroupId === newSkillGroupId) {
                            currentConfig.uma.skills[i] = skillName
                            replaced = true
                            break
                        }
                    }
                }

                if (
                    !replaced &&
                    !currentConfig.uma.skills.includes(skillName)
                ) {
                    currentConfig.uma.skills.push(skillName)
                }
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
                    const newSkills = [...skills]
                    newSkills[index] = newValue
                    updateSkills(newSkills)
                } else if (!newValue) {
                    // Empty value removes the skill
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
                updateSkills([...skills, newSkill])
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

async function runCalculations(): Promise<void> {
    if (!currentConfigFile) return
    const button = document.getElementById('run-button') as HTMLButtonElement
    const output = document.getElementById('terminal-output') as HTMLPreElement
    if (!button || !output) return
    button.disabled = true
    output.textContent = 'Running calculations...\n'

    if (saveTimeout) {
        clearTimeout(saveTimeout)
    }
    if (pendingSavePromise) {
        await pendingSavePromise
    }
    await saveConfig()

    try {
        const response = await fetch(
            `/api/run?configFile=${encodeURIComponent(currentConfigFile)}`,
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
                output.textContent += `\n\nError reading stream: ${err.message}`
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
                            data?: string
                            code?: number | null
                            signal?: string
                            output?: string
                            error?: string
                        }
                        if (data.type === 'started') {
                        } else if (data.type === 'output') {
                            output.textContent += data.data || ''
                            output.scrollTop = output.scrollHeight
                        } else if (data.type === 'warning') {
                            // Show warnings prominently via toast
                            const warningText = (data.data || '').trim()
                            if (warningText) {
                                // Extract meaningful warning message
                                const lines = warningText
                                    .split('\n')
                                    .filter((l) => l.trim())
                                for (const line of lines) {
                                    showToast({
                                        type: 'warning',
                                        message: line.trim(),
                                    })
                                }
                            }
                        } else if (data.type === 'done') {
                            button.disabled = false
                            if (
                                data.code !== null &&
                                data.code !== undefined &&
                                data.code !== 0
                            ) {
                                output.textContent += `\n\nProcess exited with code ${data.code}`
                            } else if (data.code === null) {
                                if (data.signal) {
                                    output.textContent += `\n\nProcess terminated by signal: ${data.signal}`
                                } else if (
                                    !data.output ||
                                    data.output.trim().length === 0
                                ) {
                                    output.textContent += `\n\nProcess exited without output. Make sure cli.js is built (run 'npm run build') and all dependencies are available.`
                                }
                            }
                        } else if (data.type === 'error') {
                            button.disabled = false
                            output.textContent += `\n\nError: ${data.error || 'Unknown error'}`
                            showToast({
                                type: 'error',
                                message: data.error || 'Simulation error',
                            })
                        }
                    } catch {
                        // Ignore SSE parse errors (typically incomplete chunks)
                    }
                }
            }
        }
    } catch (error) {
        const err = error as Error
        button.disabled = false
        output.textContent += `\n\nError: ${err.message}`
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
    runButton.addEventListener('click', runCalculations)
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
        }

        renderSkills()
        autoSave()
    })
}

setupSkillsContainerDelegation()
loadConfigFiles()
