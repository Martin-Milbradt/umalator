import {
    canSkillTrigger,
    extractSkillRestrictions,
    getDistanceType,
    isRandomValue,
    parseDistanceCategory,
    STRATEGY_TO_RUNNING_STYLE,
    TRACK_NAME_TO_ID,
} from '../utils'
import { CONDITION_MAP, SEASON_MAP, WEATHER_MAP } from './constants'
import {
    getCourseData,
    getCurrentConfig,
    getSkillData,
    getSkillNameToId,
} from './state'
import type { CurrentSettings } from './types'

export function isDistanceCategory(
    distance: string | number | null | undefined,
): boolean {
    if (!distance) return false
    const normalized = distance.toString().toLowerCase().trim()
    return ['<sprint>', '<mile>', '<medium>', '<long>'].includes(normalized)
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

    if (!skillData || !skillNameToId) return true
    const skillId = skillNameToId[skillName]
    if (!skillId) return true
    const entry = skillData[skillId]
    if (!entry) return true

    const restrictions = extractSkillRestrictions(entry)
    const settings = getCurrentSettings()
    return canSkillTrigger(restrictions, settings)
}
