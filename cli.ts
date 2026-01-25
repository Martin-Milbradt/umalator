import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { Command } from 'commander'
import {
    type HorseState,
    SkillSet,
} from '../uma-tools/components/HorseDefTypes'
import type {
    Mood,
    RaceParameters,
} from '../uma-tools/uma-skill-tools/RaceParameters'
import type { RawCourseData, SkillMeta } from './types'
import {
    type CourseData,
    type CurrentSettings,
    calculateSkillCost,
    canSkillTrigger,
    createWeightedConditionArray,
    createWeightedSeasonArray,
    createWeightedWeatherArray,
    extractSkillRestrictions,
    findMatchingCoursesWithFilters,
    findSkillIdByNameWithPreference,
    findSkillVariantsByName,
    formatDistanceType,
    formatStrategyName,
    formatSurface,
    formatTable,
    formatTrackDetails,
    formatTurn,
    Grade,
    GroundCondition,
    getDistanceType,
    isRandomLocation,
    isRandomValue,
    isSkillCompatibleWithOrientation,
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
interface RaceCondition<T> {
    isRandom: boolean
    value: T // Used in racedef (placeholder when random)
    forFiltering: T | null // Used in currentSettings (null when random)
    display: string // For console output
    weighted: number[] | null // Weighted array for random sampling, null if not random
}

interface ParsedRaceConditions {
    season: RaceCondition<number>
    weather: RaceCondition<number>
    groundCondition: RaceCondition<number>
    mood: RaceCondition<Mood | null>
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

function parseRaceConditions(
    trackConfig: NonNullable<Config['track']>,
    umaConfig: NonNullable<Config['uma']>,
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

/** Creates a HorseState object for simulation */
function createHorseState(props: {
    speed: number
    stamina: number
    power: number
    guts: number
    wisdom: number
    strategy: string
    distanceAptitude: string
    surfaceAptitude: string
    strategyAptitude: string
    skills: Map<string, string>
}): HorseState {
    return {
        outfitId: '',
        speed: props.speed,
        stamina: props.stamina,
        power: props.power,
        guts: props.guts,
        wisdom: props.wisdom,
        strategy: props.strategy as HorseState['strategy'],
        distanceAptitude:
            props.distanceAptitude as HorseState['distanceAptitude'],
        surfaceAptitude: props.surfaceAptitude as HorseState['surfaceAptitude'],
        strategyAptitude:
            props.strategyAptitude as HorseState['strategyAptitude'],
        skills: props.skills as HorseState['skills'],
    }
}

interface Config {
    skills?: Record<
        string,
        { discount?: number | null; default?: number | null }
    >
    track?: {
        courseId?: string
        trackName?: string
        distance?: number | string
        surface?: string
        groundCondition?: string
        weather?: string
        season?: string
        numUmas?: number
    }
    uma?: {
        speed?: number
        stamina?: number
        power?: number
        guts?: number
        wisdom?: number
        strategy?: string
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

function loadJson<T>(filePath: string): T {
    const resolvedPath = resolve(process.cwd(), filePath)
    return JSON.parse(readFileSync(resolvedPath, 'utf-8')) as T
}

async function main() {
    const program = new Command()
    program
        .name('umalator-global-cli')
        .description('CLI tool for evaluating skills in umalator-global')
        .argument('[config]', 'Path to config file', 'default.json')
        .parse(process.argv)

    const args = program.args
    const configPath = `configs/${args[0] || 'default.json'}`

    const config = loadJson<Config>(configPath)
    const skillMeta = loadJson<Record<string, SkillMeta>>(
        '../uma-tools/umalator-global/skill_meta.json',
    )
    const courseData = loadJson<Record<string, RawCourseData>>(
        '../uma-tools/umalator-global/course_data.json',
    )
    const skillNames = loadJson<Record<string, string[]>>(
        '../uma-tools/umalator-global/skillnames.json',
    )
    const trackNames = loadJson<Record<string, string[]>>(
        '../uma-tools/umalator-global/tracknames.json',
    )
    const skillData = loadJson<Record<string, SkillDataEntry>>(
        '../uma-tools/umalator-global/skill_data.json',
    )

    if (!config.track) {
        console.error('Error: config must specify track')
        process.exit(1)
    }

    if (!config.uma) {
        console.error('Error: config must specify uma')
        process.exit(1)
    }

    // Validate required fields (must be specified or explicitly set to random)
    if (config.track.groundCondition === undefined) {
        console.error(
            'Error: config.track.groundCondition must be specified (use "<Random>" for random)',
        )
        process.exit(1)
    }
    if (config.track.weather === undefined) {
        console.error(
            'Error: config.track.weather must be specified (use "<Random>" for random)',
        )
        process.exit(1)
    }
    if (config.track.season === undefined) {
        console.error(
            'Error: config.track.season must be specified (use "<Random>" for random)',
        )
        process.exit(1)
    }
    if (!config.uma.strategy) {
        console.error('Error: config.uma.strategy must be specified')
        process.exit(1)
    }
    if (
        config.uma.mood != null &&
        (!Number.isInteger(config.uma.mood) ||
            config.uma.mood < -2 ||
            config.uma.mood > 2)
    ) {
        console.error(
            'Error: config.uma.mood must be an integer between -2 and 2 (or omit for random)',
        )
        process.exit(1)
    }
    if (
        config.track.numUmas !== undefined &&
        (!Number.isInteger(config.track.numUmas) || config.track.numUmas < 1)
    ) {
        console.error('Error: config.track.numUmas must be an integer >= 1')
        process.exit(1)
    }

    let courses: Array<{ courseId: string; course: CourseData }> = []
    let useMultipleCourses = false
    const trackNameValue = config.track.trackName
    const distanceValue = config.track.distance

    // Check if we're using random location or distance category
    const isRandomTrack = isRandomLocation(trackNameValue)
    const distanceCategory = parseDistanceCategory(distanceValue)
    useMultipleCourses = isRandomTrack || distanceCategory !== null

    if (config.track.courseId) {
        const selectedCourseId = config.track.courseId
        const rawCourse = courseData[selectedCourseId]
        if (!rawCourse) {
            console.error(`Error: Course ${selectedCourseId} not found`)
            process.exit(1)
        }
        const course = processCourseData(rawCourse)

        if (course.turn === undefined || course.turn === null) {
            console.error(
                `Error: Course ${selectedCourseId} is missing turn field`,
            )
            process.exit(1)
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
                distanceCategory !== null ? distanceValue : `${distanceValue}m`
            const surfaceFilter = config.track.surface
                ? ` and surface ${config.track.surface}`
                : ''
            console.error(
                `Error: No courses found matching track "${locationDesc}" with distance ${distanceDesc}${surfaceFilter}`,
            )
            process.exit(1)
        }

        // Sort courses by courseId for consistent ordering
        matches.sort((a, b) => a.courseId.localeCompare(b.courseId))

        if (useMultipleCourses) {
            courses = matches
            console.log(
                `Found ${matches.length} matching course(s) for random selection:`,
            )
            for (const { courseId, course: matchCourse } of matches) {
                const trackName =
                    trackNames[matchCourse.raceTrackId.toString()][1]
                const distanceType = formatDistanceType(
                    matchCourse.distanceType,
                )
                const surface = formatSurface(matchCourse.surface)
                const turn = formatTurn(matchCourse.turn)
                console.log(
                    `  courseId: ${courseId} - ${trackName}, ${matchCourse.distance}m (${distanceType}), ${surface}, ${turn}`,
                )
            }
            console.log('')
        } else {
            if (matches.length > 1) {
                console.log(`Found ${matches.length} matching course(s):`)
                for (const { courseId, course: matchCourse } of matches) {
                    const trackName =
                        trackNames[matchCourse.raceTrackId.toString()][1]
                    const distanceType = formatDistanceType(
                        matchCourse.distanceType,
                    )
                    const surface = formatSurface(matchCourse.surface)
                    const turn = formatTurn(matchCourse.turn)
                    console.log(
                        `  courseId: ${courseId} - ${trackName}, ${matchCourse.distance}m (${distanceType}), ${surface}, ${turn}`,
                    )
                }
                console.log('')
            }
            courses.push(matches[0])
        }

        // Validate all courses have turn field
        for (const { courseId, course } of courses) {
            if (course.turn === undefined || course.turn === null) {
                console.error(`Error: Course ${courseId} is missing turn field`)
                process.exit(1)
            }
        }
    } else {
        console.error(
            'Error: config must specify either track.courseId or both track.trackName and track.distance',
        )
        process.exit(1)
    }

    const primaryCourse = courses[0].course
    const primaryCourseId = courses[0].courseId

    const umaConfig = config.uma
    const numUmas = config.track.numUmas ?? 18
    const strategyName = parseStrategyName(umaConfig.strategy)

    // Parse all race conditions into a unified structure
    const conditions = parseRaceConditions(config.track, umaConfig)

    // Build racedef for simulation (uses placeholder values when random, worker overrides them)
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

    // Resolve skill names to IDs for uma.skills (prefer skills with cost > 0)
    const umaSkillIds: string[] = []
    if (umaConfig.skills) {
        for (const skillName of umaConfig.skills) {
            const skillId = findSkillIdByNameWithPreference(
                skillName,
                skillNames,
                skillMeta,
                true,
            )
            if (!skillId) {
                console.error(
                    `Warning: Skill "${skillName}" not found in uma.skills, skipping`,
                )
                continue
            }
            umaSkillIds.push(skillId)
        }
    }

    // Resolve unique skill name to ID (prefer skill with cost === 0)
    let resolvedUniqueSkillName: string | null = null
    if (umaConfig.unique) {
        const uniqueSkillId = findSkillIdByNameWithPreference(
            umaConfig.unique,
            skillNames,
            skillMeta,
            false,
        )
        if (!uniqueSkillId) {
            console.error(
                `Warning: Unique skill "${umaConfig.unique}" not found, skipping`,
            )
        } else {
            const baseCost = skillMeta[uniqueSkillId]?.baseCost ?? 200
            if (baseCost !== 0) {
                console.error(
                    `Warning: Unique skill "${umaConfig.unique}" has cost ${baseCost}, expected 0`,
                )
            }
            umaSkillIds.push(uniqueSkillId)
            resolvedUniqueSkillName =
                skillNames[uniqueSkillId]?.[0] ?? umaConfig.unique
        }
    }

    const baseUma = createHorseState({
        speed: umaConfig.speed ?? 1200,
        stamina: umaConfig.stamina ?? 1200,
        power: umaConfig.power ?? 800,
        guts: umaConfig.guts ?? 400,
        wisdom: umaConfig.wisdom ?? 400,
        strategy: strategyName,
        distanceAptitude: umaConfig.distanceAptitude ?? 'A',
        surfaceAptitude: umaConfig.surfaceAptitude ?? 'A',
        strategyAptitude: umaConfig.styleAptitude ?? 'A',
        skills: SkillSet(umaSkillIds),
    })

    const deterministic = config.deterministic ?? false
    const simOptions = {
        seed: deterministic ? 0 : Math.floor(Math.random() * 1000000000),
        useEnhancedSpurt: !deterministic,
        accuracyMode: !deterministic,
        pacemakerCount: 1,
        allowRushedUma1: !deterministic,
        allowRushedUma2: !deterministic,
        allowDownhillUma1: !deterministic,
        allowDownhillUma2: !deterministic,
        allowSectionModifierUma1: !deterministic,
        allowSectionModifierUma2: !deterministic,
        skillCheckChanceUma1: false, // Set to false to reduce dependency of other skills
        skillCheckChanceUma2: false, // Set to false to reduce dependency of other skills
    }

    const configSkills = config.skills ?? {}
    const skillNameToId: Record<string, string> = {}
    const skillIdToName: Record<string, string> = {}
    const skillNameToConfigKey: Record<string, string> = {}

    // Build current settings for skill filtering (null means "any value acceptable")
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
        orientation: useMultipleCourses ? null : primaryCourse.turn,
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
            console.error(
                `Warning: Skill "${skillName}" not found or all variants have cost 0, skipping`,
            )
            continue
        }

        for (const variant of variants) {
            const skillId = variant.skillId
            const variantSkillName = variant.skillName

            // Skip if skill is already in uma's skill list
            if (umaSkillIds.includes(skillId)) {
                continue
            }

            // Skip if uma already has a skill with lower order and same groupId
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

            // Skip if skill cannot trigger under current settings
            const skillDataEntry = skillData[skillId]
            if (skillDataEntry) {
                const restrictions = extractSkillRestrictions(skillDataEntry)
                if (!canSkillTrigger(restrictions, currentSettings)) {
                    continue
                }
            }

            // Skip if skill is incompatible with track orientation (handedness)
            if (
                !isSkillCompatibleWithOrientation(
                    variantSkillName,
                    currentSettings.orientation,
                )
            ) {
                continue
            }

            skillNameToId[variantSkillName] = skillId
            skillIdToName[skillId] = variantSkillName
            skillNameToConfigKey[variantSkillName] = skillName
        }
    }

    const availableSkillNames = Object.keys(skillNameToId)
    if (availableSkillNames.length === 0) {
        console.error('Error: No available skills specified in config')
        process.exit(1)
    }

    if (useMultipleCourses) {
        const locationDesc = isRandomTrack ? '<Random>' : trackNameValue
        const distanceDesc =
            distanceCategory !== null ? distanceValue : `${distanceValue}m`
        console.log(
            `Running on ${courses.length} tracks matching: ${locationDesc}, ${
                config.track.surface ?? 'Any'
            }, ${distanceDesc}`,
        )
        console.log(
            `Season: ${conditions.season.display}, Condition: ${conditions.groundCondition.display}, Weather: ${conditions.weather.display}`,
        )
    } else {
        const trackDetails = formatTrackDetails(
            primaryCourse,
            trackNames,
            conditions.groundCondition.display,
            conditions.weather.display,
            conditions.season.display,
            primaryCourseId,
            config.track.numUmas ?? 18,
        )
        console.log(trackDetails)
    }
    console.log(
        `SPD: ${baseUma.speed}, STA: ${baseUma.stamina}, PWR: ${baseUma.power}, GUTS: ${baseUma.guts}, WIT: ${
            baseUma.wisdom
        }, ${formatStrategyName(baseUma.strategy)}, APT: ${
            baseUma.distanceAptitude
        }, Unique: ${resolvedUniqueSkillName}`,
    )
    console.log('')

    const confidenceInterval = config.confidenceInterval ?? 95

    interface SkillRawResults {
        skillName: string
        rawResults: number[]
        cost: number
        discount: number
    }

    function calculateStatsFromRawResults(
        rawResults: number[],
        cost: number,
        discount: number,
        skillName: string,
        ciPercent: number,
    ): SkillResult {
        const sorted = [...rawResults].sort((a, b) => a - b)
        const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
        const min = sorted[0]
        const max = sorted[sorted.length - 1]
        const mid = Math.floor(sorted.length / 2)
        const median =
            sorted.length % 2 === 0
                ? (sorted[mid - 1] + sorted[mid]) / 2
                : sorted[mid]
        const lowerPercentile = (100 - ciPercent) / 2
        const upperPercentile = 100 - lowerPercentile
        const lower_Index = Math.floor(sorted.length * (lowerPercentile / 100))
        const upper_Index = Math.floor(sorted.length * (upperPercentile / 100))
        const ciLower = sorted[lower_Index]
        const ciUpper = sorted[upper_Index]
        const meanLengthPerCost = mean / cost

        return {
            skill: skillName,
            cost,
            discount,
            numSimulations: rawResults.length,
            meanLength: mean,
            medianLength: median,
            meanLengthPerCost,
            minLength: min,
            maxLength: max,
            ciLower,
            ciUpper,
        }
    }

    const concurrency = Math.min(availableSkillNames.length, cpus().length)

    const runSimulationInWorker = (
        skillName: string,
        numSimulations: number,
        returnRawResults: boolean,
    ): Promise<{
        skillName: string
        rawResults?: number[]
        result?: SkillResult
    }> => {
        return new Promise((resolve, reject) => {
            const skillId = skillNameToId[skillName]

            const worker = new Worker(
                new URL('./simulation.worker.js', import.meta.url),
                {
                    workerData: {
                        skillId,
                        skillName,
                        courses: courses.map((c) => c.course),
                        racedef,
                        baseUma: {
                            ...baseUma,
                            skills: Object.fromEntries(baseUma.skills),
                        },
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
                },
            )

            worker.on(
                'message',
                (message: {
                    success: boolean
                    result?: { skillName: string; rawResults?: number[] }
                    error?: string
                }) => {
                    if (message.success && message.result) {
                        resolve(message.result)
                    } else {
                        reject(new Error(message.error || 'Unknown error'))
                    }
                    worker.terminate()
                },
            )

            worker.on('error', (error) => {
                reject(error)
                worker.terminate()
            })
        })
    }

    const processWithConcurrency = async <T>(
        items: (() => Promise<T>)[],
        limit: number,
    ): Promise<T[]> => {
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
        const cost = calculateSkillCost(skillId, skillConfig, skillCostContext)
        skillRawResultsMap.set(skillName, {
            skillName,
            rawResults: [],
            cost,
            discount: skillConfig.discount ?? 0,
        })
    }

    console.log(
        `Running 100 simulations for all ${availableSkillNames.length} skills...`,
    )
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
            }
        }
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

    let currentResults = calculateCurrentResults()

    const runAdditionalSimulations = async (
        skillNames: string[],
        passName: string,
    ) => {
        if (skillNames.length === 0) return
        console.log(
            `Running 100 simulations for ${passName} (${skillNames.length} skills)...`,
        )
        const factories = skillNames.map(
            (skillName) => () => runSimulationInWorker(skillName, 100, true),
        )
        const passResults = await processWithConcurrency(factories, concurrency)
        for (const result of passResults) {
            if (result.rawResults) {
                const skillData = skillRawResultsMap.get(result.skillName)
                if (skillData) {
                    skillData.rawResults.push(...result.rawResults)
                }
            }
        }
        currentResults = calculateCurrentResults()
    }

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

    console.log('')
    console.log(formatTable(finalResults, confidenceInterval))
}

main().catch((err) => {
    console.error('Error:', err)
    process.exit(1)
})
