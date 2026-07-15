// Runtime-neutral simulation orchestration shared by the Node CLI/server
// (simulation-runner.ts) and the browser UI (public/simulationRunner.ts).
//
// Everything except actually spawning a worker lives here: config validation,
// course resolution, race-condition parsing, skill filtering, task building,
// cost/stat aggregation, and progress reporting. Each platform passes in a
// WorkerAdapter that knows how to run a single SimulationTask (Node
// worker_threads vs browser Web Worker) and how many to run at once.
//
// Do not import node-only or browser-only APIs here.
import type { Mood } from '../uma-tools/uma-skill-tools/RaceParameters'
import type { RaceDef, RawCourseData, SimulationTask, SkillMeta } from '../types'
import {
    type CourseData,
    type CurrentSettings,
    type SkillCostContext,
    type SkillDataEntry,
    type SkillResult,
    Grade,
    GroundCondition,
    Season,
    STRATEGY_TO_RUNNING_STYLE,
    TRACK_NAME_TO_ID,
    Time,
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
} from '../utils'

/** Default per-skill simulation count when the config doesn't specify one. */
export const DEFAULT_NUM_SIMULATIONS = 500

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
        uniqueLv?: number
        uniqueDisabled?: boolean
    }
    filters?: {
        /** Simulate skills already on the uma as removal rows (default true). */
        calcOwned?: boolean
    }
    deterministic?: boolean
    confidenceInterval?: number
    numSimulations?: number
    // Fixed RNG seed for reproducible runs. null/undefined = a fresh random
    // seed each run (the default).
    seed?: number | null
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

/** Result of running one SimulationTask, returned by a WorkerAdapter. */
export interface TaskResult {
    skillName: string
    rawResults?: number[]
}

/**
 * Platform seam: knows how to run a single task on a worker and how many tasks
 * to run concurrently. The orchestrator owns everything else.
 */
export interface WorkerAdapter {
    runTask(task: SimulationTask): Promise<TaskResult>
    concurrency(skillCount: number): number
}

interface SkillRawResults {
    skillName: string
    rawResults: number[]
    cost: number
    discount: number
}

