import {
    CONDITION_MAP,
    FIELD_MAX_VALUES,
    SEASON_MAP,
    STRATEGY_TO_RUNNING_STYLE,
    TRACK_NAME_TO_ID,
    WEATHER_MAP,
} from './constants'
import {
    getCourseData,
    getCurrentConfig,
    getSkillData,
    getSkillNameToId,
} from './state'
import type {
    CurrentSettings,
    SkillDataEntry,
    SkillRestrictions,
    StaticField,
} from './types'
import { STATIC_FIELDS } from './types'

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

export function parseConditionTerm(
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

export function parseAndBranch(branch: string): SkillRestrictions {
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
            case 'rotation':
                restrictions.rotations = parsed.values
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

export function mergeRestrictions(
    a: SkillRestrictions,
    b: SkillRestrictions,
): SkillRestrictions {
    const merged: SkillRestrictions = {}
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
            merged[field] = [...new Set([...aVals, ...bVals])]
        }
    }

    return merged
}

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

export function extractStaticRestrictions(
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

export function extractSkillRestrictions(
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

export function getDistanceType(distanceMeters: number): number {
    if (distanceMeters <= 1400) return 1
    if (distanceMeters <= 1800) return 2
    if (distanceMeters <= 2400) return 3
    return 4
}

export function isRandomValue(value: string | undefined | null): boolean {
    if (!value) return false
    return value.trim().toLowerCase() === '<random>'
}

export function isDistanceCategory(
    distance: string | number | null | undefined,
): boolean {
    if (!distance) return false
    const normalized = distance.toString().toLowerCase().trim()
    return ['<sprint>', '<mile>', '<medium>', '<long>'].includes(normalized)
}

export function parseDistanceCategory(
    distance: string | number | undefined,
): number | null {
    if (typeof distance === 'number' || !distance) return null
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

export function getCurrentSettings(): CurrentSettings {
    const currentConfig = getCurrentConfig()
    const courseData = getCourseData()

    if (!currentConfig) {
        return {
            distanceType: null,
            groundCondition: null,
            groundType: null,
            isBasisDistance: null,
            rotation: null,
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
    let parsedDistance: number | null = null
    if (track?.distance) {
        if (typeof track.distance === 'number') {
            parsedDistance = track.distance
            distanceType = getDistanceType(track.distance)
            isBasisDistance = track.distance % 400 === 0
        } else if (
            typeof track.distance === 'string' &&
            isDistanceCategory(track.distance)
        ) {
            distanceType = parseDistanceCategory(track.distance)
        } else if (
            typeof track.distance === 'string' &&
            !isRandomValue(track.distance)
        ) {
            const parsed = parseInt(track.distance, 10)
            if (!Number.isNaN(parsed)) {
                parsedDistance = parsed
                distanceType = getDistanceType(parsed)
                isBasisDistance = parsed % 400 === 0
            }
        }
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

    // Rotation (track orientation) - requires looking up the course
    let rotation: number | null = null
    if (
        courseData &&
        trackId !== null &&
        parsedDistance !== null &&
        groundType !== null
    ) {
        // Find the matching course by trackId, distance, and surface
        for (const [, rawCourse] of Object.entries(courseData)) {
            if (!rawCourse || typeof rawCourse !== 'object') continue
            const courseTrackId = rawCourse.raceTrackId
            if (courseTrackId == null) continue
            if (
                Number(courseTrackId) === trackId &&
                rawCourse.distance === parsedDistance &&
                rawCourse.surface === groundType
            ) {
                rotation = rawCourse.turn ?? null
                break
            }
        }
    }

    return {
        distanceType,
        groundCondition,
        groundType,
        isBasisDistance,
        rotation,
        runningStyle,
        season,
        trackId,
        weather,
    }
}

export function canSkillTriggerByName(skillName: string): boolean {
    const skillData = getSkillData()
    const skillNameToId = getSkillNameToId()

    if (!skillData || !skillNameToId) return true // If data not loaded, don't filter

    const skillId = skillNameToId[skillName]
    if (!skillId) return true // Unknown skill, don't filter

    const entry = skillData[skillId]
    if (!entry) return true // No data for skill, don't filter

    const restrictions = extractSkillRestrictions(entry)
    const settings = getCurrentSettings()

    return canSkillTrigger(restrictions, settings)
}
