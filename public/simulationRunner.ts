/**
 * Browser version of simulation-runner.ts.
 * Uses browser Web Workers instead of Node worker_threads.
 */
import type {
    Mood,
    RaceParameters,
} from '../uma-tools/uma-skill-tools/RaceParameters'
import type { RawCourseData, SkillMeta, SimulationTask, WorkerMessage } from '../types'
import {
    type CourseData,
    type CurrentSettings,
    calculateSkillCost,
    calculateStatsFromRawResults,
    canSkillTrigger,
    createWeightedConditionArray,
    createWeightedSeasonArray,
    createWeightedWeatherArray,
    extractSkillRestrictions,
    findMatchingCoursesWithFilters,
    findSkillIdByNameWithPreference,
    findSkillVariantsByName,
    Grade,
    GroundCondition,
    getDistanceType,
    isRandomLocation,
    isRandomValue,
    parseDistanceCategory,
    parseGroundCondition,
    parseSeason,
    parseStrategyName,
    parseSurface,
    parseWeather,
    processCourseData,
    Season,
    type SkillCostContext,
    type SkillDataEntry,
    type SkillResult,
    STRATEGY_TO_RUNNING_STYLE,
    Time,
    TRACK_NAME_TO_ID,
} from '../utils'

export interface RaceCondition<T> {
    isRandom: boolean
    value: T
    forFiltering: T | null
    display: string
    weighted: number[] | null
}

export interface ParsedRaceConditions {
    season: RaceCondition<number>
    weather: RaceCondition<number>
    groundCondition: RaceCondition<number>
    mood: RaceCondition<Mood | null>
}

export interface SimulationRunnerConfig {
    skills: Record<
        string,
        { discount?: number | null; default?: number | null }
    >
    track: {
        courseId?: string
        trackName?: string
        distance?: number | string
        surface?: string
        groundCondition: string
        weather: string
        season: string
        numUmas?: number
    }
    uma: {
        speed?: number
        stamina?: number
        power?: number
        guts?: number
        wisdom?: number
        strategy: string
        distanceAptitude?: string
        surfaceAptitude?: string
        styleAptitude?: string
        mood?: number
        skills?: string[]
        unique?: string
    }
    deterministic?: boolean
    confidenceInterval?: number
}

export interface SimulationProgress {
    type: 'phase' | 'result' | 'complete' | 'error' | 'info'
    phase?: string
    result?: SkillResult
    results?: SkillResult[]
    error?: string
    info?: string
}

export type ProgressCallback = (progress: SimulationProgress) => void

export interface StaticData {
    skillMeta: Record<string, SkillMeta>
    skillNames: Record<string, string[]>
    skillData: Record<string, SkillDataEntry>
    courseData: Record<string, RawCourseData>
    trackNames: Record<string, string[]>
}

interface SkillRawResults {
    skillName: string
    rawResults: number[]
    cost: number
    discount: number
}

function parseRaceCondition<T>(
    configValue: string | undefined,
    isRandom: boolean,
    randomPlaceholder: T,
    parse: (v: string) => T,
    createWeighted: (() => number[]) | null,
): RaceCondition<T> {
    if (isRandom) {
        return {
            isRandom: true,
            value: randomPlaceholder,
            forFiltering: null,
            display: '<Random>',
            weighted: createWeighted?.() ?? null,
        }
    }
    const value = parse(configValue as string)
    return {
        isRandom: false,
        value,
        forFiltering: value,
        display: configValue as string,
        weighted: null,
    }
}