/** Base uma data for simulation (passed to worker which creates HorseState). */
interface BaseUmaData {
    speed: number
    stamina: number
    power: number
    guts: number
    wisdom: number
    mood?: Mood
    popularity?: number
    strategy: string
    distanceAptitude: string
    surfaceAptitude: string
    strategyAptitude: string
    skills: string[] // Skill IDs - worker converts to SkillSet
    uniqueSkillId?: string
    uniqueLv?: number
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

/**
 * Run efficiency simulations for the configured skills, reporting progress as
 * results stream in. The worker transport and concurrency are supplied by
 * `adapter`; everything else (validation, filtering, stats) is shared.
 */
export async function runSimulation(
    config: SimulationRunnerConfig,
    staticData: StaticData,
    onProgress: ProgressCallback,
    adapter: WorkerAdapter,
    skillFilter?: string[],
): Promise<void> {
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
    // Coerce numeric strings up front so the skill-filter math (which
    // checks `typeof === 'number'`) doesn't fall through and let
    // distance-restricted skills leak past the filter.
    const numericDistance =
        typeof distanceValue === 'number'
            ? distanceValue
            : typeof distanceValue === 'string' &&
                Number.isFinite(Number(distanceValue))
              ? Number(distanceValue)
              : null

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
                distanceCategory !== null ? distanceValue : `${distanceValue}m`
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
            courses.push(matches[0]!)
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

    // mood and popularity are per-uma (they ride on baseUma), not per-race.
    const racedef: RaceDef = {
        groundCondition: conditions.groundCondition.value,
        weather: conditions.weather.value,
        season: conditions.season.value,
        time: Time.NoTime,
        grade: Grade.G1,
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

    // Resolve unique skill name to ID. A disabled unique is left off the
    // base uma entirely (simulating runs where it never triggers) but keeps
    // its id so it can get a re-enable row.
    const uniqueDisabled = umaConfig.uniqueDisabled ?? false
    let uniqueSkillId: string | undefined
    if (umaConfig.unique) {
        const resolved = findSkillIdByNameWithPreference(
            umaConfig.unique,
            skillNames,
            skillMeta,
            false,
        )
        if (resolved) {
            uniqueSkillId = resolved
            if (!uniqueDisabled) {
                umaSkillIds.push(resolved)
            }
        }
    }

    const baseUma: BaseUmaData = {
        speed: umaConfig.speed ?? 1200,
        stamina: umaConfig.stamina ?? 1200,
        power: umaConfig.power ?? 800,
        guts: umaConfig.guts ?? 400,
        wisdom: umaConfig.wisdom ?? 400,
        mood: conditions.mood.isRandom
            ? undefined
            : (conditions.mood.value as Mood),
        strategy: strategyName,
        distanceAptitude: umaConfig.distanceAptitude ?? 'A',
        surfaceAptitude: umaConfig.surfaceAptitude ?? 'A',
        strategyAptitude: umaConfig.styleAptitude ?? 'A',
        skills: umaSkillIds,
        uniqueSkillId,
        uniqueLv: umaConfig.uniqueLv ?? 1,
    }

    const deterministic = config.deterministic ?? false
    // A fixed seed makes the whole run reproducible: every task's seed is
    // derived from it (seedBase + task index) and runComparison draws all of
    // its randomness from that seed. config.seed wins; the legacy
    // `deterministic` flag behaves like seed 0; otherwise each task gets a
    // fresh random seed.
    const seedBase = config.seed ?? (deterministic ? 0 : null)
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

    // STRATEGY_TO_RUNNING_STYLE covers every internal name parseStrategyName can
    // return (it throws on anything else), so a miss here is a programming error,
    // not bad user input.
    const runningStyle = STRATEGY_TO_RUNNING_STYLE[strategyName]
    if (runningStyle === undefined) {
        onProgress({
            type: 'error',
            error: `No running style mapping for strategy "${strategyName}"`,
        })
        return
    }

    // Build current settings for skill filtering
    const currentSettings: CurrentSettings = {
        distanceType:
            distanceCategory !== null
                ? distanceCategory
                : numericDistance !== null
                  ? getDistanceType(numericDistance)
                  : null,
        groundCondition: conditions.groundCondition.forFiltering,
        groundType: parseSurface(config.track.surface),
        isBasisDistance:
            distanceCategory !== null
                ? null
                : numericDistance !== null
                  ? numericDistance % 400 === 0
                  : null,
        rotation: useMultipleCourses
            ? null
            : (courses[0]?.course.turn ?? null),
        runningStyle,
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
                const restrictions = extractSkillRestrictions(skillDataEntry)
                if (!canSkillTrigger(restrictions, currentSettings)) {
                    continue
                }
            }

            skillNameToId[variantSkillName] = skillId
            skillIdToName[skillId] = variantSkillName
            skillNameToConfigKey[variantSkillName] = skillName
        }
    }

    const skillCostContext: SkillCostContext = {
        skillMeta,
        baseUmaSkillIds: umaSkillIds,
        skillNames,
        configSkills,
        skillIdToName,
        skillNameToConfigKey,
    }

    // --- Owned-skill rows ---------------------------------------------------
    // Skills already on the uma are simulated the other way around (uma
    // without the skill vs uma with it) and reported negated: mean = what
    // removing loses, cost = the refunded SP, so mean/cost stays positive and
    // comparable to buy rows. Each owned skill gets a removal row plus one
    // downgrade row per less-advanced tier of its group; the unique gets a
    // disable/re-enable row without cost columns. Like buy candidates, a
    // skill only gets a row when its discount is configured (a "-" in the
    // skills table keeps it out entirely).
    interface OwnedRowSpec {
        taskSkillId: string
        baseSkills: string[]
        negate: boolean
        cost: number
        discount: number
        hasCost: boolean
        action: 'remove' | 'downgrade' | 'disable-unique' | 'enable-unique'
    }
    const ownedRowSpecs = new Map<string, OwnedRowSpec>()
    const calcOwned = config.filters?.calcOwned ?? true

