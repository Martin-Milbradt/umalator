import { parentPort, workerData } from 'node:worker_threads'
import type { Mood } from '../uma-tools/uma-skill-tools/RaceParameters'
import {
    HorseState as HorseStateBase,
    SkillSet,
} from '../uma-tools/components/HorseDefTypes'
import { runComparison } from '../uma-tools/umalator/compare'
import skillmeta from '../uma-tools/skill_meta.json'
import type { SimulationTask, HorseStateData } from './types'

/**
 * HorseState from uma-tools extends immutable.js Record.
 * TypeScript cannot properly infer types across the boundary,
 * so we cast it to a compatible interface for construction.
 */
interface HorseStateInstance {
    set(key: string, value: unknown): HorseStateInstance
}
const HorseState = HorseStateBase as unknown as new (
    props: HorseStateData & { mood?: Mood },
) => HorseStateInstance

/** Type alias for uma-tools HorseState (used for casting in function calls). */
type UmaToolsHorseState = typeof HorseStateBase extends new (
    ...args: unknown[]
) => infer R
    ? R
    : never

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
        const moods: Mood[] = [-2, -1, 0, 1, 2]
        const seasons = task.weightedSeasons ?? [task.racedef.season]
        const weathers = task.weightedWeathers ?? [task.racedef.weather]
        const conditions = task.weightedConditions ?? [
            task.racedef.groundCondition,
        ]

        for (let i = 0; i < task.numSimulations; i++) {
            const course = courses[i % numCourses]
            const mood = task.useRandomMood
                ? moods[i % moods.length]
                : (task.baseUma.mood as Mood)
            const season = task.useRandomSeason
                ? seasons[i % seasons.length]
                : task.racedef.season
            const weather = task.useRandomWeather
                ? weathers[i % weathers.length]
                : task.racedef.weather
            const condition = task.useRandomCondition
                ? conditions[i % conditions.length]
                : task.racedef.groundCondition

            const racedefForSim = {
                ...task.racedef,
                season,
                weather,
                groundCondition: condition,
            }

            const baseUma = new HorseState({ ...task.baseUma, mood: mood }).set(
                'skills',
                SkillSet(baseSkillIds),
            )
            const umaWithSkill = new HorseState({
                ...task.baseUma,
                mood: mood,
            }).set('skills', SkillSet(filteredSkillIds))
            const singleSimOptions = { ...task.simOptions }
            if (
                singleSimOptions.seed !== undefined &&
                singleSimOptions.seed !== null
            ) {
                singleSimOptions.seed = singleSimOptions.seed + i
            }
            const { results: singleResults } = runComparison(
                1,
                course,
                racedefForSim,
                baseUma as unknown as UmaToolsHorseState,
                umaWithSkill as unknown as UmaToolsHorseState,
                singleSimOptions,
            )
            results.push(singleResults[0])
        }
    } else {
        const baseUma = new HorseState(task.baseUma).set(
            'skills',
            SkillSet(baseSkillIds),
        )
        const umaWithSkill = new HorseState(task.baseUma).set(
            'skills',
            SkillSet(filteredSkillIds),
        )
        const { results: batchResults } = runComparison(
            task.numSimulations,
            courses[0],
            task.racedef,
            baseUma as unknown as UmaToolsHorseState,
            umaWithSkill as unknown as UmaToolsHorseState,
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
