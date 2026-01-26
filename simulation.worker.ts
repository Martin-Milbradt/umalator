import { parentPort, workerData } from 'node:worker_threads'
import type { Mood } from '../uma-tools/uma-skill-tools/RaceParameters'
import {
    type HorseState,
    SkillSet,
} from '../uma-tools/components/HorseDefTypes'
import { runComparison } from '../uma-tools/umalator/compare'
import skillmeta from '../uma-tools/skill_meta.json'
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

function runSkillSimulation(task: SimulationTask) {
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
        // Build all unique combinations of variable parameters.
        // NOTE: When combinations exceed requested simulations, each combination gets at least
        // 1 simulation for full coverage. This ensures representative sampling across all
        // conditions but may result in more simulations than requested.
        const moods: Mood[] = task.useRandomMood
            ? [-2, -1, 0, 1, 2]
            : [task.baseUma.mood as Mood]
        const seasons = task.useRandomSeason
            ? (task.weightedSeasons ?? [task.racedef.season])
            : [task.racedef.season]
        const weathers = task.useRandomWeather
            ? (task.weightedWeathers ?? [task.racedef.weather])
            : [task.racedef.weather]
        const conditions = task.useRandomCondition
            ? (task.weightedConditions ?? [task.racedef.groundCondition])
            : [task.racedef.groundCondition]

        // Generate all combinations
        interface Combination {
            course: (typeof courses)[0]
            mood: Mood
            season: number
            weather: number
            condition: number
        }
        const combinations: Combination[] = []
        for (const course of courses) {
            for (const mood of moods) {
                for (const season of seasons) {
                    for (const weather of weathers) {
                        for (const condition of conditions) {
                            combinations.push({
                                course,
                                mood,
                                season,
                                weather,
                                condition,
                            })
                        }
                    }
                }
            }
        }

        // Distribute simulations across combinations
        // Each combination gets at least 1 simulation, with extras distributed evenly
        const numCombinations = combinations.length
        const baseSimsPerCombo = Math.max(
            1,
            Math.floor(task.numSimulations / numCombinations),
        )
        let remainingExtras = Math.max(
            0,
            task.numSimulations - baseSimsPerCombo * numCombinations,
        )

        const baseUma = createHorseState(task.baseUma, baseSkillIds)
        const umaWithSkill = createHorseState(task.baseUma, filteredSkillIds)
        let seedOffset = 0

        for (const combo of combinations) {
            // Give one extra simulation to early combinations if we have remainders
            const simsForThisCombo =
                baseSimsPerCombo + (remainingExtras > 0 ? 1 : 0)
            if (remainingExtras > 0) remainingExtras--

            const racedefForSim = {
                ...task.racedef,
                mood: combo.mood,
                season: combo.season,
                weather: combo.weather,
                groundCondition: combo.condition,
            }

            const comboSimOptions = { ...task.simOptions }
            if (
                comboSimOptions.seed !== undefined &&
                comboSimOptions.seed !== null
            ) {
                comboSimOptions.seed = comboSimOptions.seed + seedOffset
            }
            seedOffset += simsForThisCombo

            const { results: comboResults } = runComparison(
                simsForThisCombo,
                combo.course,
                racedefForSim,
                baseUma,
                umaWithSkill,
                comboSimOptions,
            )
            results.push(...comboResults)
        }
    } else {
        const baseUma = createHorseState(task.baseUma, baseSkillIds)
        const umaWithSkill = createHorseState(task.baseUma, filteredSkillIds)
        const { results: batchResults } = runComparison(
            task.numSimulations,
            courses[0],
            task.racedef,
            baseUma,
            umaWithSkill,
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

if (parentPort && workerData) {
    try {
        const result = runSkillSimulation(workerData as SimulationTask)
        parentPort.postMessage({ success: true, result })
    } catch (error) {
        parentPort.postMessage({ success: false, error: String(error) })
    }
}
