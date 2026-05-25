import { ensureSaved } from './configManager'
import { renderResultsTable, setRunSelectiveCalculations } from './resultsUI'
import {
    BrowserSimulationRunner,
    type SimulationRunnerConfig,
    type StaticData,
} from './simulationRunner'
import {
    getCalculatedResultsCache,
    getCourseData,
    getCurrentConfig,
    getResultsMap,
    getSelectedSkills,
    getSkillData,
    getSkillmeta,
    getSkillnames,
    getTrackNames,
    setLastCalculationTime,
} from './state'
import { showToast } from './toast'
import type { Config, SkillResult } from './types'

/**
 * Narrows a UI Config (which has optional track/uma) to the shape the
 * runner needs. The runner does its own runtime validation, so this
 * guard exists purely so the call site doesn't need an `as unknown as`
 * cast -- the runner will still produce a clean error event if a
 * required field is missing once it actually runs.
 */
function assertRunnable(config: Config): SimulationRunnerConfig {
    if (!config.track) {
        throw new Error('Config is missing track settings')
    }
    if (!config.uma) {
        throw new Error('Config is missing uma settings')
    }
    return config as SimulationRunnerConfig
}

function getStaticData(): StaticData {
    const skillMeta = getSkillmeta()
    const skillNames = getSkillnames()
    const skillData = getSkillData()
    const courseData = getCourseData()
    const trackNames = getTrackNames()

    if (!skillMeta || !skillNames || !skillData || !courseData || !trackNames) {
        throw new Error('Static data not loaded yet')
    }

    return {
        skillMeta,
        skillNames,
        skillData,
        courseData,
        trackNames,
    }
}

// Vite sets BASE_URL from the `base` config option (defaults to '/')
const BASE_URL = import.meta.env.BASE_URL ?? '/'

function createRunner(config: SimulationRunnerConfig) {
    const staticData = getStaticData()
    return new BrowserSimulationRunner(
        config,
        staticData,
        `${BASE_URL}simulation.browser-worker.js`,
    )
}

export async function runCalculations(): Promise<void> {
    const currentConfig = getCurrentConfig()
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()
    const calculatedResultsCache = getCalculatedResultsCache()

    if (!currentConfig) return
    const button = document.getElementById('run-button') as HTMLButtonElement
    const countEl = document.getElementById('results-count')
    if (!button) return
    button.disabled = true

    if (countEl) countEl.textContent = 'Running calculations...'
    // Keep the existing results visible during the run (#36); stale entries
    // are pruned on completion below.
    const seenSkillNames = new Set<string>()

    await ensureSaved()

    try {
        const runner = createRunner(assertRunnable(currentConfig))

        await runner.run((progress) => {
            if (progress.type === 'phase') {
                if (countEl && progress.phase) {
                    countEl.textContent = progress.phase
                }
            } else if (progress.type === 'info') {
                if (progress.info) {
                    showToast({ type: 'info', message: progress.info })
                }
            } else if (progress.type === 'result' && progress.result) {
                seenSkillNames.add(progress.result.skill)
                calculatedResultsCache.set(
                    progress.result.skill,
                    progress.result,
                )
                resultsMap.set(progress.result.skill, {
                    ...progress.result,
                    status: 'fresh',
                })
                renderResultsTable()
            } else if (progress.type === 'complete') {
                button.disabled = false
                setLastCalculationTime(new Date())

                if (progress.results) {
                    for (const result of progress.results) {
                        seenSkillNames.add(result.skill)
                        calculatedResultsCache.set(result.skill, result)
                        resultsMap.set(result.skill, {
                            ...result,
                            status: 'fresh',
                        })
                    }
                }

                // Drop any entries carried over from the previous run that
                // the new simulation didn't produce a result for.
                for (const skill of [...resultsMap.keys()]) {
                    if (!seenSkillNames.has(skill)) {
                        resultsMap.delete(skill)
                        selectedSkills.delete(skill)
                    }
                }
                for (const skill of [...calculatedResultsCache.keys()]) {
                    if (!seenSkillNames.has(skill)) {
                        calculatedResultsCache.delete(skill)
                    }
                }

                renderResultsTable()
            } else if (progress.type === 'error') {
                button.disabled = false
                showToast({
                    type: 'error',
                    message: progress.error || 'Simulation error',
                })
            }
        })
    } catch (error) {
        const err = error as Error
        button.disabled = false
        showToast({ type: 'error', message: `Error: ${err.message}` })
    }
}

/**
 * Run calculations for specific skills only.
 */
export async function runSelectiveCalculations(
    skillNames: string[],
): Promise<void> {
    const currentConfig = getCurrentConfig()
    const resultsMap = getResultsMap()
    const calculatedResultsCache = getCalculatedResultsCache()

    if (!currentConfig || skillNames.length === 0) return

    await ensureSaved()

    try {
        const runner = createRunner(assertRunnable(currentConfig))

        await runner.run((progress) => {
            if (progress.type === 'result' && progress.result) {
                calculatedResultsCache.set(
                    progress.result.skill,
                    progress.result,
                )
                resultsMap.set(progress.result.skill, {
                    ...progress.result,
                    status: 'fresh',
                })
                renderResultsTable()
            } else if (progress.type === 'complete' && progress.results) {
                for (const result of progress.results) {
                    calculatedResultsCache.set(result.skill, result)
                    resultsMap.set(result.skill, {
                        ...result,
                        status: 'fresh',
                    })
                }
                renderResultsTable()
            } else if (progress.type === 'error') {
                console.error('Selective calculation error:', progress.error)
                for (const skillName of skillNames) {
                    const existing = resultsMap.get(skillName)
                    if (existing?.status === 'pending') {
                        resultsMap.set(skillName, {
                            ...existing,
                            status: 'error',
                            errorMessage: progress.error,
                        })
                    }
                }
                renderResultsTable()
            }
        }, skillNames)
    } catch (error) {
        const err = error as Error
        console.error('Selective calculation error:', err)
        showToast({
            type: 'error',
            message: `Calculation failed: ${err.message}`,
        })
    }
}

// Register the selective calculations function with resultsUI to break circular dependency
setRunSelectiveCalculations(runSelectiveCalculations)