    const configKeyForName = (name: string): string | null => {
        if (configSkills[name]) return name
        const base = name.replace(/ [○◎]$/, '')
        if (base !== name && configSkills[base]) return base
        return null
    }
    const discountForId = (skillId: string): number | null => {
        const name = skillNames[skillId]?.[0]
        if (!name) return null
        const key = configKeyForName(name)
        if (!key) return null
        return configSkills[key]?.discount ?? null
    }
    // Full chain cost of a skill as if nothing of its group were owned; null
    // when its discount isn't configured (absent or "-" in the skills table).
    const fullChainCost = (
        skillId: string,
        strippedUmaSkills: string[],
    ): number | null => {
        const discount = discountForId(skillId)
        if (discount === null) return null
        return calculateSkillCost(
            skillId,
            { discount },
            { ...skillCostContext, baseUmaSkillIds: strippedUmaSkills },
        )
    }
    // Make group siblings resolvable for prerequisite discount lookups (the
    // candidate loop above only registers purchasable candidates).
    const registerForCosts = (skillId: string): void => {
        const name = skillNames[skillId]?.[0]
        if (!name) return
        skillIdToName[skillId] ??= name
        const key = configKeyForName(name)
        if (key) skillNameToConfigKey[name] ??= key
    }

    if (calcOwned) {
        for (const ownedId of umaSkillIds) {
            if (ownedId === uniqueSkillId) continue
            const ownedName = skillNames[ownedId]?.[0]
            if (!ownedName || !skillData[ownedId]) continue
            const ownedMeta = skillMeta[ownedId]
            const stripped = umaSkillIds.filter((id) => id !== ownedId)
            registerForCosts(ownedId)
            const groupId = ownedMeta?.groupId
            const ownedOrder = ownedMeta?.order ?? 0
            const siblings: string[] = []
            if (groupId) {
                for (const [sibId, sibMeta] of Object.entries(skillMeta)) {
                    if (sibMeta.groupId !== groupId || sibId === ownedId) {
                        continue
                    }
                    if ((sibMeta.order ?? 0) <= ownedOrder) continue
                    if ((sibMeta.score ?? 1) < 0) continue // purple variants
                    if (!skillNames[sibId]?.[0] || !skillData[sibId]) continue
                    registerForCosts(sibId)
                    siblings.push(sibId)
                }
            }
            const ownCost = fullChainCost(ownedId, stripped)
            if (ownCost !== null) {
                ownedRowSpecs.set(ownedName, {
                    taskSkillId: ownedId,
                    baseSkills: stripped,
                    negate: true,
                    cost: -ownCost,
                    discount: discountForId(ownedId) ?? 0,
                    hasCost: true,
                    action: 'remove',
                })
            }
            for (const sibId of siblings) {
                const sibName = skillNames[sibId]![0]!
                const sibCost = fullChainCost(sibId, stripped)
                if (sibCost === null) continue
                const diff = ownCost !== null ? ownCost - sibCost : null
                ownedRowSpecs.set(sibName, {
                    taskSkillId: ownedId,
                    baseSkills: [...stripped, sibId],
                    negate: true,
                    cost: diff !== null ? -diff : 0,
                    discount: discountForId(sibId) ?? 0,
                    hasCost: diff !== null,
                    action: 'downgrade',
                })
            }
        }
    }
    // The unique's disable row is gated like other owned rows, but the
    // re-enable row always shows so a disabled unique can't get stranded.
    if (uniqueSkillId && skillData[uniqueSkillId]) {
        const uniqueName = skillNames[uniqueSkillId]?.[0]
        if (uniqueName && (calcOwned || uniqueDisabled)) {
            ownedRowSpecs.set(uniqueName, {
                taskSkillId: uniqueSkillId,
                baseSkills: umaSkillIds.filter((id) => id !== uniqueSkillId),
                negate: !uniqueDisabled,
                cost: 0,
                discount: 0,
                hasCost: false,
                action: uniqueDisabled ? 'enable-unique' : 'disable-unique',
            })
        }
    }

    let availableSkillNames = [
        ...new Set([...Object.keys(skillNameToId), ...ownedRowSpecs.keys()]),
    ]

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
    const numSims = config.numSimulations ?? DEFAULT_NUM_SIMULATIONS
    const concurrency = adapter.concurrency(availableSkillNames.length)

