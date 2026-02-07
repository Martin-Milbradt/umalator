import { autoSave } from './configManager'
import { DISTANCE_CATEGORIES, RANDOM_LOCATION, tracknames } from './constants'
import { callRenderSkills } from './renderCallbacks'
import {
    getCalculatedResultsCache,
    getCourseData,
    getCurrentConfig,
} from './state'
import type { Track } from './types'

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

export function isRandomLocation(
    trackName: string | undefined | null,
): boolean {
    return (
        trackName !== undefined &&
        trackName !== null &&
        trackName.toLowerCase().trim() === '<random>'
    )
}

export function isDistanceCategory(
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
    const courseData = getCourseData()
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

export async function waitForCourseData(): Promise<void> {
    const courseData = getCourseData()
    if (courseData) {
        return
    }
    await new Promise<void>((resolve) => {
        const checkCourseData = setInterval(() => {
            if (getCourseData()) {
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

export function renderTrack(): void {
    const currentConfig = getCurrentConfig()
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
            const currentConfig = getCurrentConfig()
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
                callRenderSkills()
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
                getCalculatedResultsCache().clear()
            }

            autoSave()
        })
        wrapper.appendChild(input)

        trackLine.appendChild(wrapper)
    })

    container.appendChild(trackLine)
}
