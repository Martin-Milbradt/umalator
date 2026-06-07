import { parentPort, workerData } from 'node:worker_threads'
import type { Mood } from './uma-tools/uma-skill-tools/RaceParameters'
import {
    type HorseState,
    SkillSet,
} from './uma-tools/components/HorseDefTypes'
import { runComparison } from './uma-tools/umalator/compare'
import skillmetaRaw from './uma-tools/skill_meta.json'
import type { SimulationTask, HorseStateData } from './types'

// The JSON import is typed as a giant object literal with one property per
// skill id, so indexing it with a runtime string id is an implicit-any error.
// Re-view it as a record keyed by skill id.
const skillmeta = skillmetaRaw as Record<
    string,
    { baseCost: number; groupId: string; iconId: string; order: number; score: number }
>

// Mirrors uma-tools DEFAULT_HORSE_STATE: 4×S then 6×A across the aptitude
// spreads. Used when a serialized HorseState omits aptitudes.
const DEFAULT_APTITUDES = ['S', 'S', 'S', 'S', 'A', 'A', 'A', 'A', 'A', 'A']

/**
 * Creates a HorseState object compatible with uma-tools runComparison.
 * mood and popularity live here (HorseParameters) since uma-skill-tools 24f0a88.
 */
function createHorseState(
    props: HorseStateData,
    skillIds: string[],
): HorseState {
    return {
        outfitId: '',
        starCount: (props.starCount ?? 3) as HorseState['starCount'],
        speed: props.speed,
        stamina: props.stamina,
        power: props.power,
        guts: props.guts,
        wisdom: props.wisdom,
        mood: (props.mood ?? 2) as HorseState['mood'],
        popularity: props.popularity ?? 1,
        strategy: props.strategy as HorseState['strategy'],
        distanceAptitude:
            props.distanceAptitude as HorseState['distanceAptitude'],
        surfaceAptitude: props.surfaceAptitude as HorseState['surfaceAptitude'],
        strategyAptitude:
            props.strategyAptitude as HorseState['strategyAptitude'],
        // HorseState['aptitudes'] is declared `Aptitude[10]` upstream, which TS
        // collapses to the indexed type `Aptitude` (a bare string) rather than a
        // 10-tuple, so an array can't be assigned without a double cast. The
        // runtime value is the correct 10-element array; this is the one
        // uma-tools impedance point we cannot type away.
        aptitudes: (props.aptitudes ??
            DEFAULT_APTITUDES) as unknown as HorseState['aptitudes'],
        skills: SkillSet(skillIds),
        samplePolicies: new Map(),
    }
}

/**
 * Converts skills from HorseStateData to an array of skill IDs.
 * Skills can be either an array (direct) or a Record (from immutable Map serialization).
 */
function convertSkillsToArray(skills: HorseStateData['skills']): string[] {
    if (Array.isArray(skills)) {
        return skills
    }
    if (skills && typeof skills === 'object') {
        return Object.values(skills)
    }
    return []
}