export function parseRaceConditions(
    trackConfig: SimulationRunnerConfig['track'],
    umaConfig: SimulationRunnerConfig['uma'],
): ParsedRaceConditions {
    const moodRandom = umaConfig.mood == null

    return {
        season: parseRaceCondition(
            trackConfig.season,
            isRandomValue(trackConfig.season),
            Season.Spring,
            parseSeason,
            createWeightedSeasonArray,
        ),
        weather: parseRaceCondition(
            trackConfig.weather,
            isRandomValue(trackConfig.weather),
            1,
            parseWeather,
            createWeightedWeatherArray,
        ),
        groundCondition: parseRaceCondition(
            trackConfig.groundCondition,
            isRandomValue(trackConfig.groundCondition),
            GroundCondition.Good,
            parseGroundCondition,
            createWeightedConditionArray,
        ),
        mood: {
            isRandom: moodRandom,
            value: moodRandom ? null : (umaConfig.mood as Mood),
            forFiltering: moodRandom ? null : (umaConfig.mood as Mood),
            display: moodRandom ? '<Random>' : String(umaConfig.mood),
            weighted: null,
        },
    }
}

interface BaseUmaData {
    speed: number
    stamina: number
    power: number
    guts: number
    wisdom: number
    strategy: string
    distanceAptitude: string
    surfaceAptitude: string
    strategyAptitude: string
    skills: string[]
}

function createBaseUmaData(props: {
    speed: number
    stamina: number
    power: number
    guts: number
    wisdom: number
    strategy: string
    distanceAptitude: string
    surfaceAptitude: string
    strategyAptitude: string
    skills: string[]
}): BaseUmaData {
    return {
        speed: props.speed,
        stamina: props.stamina,
        power: props.power,
        guts: props.guts,
        wisdom: props.wisdom,
        strategy: props.strategy,
        distanceAptitude: props.distanceAptitude,
        surfaceAptitude: props.surfaceAptitude,
        strategyAptitude: props.strategyAptitude,
        skills: props.skills,
    }
}

export async function processWithConcurrency<T>(
    items: (() => Promise<T>)[],
    limit: number,
): Promise<T[]> {
    const results: T[] = []
    const executing = new Set<Promise<void>>()

    for (const itemFactory of items) {
        const promise = itemFactory().then((result) => {
            results.push(result)
            executing.delete(promise)
        })
        executing.add(promise)

        if (executing.size >= limit) {
            await Promise.race(executing)
        }
    }

    await Promise.all(executing)
    return results
}

export class BrowserSimulationRunner {
    constructor(
        readonly config: SimulationRunnerConfig,
        readonly staticData: StaticData,
        readonly workerUrl: string,
    ) {}

