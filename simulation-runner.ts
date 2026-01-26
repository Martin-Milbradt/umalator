import { cpus } from 'node:os'
import { Worker } from 'node:worker_threads'
import type {
    Mood,
    RaceParameters,
} from '../uma-tools/uma-skill-tools/RaceParameters'
import type { RawCourseData, SkillMeta } from './types'
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
} from './utils'

/**
 * Parsed race condition that can be either a fixed value or random.
 * When random, `value` is a placeholder for racedef (worker overrides it),
 * and `forFiltering` is null (skill filtering accepts any value).
 */
export interface RaceCondition<T> {
    isRandom: boolean
    value: T // Used in racedef (placeholder when random)
    forFiltering: T | null // Used in currentSettings (null when random)
    display: string // For console output
    weighted: number[] | null // Weighted array for random sampling, null if not random
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

interface StaticData {
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
            weighted: null, // Mood uses a fixed array [-2, -1, 0, 1, 2] in worker
        },
    }
}

/** Base uma data for simulation (passed to worker which creates HorseState) */
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
    skills: string[] // Skill IDs - worker converts to SkillSet
}

export function createBaseUmaData(props: {
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

export class SimulationRunner {
    constructor(
        readonly config: SimulationRunnerConfig,
        readonly staticData: StaticData,
        readonly workerPath: URL,
    ) {}

    /**
     * Run simulations for skills.
     * @param onProgress Callback for progress updates
     * @param skillFilter Optional list of skill names to calculate. If provided, only these skills are simulated.
     */
    async run(
        onProgress: ProgressCallback,
        skillFilter?: string[],
    ): Promise<void> {
        const { config, staticData, workerPath } = this
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
        // Base simOptions without seed - seed is generated per worker invocation
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
        // Counter to ensure unique seeds across all worker invocations
        let seedCounter = 0

        const configSkills = config.skills ?? {}
        const skillNameToId: Record<string, string> = {}
        const skillIdToName: Record<string, string> = {}
        const skillNameToConfigKey: Record<string, string> = {}

        // Build current settings for skill filtering
        const currentSettings: CurrentSettings = {
            distanceType:
                distanceCategory !== null || useMultipleCourses
                    ? null
                    : typeof distanceValue === 'number'
                      ? getDistanceType(distanceValue)
                      : null,
            groundCondition: conditions.groundCondition.forFiltering,
            groundType: parseSurface(config.track.surface),
            isBasisDistance:
                distanceCategory !== null || useMultipleCourses
                    ? null
                    : typeof distanceValue === 'number'
                      ? distanceValue % 400 === 0
                      : null,
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

        // Apply skill filter if provided
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
        const concurrency = Math.min(availableSkillNames.length, cpus().length)

        const runSimulationInWorker = (
            skillName: string,
            numSimulations: number,
            returnRawResults: boolean,
        ): Promise<{ skillName: string; rawResults?: number[] }> => {
            return new Promise((resolve, reject) => {
                const skillId = skillNameToId[skillName]
                // Generate unique seed for this worker invocation
                const seed = deterministic
                    ? seedCounter++
                    : Math.floor(Math.random() * 1000000000)
                const simOptions = { ...baseSimOptions, seed }

                const worker = new Worker(workerPath, {
                    workerData: {
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
                        weightedSeasons: conditions.season.weighted,
                        weightedWeathers: conditions.weather.weighted,
                        weightedConditions: conditions.groundCondition.weighted,
                        confidenceInterval,
                        returnRawResults,
                    },
                })

                // Timeout after 5 minutes to prevent hung workers
                const WORKER_TIMEOUT_MS = 5 * 60 * 1000
                const timeoutId = setTimeout(() => {
                    worker.terminate()
                    reject(
                        new Error(
                            `Worker timeout after ${WORKER_TIMEOUT_MS / 1000}s for skill: ${skillName}`,
                        ),
                    )
                }, WORKER_TIMEOUT_MS)

                worker.on(
                    'message',
                    (message: {
                        success: boolean
                        result?: { skillName: string; rawResults?: number[] }
                        error?: string
                    }) => {
                        clearTimeout(timeoutId)
                        if (message.success && message.result) {
                            resolve(message.result)
                        } else {
                            reject(new Error(message.error || 'Unknown error'))
                        }
                        worker.terminate()
                    },
                )

                worker.on('error', (error) => {
                    clearTimeout(timeoutId)
                    reject(error)
                    worker.terminate()
                })
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

        // First pass: 100 simulations for all skills
        onProgress({
            type: 'phase',
            phase: `Running 100 simulations for all ${availableSkillNames.length} skills...`,
        })

        const firstPassFactories = availableSkillNames.map(
            (skillName) => () => runSimulationInWorker(skillName, 100, true),
        )
        const firstPassResults = await processWithConcurrency(
            firstPassFactories,
            concurrency,
        )

        for (const result of firstPassResults) {
            if (result.rawResults) {
                const skillData = skillRawResultsMap.get(result.skillName)
                if (skillData) {
                    skillData.rawResults.push(...result.rawResults)
                    // Emit individual result as it completes
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

        let currentResults = calculateCurrentResults()

        const runAdditionalSimulations = async (
            skillNames: string[],
            passName: string,
        ) => {
            if (skillNames.length === 0) return
            onProgress({
                type: 'phase',
                phase: `Running 100 simulations for ${passName} (${skillNames.length} skills)...`,
            })

            const factories = skillNames.map(
                (skillName) => () =>
                    runSimulationInWorker(skillName, 100, true),
            )
            const passResults = await processWithConcurrency(
                factories,
                concurrency,
            )

            for (const result of passResults) {
                if (result.rawResults) {
                    const skillData = skillRawResultsMap.get(result.skillName)
                    if (skillData) {
                        skillData.rawResults.push(...result.rawResults)
                        // Emit updated result
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
            currentResults = calculateCurrentResults()
        }

        // Tiered simulation passes
        const topHalfCount = Math.ceil(currentResults.length / 2)
        const topHalfSkills = currentResults
            .slice(0, topHalfCount)
            .map((r) => r.skill)
        await runAdditionalSimulations(topHalfSkills, 'top half')

        const top10Skills = currentResults
            .slice(0, Math.min(10, currentResults.length))
            .map((r) => r.skill)
        await runAdditionalSimulations(top10Skills, 'top 10')

        const top25PercentCount = Math.ceil(currentResults.length * 0.25)
        const top25PercentSkills = currentResults
            .slice(0, top25PercentCount)
            .map((r) => r.skill)
        await runAdditionalSimulations(top25PercentSkills, 'top 25%')

        const top5Skills = currentResults
            .slice(0, Math.min(5, currentResults.length))
            .map((r) => r.skill)
        await runAdditionalSimulations(top5Skills, 'top 5')

        const finalResults = calculateCurrentResults()
        onProgress({ type: 'complete', results: finalResults })
    }
}