    const buildTask = (skillName: string): SimulationTask => {
        const ownedSpec = ownedRowSpecs.get(skillName)
        const skillId = ownedSpec?.taskSkillId ?? skillNameToId[skillName]!
        const seed =
            seedBase !== null
                ? seedBase + seedCounter++
                : Math.floor(Math.random() * 1000000000)
        return {
            skillId,
            skillName,
            courses: courses.map((c) => c.course),
            racedef,
            baseUma: ownedSpec
                ? { ...baseUma, skills: ownedSpec.baseSkills }
                : baseUma,
            simOptions: { ...baseSimOptions, seed },
            numSimulations: numSims,
            useRandomMood: conditions.mood.isRandom,
            useRandomSeason: conditions.season.isRandom,
            useRandomWeather: conditions.weather.isRandom,
            useRandomCondition: conditions.groundCondition.isRandom,
            weightedSeasons: conditions.season.weighted ?? undefined,
            weightedWeathers: conditions.weather.weighted ?? undefined,
            weightedConditions: conditions.groundCondition.weighted ?? undefined,
            confidenceInterval,
        }
    }

    const skillRawResultsMap: Map<string, SkillRawResults> = new Map()

    for (const skillName of availableSkillNames) {
        const ownedSpec = ownedRowSpecs.get(skillName)
        if (ownedSpec) {
            skillRawResultsMap.set(skillName, {
                skillName,
                rawResults: [],
                cost: ownedSpec.cost,
                discount: ownedSpec.discount,
            })
            continue
        }
        const skillId = skillNameToId[skillName]!
        const configKey = skillNameToConfigKey[skillName] || skillName
        const skillConfig = configSkills[configKey]!
        const cost = calculateSkillCost(skillId, skillConfig, skillCostContext)
        skillRawResultsMap.set(skillName, {
            skillName,
            rawResults: [],
            cost,
            discount: skillConfig.discount ?? 0,
        })
    }

    // Each skill's stats are computed once as its result is processed and
    // cached here; the final list reuses them rather than recomputing (the
    // stats pass includes the bootstrap CI, which is not cheap).
    const computedResults = new Map<string, SkillResult>()

    onProgress({
        type: 'phase',
        phase: `Running ${numSims} simulations for ${availableSkillNames.length} skills...`,
    })

    const factories = availableSkillNames.map((skillName) => async () => {
        const task = buildTask(skillName)
        try {
            return await adapter.runTask(task)
        } catch (error) {
            // Always log the seed so a failing calculation can be reproduced
            // (set config.seed to it and run just this skill).
            console.error(
                `Skill "${skillName}" failed (seed ${task.simOptions.seed}):`,
                error,
            )
            onProgress({
                type: 'error',
                error: `Skill "${skillName}" failed (seed ${task.simOptions.seed}): ${error}`,
            })
            return { skillName, rawResults: undefined }
        }
    })
    const results = await processWithConcurrency(factories, concurrency)

    // The per-combination batching rounds the per-skill sample count down to a
    // multiple of the combo count, so the realized count can sit just under the
    // request. Report it once so the spread/CI is read against the real n.
    let reportedSampleSize = false

    for (const result of results) {
        if (result.rawResults) {
            const skillData = skillRawResultsMap.get(result.skillName)
            if (skillData) {
                const ownedSpec = ownedRowSpecs.get(result.skillName)
                // Removal rows report the loss of removing the skill, so the
                // raw gains of having it are negated before the stats pass.
                const raw = ownedSpec?.negate
                    ? result.rawResults.map((x) => -x)
                    : result.rawResults
                skillData.rawResults.push(...raw)
                if (!reportedSampleSize) {
                    reportedSampleSize = true
                    const actual = result.rawResults.length
                    if (actual < numSims) {
                        onProgress({
                            type: 'info',
                            info: `Ran ${actual} simulations per skill (requested ${numSims}; per-combination batching rounds down).`,
                        })
                    }
                }
                const skillResult = calculateStatsFromRawResults(
                    skillData.rawResults,
                    skillData.cost,
                    skillData.discount,
                    skillData.skillName,
                    confidenceInterval,
                )
                if (ownedSpec) {
                    skillResult.owned = true
                    skillResult.ownedAction = ownedSpec.action
                    skillResult.hasCost = ownedSpec.hasCost
                }
                computedResults.set(result.skillName, skillResult)
                onProgress({ type: 'result', result: skillResult })
            }
        }
    }

    const finalResults = [...computedResults.values()].sort(
        (a, b) => b.meanLengthPerCost - a.meanLengthPerCost,
    )
    onProgress({ type: 'complete', results: finalResults })
}