    async run(
        onProgress: ProgressCallback,
        skillFilter?: string[],
    ): Promise<void> {
        const { config, staticData, workerUrl } = this
        const { skillMeta, skillNames, skillData, courseData, trackNames } =
            staticData

        // Validate required fields
        if (!config.track.groundCondition) {
            onProgress({
                type: 'error',
                error: 'config.track.groundCondition must be specified',
            })
            return
        }
        if (!config.track.weather) {
            onProgress({
                type: 'error',
                error: 'config.track.weather must be specified',
            })
            return
        }
        if (!config.track.season) {
            onProgress({
                type: 'error',
                error: 'config.track.season must be specified',
            })
            return
        }
        if (!config.uma.strategy) {
            onProgress({
                type: 'error',
                error: 'config.uma.strategy must be specified',
            })
            return
        }

        let courses: Array<{ courseId: string; course: CourseData }> = []
        let useMultipleCourses = false
        const trackNameValue = config.track.trackName
        const distanceValue = config.track.distance

        const isRandomTrack = isRandomLocation(trackNameValue)
        const distanceCategory = parseDistanceCategory(distanceValue)
        useMultipleCourses = isRandomTrack || distanceCategory !== null

        if (config.track.courseId) {
            const selectedCourseId = config.track.courseId
            const rawCourse = courseData[selectedCourseId]
            if (!rawCourse) {
                onProgress({
                    type: 'error',
                    error: `Course ${selectedCourseId} not found`,
                })
                return
            }
            const course = processCourseData(rawCourse)
            if (course.turn === undefined || course.turn === null) {
                onProgress({
                    type: 'error',
                    error: `Course ${selectedCourseId} is missing turn field`,
                })
                return
            }
            courses.push({ courseId: selectedCourseId, course })
        } else if (trackNameValue && distanceValue !== undefined) {
            const matches = findMatchingCoursesWithFilters(
                courseData,
                trackNames,
                trackNameValue,
                distanceValue,
                config.track.surface,
            )

            if (matches.length === 0) {
                const locationDesc = isRandomTrack ? '<Random>' : trackNameValue
                const distanceDesc =
                    distanceCategory !== null
                        ? distanceValue
                        : `${distanceValue}m`
                const surfaceFilter = config.track.surface
                    ? ` and surface ${config.track.surface}`
                    : ''
                onProgress({
                    type: 'error',
                    error: `No courses found matching track "${locationDesc}" with distance ${distanceDesc}${surfaceFilter}`,
                })
                return
            }

            matches.sort((a, b) => a.courseId.localeCompare(b.courseId))

            if (useMultipleCourses) {
                courses = matches
                onProgress({
                    type: 'info',
                    info: `Found ${matches.length} matching course(s) for random selection`,
                })
            } else {
                courses.push(matches[0])
            }

            for (const { courseId, course } of courses) {
                if (course.turn === undefined || course.turn === null) {
                    onProgress({
                        type: 'error',
                        error: `Course ${courseId} is missing turn field`,
                    })
                    return
                }
            }
        } else {
            onProgress({
                type: 'error',
                error: 'Config must specify either track.courseId or both track.trackName and track.distance',
            })
            return
        }

        const umaConfig = config.uma
        const numUmas = config.track.numUmas ?? 18
        const strategyName = parseStrategyName(umaConfig.strategy)
        const conditions = parseRaceConditions(config.track, umaConfig)

        const racedef: RaceParameters = {
            mood: conditions.mood.value,
            groundCondition: conditions.groundCondition.value,
            weather: conditions.weather.value,
            season: conditions.season.value,
            time: Time.NoTime,
            grade: Grade.G1,
            popularity: 1,
            skillId: '',
            orderRange: numUmas ? [1, numUmas] : undefined,
            numUmas: numUmas,
        }

        // Resolve skill names to IDs for uma.skills
        const umaSkillIds: string[] = []
        if (umaConfig.skills) {
            for (const skillName of umaConfig.skills) {
                const skillId = findSkillIdByNameWithPreference(
                    skillName,
                    skillNames,
                    skillMeta,
                    true,
                )
                if (skillId) {
                    umaSkillIds.push(skillId)
                }
            }
        }

        // Resolve unique skill name to ID
        if (umaConfig.unique) {
            const uniqueSkillId = findSkillIdByNameWithPreference(
                umaConfig.unique,
                skillNames,
                skillMeta,
                false,
            )
            if (uniqueSkillId) {
                umaSkillIds.push(uniqueSkillId)
            }
        }

        const baseUma = createBaseUmaData({
            speed: umaConfig.speed ?? 1200,
            stamina: umaConfig.stamina ?? 1200,
            power: umaConfig.power ?? 800,
            guts: umaConfig.guts ?? 400,
            wisdom: umaConfig.wisdom ?? 400,
            strategy: strategyName,
            distanceAptitude: umaConfig.distanceAptitude ?? 'A',
            surfaceAptitude: umaConfig.surfaceAptitude ?? 'A',
            strategyAptitude: umaConfig.styleAptitude ?? 'A',
            skills: umaSkillIds,
        })

        const deterministic = config.deterministic ?? false
        const baseSimOptions = {
            useEnhancedSpurt: !deterministic,
            accuracyMode: !deterministic,
            pacemakerCount: 1,
            allowRushedUma1: !deterministic,
            allowRushedUma2: !deterministic,
            allowDownhillUma1: !deterministic,
            allowDownhillUma2: !deterministic,
            allowSectionModifierUma1: !deterministic,
            allowSectionModifierUma2: !deterministic,
            skillCheckChanceUma1: false,
            skillCheckChanceUma2: false,
        }
        let seedCounter = 0

        const configSkills = config.skills ?? {}
        const skillNameToId: Record<string, string> = {}
        const skillIdToName: Record<string, string> = {}
        const skillNameToConfigKey: Record<string, string> = {}

        const currentSettings: CurrentSettings = {
            distanceType:
                distanceCategory !== null
                    ? distanceCategory
                    : typeof distanceValue === 'number'
                      ? getDistanceType(distanceValue)
                      : null,
            groundCondition: conditions.groundCondition.forFiltering,
            groundType: parseSurface(config.track.surface),
            isBasisDistance:
                distanceCategory !== null
                    ? null
                    : typeof distanceValue === 'number'
                      ? distanceValue % 400 === 0
                      : null,
            rotation: useMultipleCourses
                ? null
                : (courses[0]?.course.turn ?? null),
            runningStyle: STRATEGY_TO_RUNNING_STYLE[strategyName] ?? 3,
            season: conditions.season.forFiltering,
            trackId:
                isRandomTrack || useMultipleCourses
                    ? null
                    : trackNameValue
                      ? (TRACK_NAME_TO_ID[trackNameValue] ?? null)
                      : null,
            weather: conditions.weather.forFiltering,
        }

        for (const [skillName, skillConfig] of Object.entries(configSkills)) {
            if (
                skillConfig.discount === null ||
                skillConfig.discount === undefined ||
                typeof skillConfig.discount !== 'number'
            ) {
                continue
            }

            const variants = findSkillVariantsByName(
                skillName,
                skillNames,
                skillMeta,
            )
            if (variants.length === 0) {
                continue
            }

            for (const variant of variants) {
                const skillId = variant.skillId
                const variantSkillName = variant.skillName

                if (umaSkillIds.includes(skillId)) {
                    continue
                }

                const currentSkillMeta = skillMeta[skillId]
                if (currentSkillMeta?.groupId) {
                    const currentGroupId = currentSkillMeta.groupId
                    const currentOrder = currentSkillMeta.order ?? 0
                    let shouldSkip = false
                    for (const umaSkillId of umaSkillIds) {
                        const umaSkillMeta = skillMeta[umaSkillId]
                        if (
                            umaSkillMeta?.groupId === currentGroupId &&
                            (umaSkillMeta.order ?? 0) < currentOrder
                        ) {
                            shouldSkip = true
                            break
                        }
                    }
                    if (shouldSkip) {
                        continue
                    }
                }

                const skillDataEntry = skillData[skillId]
                if (skillDataEntry) {
                    const restrictions =
                        extractSkillRestrictions(skillDataEntry)
                    if (!canSkillTrigger(restrictions, currentSettings)) {
                        continue
                    }
                }

                skillNameToId[variantSkillName] = skillId
                skillIdToName[skillId] = variantSkillName
                skillNameToConfigKey[variantSkillName] = skillName
            }
        }

        let availableSkillNames = Object.keys(skillNameToId)

        if (skillFilter && skillFilter.length > 0) {
            const filterSet = new Set(skillFilter)
            availableSkillNames = availableSkillNames.filter((name) =>
                filterSet.has(name),
            )
        }

        if (availableSkillNames.length === 0) {
            onProgress({
                type: 'error',
                error: 'No available skills specified in config',
            })
            return
        }

        const confidenceInterval = config.confidenceInterval ?? 95
        const concurrency = Math.min(
            availableSkillNames.length,
            navigator.hardwareConcurrency ?? 4,
        )

        // Browser Web Worker factory
        const runSimulationInWorker = (
            skillName: string,
            numSimulations: number,
            returnRawResults: boolean,
        ): Promise<{ skillName: string; rawResults?: number[] }> => {
            return new Promise((resolve, reject) => {
                const skillId = skillNameToId[skillName]
                const seed = deterministic
                    ? seedCounter++
                    : Math.floor(Math.random() * 1000000000)
                const simOptions = { ...baseSimOptions, seed }

                const taskData: SimulationTask = {
                    skillId,
                    skillName,
                    courses: courses.map((c) => c.course),
                    racedef,
                    baseUma,
                    simOptions,
                    numSimulations,
                    useRandomMood: conditions.mood.isRandom,
                    useRandomSeason: conditions.season.isRandom,
                    useRandomWeather: conditions.weather.isRandom,
                    useRandomCondition: conditions.groundCondition.isRandom,
                    weightedSeasons: conditions.season.weighted ?? undefined,
                    weightedWeathers: conditions.weather.weighted ?? undefined,
                    weightedConditions:
                        conditions.groundCondition.weighted ?? undefined,
                    confidenceInterval,
                    returnRawResults,
                }

                const worker = new Worker(workerUrl)
                worker.postMessage(taskData)

                const WORKER_TIMEOUT_MS = 5 * 60 * 1000
                const timeoutId = setTimeout(() => {
                    worker.terminate()
                    reject(
                        new Error(
                            `Worker timeout after ${WORKER_TIMEOUT_MS / 1000}s for skill: ${skillName}`,
                        ),
                    )
                }, WORKER_TIMEOUT_MS)

                worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
                    clearTimeout(timeoutId)
                    const message = event.data
                    if (message.success && message.result) {
                        resolve(message.result)
                    } else {
                        reject(new Error(message.error || 'Unknown error'))
                    }
                    worker.terminate()
                }

                worker.onerror = (error) => {
                    clearTimeout(timeoutId)
                    reject(error)
                    worker.terminate()
                }
            })
        }

