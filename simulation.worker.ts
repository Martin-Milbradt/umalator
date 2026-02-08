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
        // Build weighted arrays for each random dimension, then randomly sample
        // exactly numSimulations combinations (avoiding Cartesian product explosion).
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

        // Randomly sample exactly numSimulations combinations, respecting weighted distributions.
        // Group identical combos so runComparison can batch them with nsamples > 1.
        interface GroupedCombo {
            courseIndex: number
            mood: Mood
            season: number
            weather: number
            condition: number
            count: number
        }
        const grouped = new Map<string, GroupedCombo>()

        for (let i = 0; i < task.numSimulations; i++) {
            const courseIndex = Math.floor(Math.random() * numCourses)
            const mood = moods[Math.floor(Math.random() * moods.length)]
            const season = seasons[Math.floor(Math.random() * seasons.length)]
            const weather =
                weathers[Math.floor(Math.random() * weathers.length)]
            const condition =
                conditions[Math.floor(Math.random() * conditions.length)]

            const key = `${courseIndex}|${mood}|${season}|${weather}|${condition}`
            const existing = grouped.get(key)
            if (existing) {
                existing.count++
            } else {
                grouped.set(key, {
                    courseIndex,
                    mood,
                    season,
                    weather,
                    condition,
                    count: 1,
                })
            }
        }

        const baseUma = createHorseState(task.baseUma, baseSkillIds)
        const umaWithSkill = createHorseState(task.baseUma, filteredSkillIds)
        let seedOffset = 0

        // Ensure nsamples > 1 per runComparison call to preserve internal
        // variance from trigger position sampling. With nsamples=1, skills
        // with low activation rates (e.g. phase-1-only triggers) frequently
        // produce all-zero results because the single trigger position may
        // not land in the skill's activation region.
        const MIN_SAMPLES_PER_COMBO = 2

        for (const combo of grouped.values()) {
            const racedefForSim = {
                ...task.racedef,
                mood: combo.mood,
                season: combo.season,
                weather: combo.weather,
                groundCondition: combo.condition,
            }

            const effectiveSamples = Math.max(combo.count, MIN_SAMPLES_PER_COMBO)
            const comboSimOptions = { ...task.simOptions }
            if (
                comboSimOptions.seed !== undefined &&
                comboSimOptions.seed !== null
            ) {
                comboSimOptions.seed = comboSimOptions.seed + seedOffset
            }
            seedOffset += effectiveSamples

            const { results: comboResults } = runComparison(
                effectiveSamples,
                courses[combo.courseIndex],
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
