import { parentPort, workerData } from 'node:worker_threads'
import type { Mood } from './uma-tools/uma-skill-tools/RaceParameters'
import {
    type HorseState,
    SkillSet,
} from './uma-tools/components/HorseDefTypes'
import { runComparison } from './uma-tools/umalator/compare'
import skillmeta from './uma-tools/skill_meta.json'
import type { SimulationTask, HorseStateData } from './types'

/**
 * Creates a HorseState object compatible with uma-tools runComparison.
 */
function createHorseState(
    props: HorseStateData & { mood?: Mood },
    skillIds: string[],
): HorseState {
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
        skills: SkillSet(skillIds),
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
            : [task.racedef.mood as Mood]
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
        shuffleInPlace(globalMoods)
        shuffleInPlace(globalSeasons)
        shuffleInPlace(globalWeathers)
        shuffleInPlace(globalConditions)

        // Step 5: Compute probability maps for weighting
        const moodProbs = computeProbs(moodPool)
        const seasonProbs = computeProbs(seasonPool)
        const weatherProbs = computeProbs(weatherPool)
        const conditionProbs = computeProbs(conditionPool)

        const baseUma = createHorseState(task.baseUma, baseSkillIds)
        const umaWithSkill = createHorseState(task.baseUma, filteredSkillIds)
        let seedOffset = 0

        // Step 6: Run combos with global rotation
        const weightedResults: { value: number; weight: number }[] = []
        let comboIdx = 0
        for (let t = 0; t < numTracks; t++) {
            for (let c = 0; c < combosPerTrack; c++) {
                const mood = globalMoods[comboIdx] as Mood
                const season = globalSeasons[comboIdx]
                const weather = globalWeathers[comboIdx]
                const condition = globalConditions[comboIdx]
                comboIdx++

                const comboWeight =
                    (1 / numTracks) *
                    (task.useRandomMood
                        ? (moodProbs.get(mood) ?? 0.2)
                        : 1) *
                    (task.useRandomSeason
                        ? (seasonProbs.get(season) ?? 0.25)
                        : 1) *
                    (task.useRandomWeather
                        ? (weatherProbs.get(weather) ?? 0.25)
                        : 1) *
                    (task.useRandomCondition
                        ? (conditionProbs.get(condition) ?? 0.25)
                        : 1)

                const racedefForSim = {
                    ...task.racedef,
                    mood,
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
                    courses[t],
                    racedefForSim,
                    baseUma,
                    umaWithSkill,
                    [comboSeed, 0],
                    task.simOptions,
                )
                for (const v of comboResults) {
                    weightedResults.push({ value: v, weight: comboWeight })
                }
            }
        }

        // Step 7: Weighted statistics
        return computeWeightedStats(weightedResults, task)
    } else {
        const baseUma = createHorseState(task.baseUma, baseSkillIds)
        const umaWithSkill = createHorseState(task.baseUma, filteredSkillIds)
        const batchSeed = task.simOptions.seed != null
            ? task.simOptions.seed
            : Math.floor(Math.random() * 1000000000)
        const { results: batchResults } = runComparison(
            task.numSimulations,
            courses[0],
            task.racedef,
            baseUma,
            umaWithSkill,
            [batchSeed, 0],
            task.simOptions,
        )
        results.push(...batchResults)
    }

    results.sort((a, b) => a - b)
    const mean = results.reduce((a, b) => a + b, 0) / results.length
    const min = results[0]
    const max = results[results.length - 1]

    // Calculate median (results are sorted)
    const mid = Math.floor(results.length / 2)
    const median =
        results.length % 2 === 0
            ? (results[mid - 1] + results[mid]) / 2
            : results[mid]

    // Calculate confidence interval based on configured percentage
    const ciPercent = task.confidenceInterval ?? 95
    const lowerPercentile = (100 - ciPercent) / 2
    const upperPercentile = 100 - lowerPercentile
    const lower_Index = Math.floor(results.length * (lowerPercentile / 100))
    const upper_Index = Math.floor(results.length * (upperPercentile / 100))
    const ciLower = results[lower_Index]
    const ciUpper = results[upper_Index]

    if (task.returnRawResults) {
        return {
            skillName: task.skillName,
            rawResults: results,
        }
    }

    return {
        skillName: task.skillName,
        mean,
        median,
        min,
        max,
        ciLower,
        ciUpper,
    }
}

/**
 * Generate n values representative of the weighted distribution.
 * Guarantees at least 1 of each distinct value when n >= distinctCount.
 */
function generateRepresentative<T>(n: number, weightedPool: T[]): T[] {
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
        for (let i = 0; i < leftover; i++) result.push(allocations[i].val)
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
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
}

/** Compute probability map from a weighted pool. */
function computeProbs<T>(pool: T[]): Map<T, number> {
    const counts = new Map<T, number>()
    for (const v of pool) counts.set(v, (counts.get(v) ?? 0) + 1)
    const probs = new Map<T, number>()
    for (const [k, c] of counts) probs.set(k, c / pool.length)
    return probs
}

/** Compute weighted statistics from (value, weight) pairs. */
function computeWeightedStats(
    weightedResults: { value: number; weight: number }[],
    task: SimulationTask,
) {
    const totalWeight = weightedResults.reduce((a, r) => a + r.weight, 0)
    const mean =
        weightedResults.reduce((a, r) => a + r.value * r.weight, 0) /
        totalWeight

    // Sort by value for percentile calculations
    weightedResults.sort((a, b) => a.value - b.value)

    // Weighted median: value where cumulative weight reaches 50%
    let cumWeight = 0
    let median = weightedResults[0]?.value ?? 0
    for (const r of weightedResults) {
        cumWeight += r.weight
        if (cumWeight >= totalWeight * 0.5) {
            median = r.value
            break
        }
    }

    const min = weightedResults[0]?.value ?? 0
    const max = weightedResults[weightedResults.length - 1]?.value ?? 0

    // Weighted confidence interval
    const ciPercent = task.confidenceInterval ?? 95
    const lowerP = (100 - ciPercent) / 200
    const upperP = 1 - lowerP
    let ciLower = min
    let ciUpper = max
    cumWeight = 0
    for (const r of weightedResults) {
        cumWeight += r.weight
        if (ciLower === min && cumWeight >= totalWeight * lowerP)
            ciLower = r.value
        if (cumWeight >= totalWeight * upperP) {
            ciUpper = r.value
            break
        }
    }

    if (task.returnRawResults) {
        return {
            skillName: task.skillName,
            rawResults: weightedResults.map((r) => r.value),
        }
    }
    return { skillName: task.skillName, mean, median, min, max, ciLower, ciUpper }
}

if (parentPort && workerData) {
    try {
        const result = runSkillSimulation(workerData as SimulationTask)
        parentPort.postMessage({ success: true, result })
    } catch (error) {
        parentPort.postMessage({ success: false, error: String(error) })
    }
}