export function runSkillSimulation(task: SimulationTask) {
    const results: number[] = []
    const courses = task.courses
    const numCourses = courses.length
    if (numCourses === 0) {
        throw new Error('runSkillSimulation requires at least one course')
    }

    // Convert serialized skills object to array of skill IDs
    const baseSkillIds = convertSkillsToArray(task.baseUma.skills)
    const skillIdsWithNewSkill = [...baseSkillIds]
    const newSkillGroupId = skillmeta[task.skillId]?.groupId
    // Remove any existing skill with the same groupId and add the new one
    const filteredSkillIds = skillIdsWithNewSkill.filter(
        (id) => skillmeta[id]?.groupId !== newSkillGroupId,
    )
    filteredSkillIds.push(task.skillId)

    // When using multiple courses, run simulations cycling through courses for fair comparison
    // This ensures all skills run on the same track sequence (simulation i uses course i % numCourses)
    const usePerSimulationMode =
        task.useRandomMood ||
        numCourses > 1 ||
        task.useRandomSeason ||
        task.useRandomWeather ||
        task.useRandomCondition

    if (usePerSimulationMode) {
        const budget = task.numSimulations
        const MIN_NSAMPLES = 25

        // Step 1: All tracks (no cap)
        const numTracks = numCourses

        // Step 2: Sims per track
        const simsPerTrack = Math.max(
            Math.floor(budget / numTracks),
            MIN_NSAMPLES,
        )

        // Step 3: Combos per track
        const distinctPerDim = [
            task.useRandomMood ? 5 : 1,
            task.useRandomSeason ? 4 : 1,
            task.useRandomWeather ? 4 : 1,
            task.useRandomCondition ? 4 : 1,
        ]
        const distinctCombos = distinctPerDim.reduce((a, b) => a * b, 1)
        const hasRandomConditions = distinctCombos > 1
        const combosPerTrack = hasRandomConditions
            ? Math.min(
                  distinctCombos,
                  Math.max(Math.floor(simsPerTrack / MIN_NSAMPLES), 1),
              )
            : 1
        const nsamplesPerCombo = Math.floor(
            simsPerTrack / Math.max(combosPerTrack, 1),
        )

        // Step 4: Generate representative values globally
        const totalCombos = numTracks * combosPerTrack
        const moodPool: Mood[] = task.useRandomMood
            ? [-2, -1, 0, 1, 2]
            : [(task.baseUma.mood ?? 2) as Mood]
        const seasonPool = task.useRandomSeason
            ? (task.weightedSeasons ?? [task.racedef.season])
            : [task.racedef.season]
        const weatherPool = task.useRandomWeather
            ? (task.weightedWeathers ?? [task.racedef.weather])
            : [task.racedef.weather]
        const conditionPool = task.useRandomCondition
            ? (task.weightedConditions ?? [task.racedef.groundCondition])
            : [task.racedef.groundCondition]

        const globalMoods = generateRepresentative(totalCombos, moodPool)
        const globalSeasons = generateRepresentative(totalCombos, seasonPool)
        const globalWeathers = generateRepresentative(
            totalCombos,
            weatherPool,
        )
        const globalConditions = generateRepresentative(
            totalCombos,
            conditionPool,
        )
        // Skip the cosmetic shuffle when running under a pinned seed -- it
        // uses Math.random() directly and would otherwise randomize the
        // combo->track mapping run to run, defeating determinism.
        if (task.simOptions.seed == null) {
            shuffleInPlace(globalMoods)
            shuffleInPlace(globalSeasons)
            shuffleInPlace(globalWeathers)
            shuffleInPlace(globalConditions)
        }

        // generateRepresentative already produces a pool whose counts are
        // proportional to the input weights, so the unweighted distribution
        // of raw results across combos already reflects the desired
        // weighting -- no per-combo weight factor is needed.
        let seedOffset = 0
        let comboIdx = 0
        for (let t = 0; t < numTracks; t++) {
            for (let c = 0; c < combosPerTrack; c++) {
                const mood = globalMoods[comboIdx]! as Mood
                const season = globalSeasons[comboIdx]!
                const weather = globalWeathers[comboIdx]!
                const condition = globalConditions[comboIdx]!
                comboIdx++

                const baseUma = createHorseState({ ...task.baseUma, mood }, baseSkillIds)
                const umaWithSkill = createHorseState({ ...task.baseUma, mood }, filteredSkillIds)
                const racedefForSim = {
                    ...task.racedef,
                    season,
                    weather,
                    groundCondition: condition,
                }
                const comboSeed = task.simOptions.seed != null
                    ? task.simOptions.seed + seedOffset
                    : Math.floor(Math.random() * 1000000000)
                seedOffset += nsamplesPerCombo

                const { results: comboResults } = runComparison(
                    nsamplesPerCombo,
                    courses[t]!,
                    racedefForSim,
                    baseUma,
                    umaWithSkill,
                    [comboSeed, 0],
                    task.simOptions,
                )
                results.push(...comboResults)
            }
        }

        return { skillName: task.skillName, rawResults: results }
    }
    const baseUma = createHorseState(task.baseUma, baseSkillIds)
    const umaWithSkill = createHorseState(task.baseUma, filteredSkillIds)
    const batchSeed = task.simOptions.seed != null
        ? task.simOptions.seed
        : Math.floor(Math.random() * 1000000000)
    const { results: batchResults } = runComparison(
        task.numSimulations,
        courses[0]!,
        task.racedef,
        baseUma,
        umaWithSkill,
        [batchSeed, 0],
        task.simOptions,
    )
    results.push(...batchResults)
    return { skillName: task.skillName, rawResults: results }
}

/**
 * Generate n values representative of the weighted distribution.
 *
 * When n >= the number of distinct values, every distinct value appears at
 * least once and the remaining slots are apportioned by weight
 * (largest-remainder), so the tail is never dropped. When n < distinct (only
 * possible with a very small budget, e.g. a low CLI --sims with several random
 * dimensions), n slots cannot hold every value, so we keep the n most probable
 * — the least-biased deterministic choice for too few slots.
 *
 * Exported for unit testing.
 */
export function generateRepresentative<T>(n: number, weightedPool: T[]): T[] {
    if (n <= 0) return []
    const counts = new Map<T, number>()
    for (const v of weightedPool) counts.set(v, (counts.get(v) ?? 0) + 1)
    const total = weightedPool.length
    const entries = [...counts.entries()]
    if (n >= entries.length) {
        // Ensure at least 1 of each, distribute rest by weight
        const result: T[] = entries.map(([val]) => val)
        const remaining = n - entries.length
        const allocations = entries.map(([val, count]) => ({
            val,
            ideal: (count / total) * remaining,
            floor: Math.floor((count / total) * remaining),
        }))
        for (const a of allocations) {
            for (let i = 0; i < a.floor; i++) result.push(a.val)
        }
        let leftover = n - result.length
        allocations.sort((a, b) => b.ideal - b.floor - (a.ideal - a.floor))
        for (let i = 0; i < leftover; i++) result.push(allocations[i]!.val)
        return result
    }
    // n < distinct values: pick the n most probable
    entries.sort((a, b) => b[1] - a[1])
    return entries.slice(0, n).map(([val]) => val)
}

/** Fisher-Yates shuffle in place. */
function shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
    }
}

if (parentPort && workerData) {
    try {
        const result = runSkillSimulation(workerData as SimulationTask)
        parentPort.postMessage({ success: true, result })
    } catch (error) {
        parentPort.postMessage({ success: false, error: String(error) })
    }
}