        const skillRawResultsMap: Map<string, SkillRawResults> = new Map()

        const skillCostContext: SkillCostContext = {
            skillMeta,
            baseUmaSkillIds: umaSkillIds,
            skillNames,
            configSkills,
            skillIdToName,
            skillNameToConfigKey,
        }

        for (const skillName of availableSkillNames) {
            const skillId = skillNameToId[skillName]
            const configKey = skillNameToConfigKey[skillName] || skillName
            const skillConfig = configSkills[configKey]
            const cost = calculateSkillCost(
                skillId,
                skillConfig,
                skillCostContext,
            )
            skillRawResultsMap.set(skillName, {
                skillName,
                rawResults: [],
                cost,
                discount: skillConfig.discount ?? 0,
            })
        }

        const calculateCurrentResults = (): SkillResult[] => {
            const results: SkillResult[] = []
            for (const skillData of skillRawResultsMap.values()) {
                if (skillData.rawResults.length > 0) {
                    results.push(
                        calculateStatsFromRawResults(
                            skillData.rawResults,
                            skillData.cost,
                            skillData.discount,
                            skillData.skillName,
                            confidenceInterval,
                        ),
                    )
                }
            }
            results.sort((a, b) => b.meanLengthPerCost - a.meanLengthPerCost)
            return results
        }

        onProgress({
            type: 'phase',
            phase: `Running 500 simulations for ${availableSkillNames.length} skills...`,
        })

        const factories = availableSkillNames.map(
            (skillName) => async () => {
                try {
                    return await runSimulationInWorker(skillName, 500, true)
                } catch (error) {
                    onProgress({
                        type: 'error',
                        error: `Skill "${skillName}" failed: ${error}`,
                    })
                    return { skillName, rawResults: undefined }
                }
            },
        )
        const results = await processWithConcurrency(factories, concurrency)

        for (const result of results) {
            if (result.rawResults) {
                const skillData = skillRawResultsMap.get(result.skillName)
                if (skillData) {
                    skillData.rawResults.push(...result.rawResults)
                    const skillResult = calculateStatsFromRawResults(
                        skillData.rawResults,
                        skillData.cost,
                        skillData.discount,
                        skillData.skillName,
                        confidenceInterval,
                    )
                    onProgress({ type: 'result', result: skillResult })
                }
            }
        }

        const finalResults = calculateCurrentResults()
        onProgress({ type: 'complete', results: finalResults })
    }
}
