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
import type { SkillResult } from './types'

function getStaticData() {
    const skillMeta = getSkillmeta()
    const skillNames = getSkillnames()
    const skillData = getSkillData()
    const courseData = getCourseData()
    const trackNames = getTrackNames()

    if (!skillMeta || !skillNames || !skillData || !courseData || !trackNames) {
        throw new Error('Static data not loaded yet')
    }

    // Cast needed: frontend SkillMeta has optional baseCost, root types.ts requires it
    return {
        skillMeta,
        skillNames,
        skillData,
        courseData,
        trackNames,
    } as unknown as StaticData
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

export async function runCalculations(clearExisting = true): Promise<void> {
    const currentConfig = getCurrentConfig()
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()
    const calculatedResultsCache = getCalculatedResultsCache()

    if (!currentConfig) return
    const button = document.getElementById('run-button') as HTMLButtonElement
    const countEl = document.getElementById('results-count')
    if (!button) return
    button.disabled = true

    if (clearExisting) {
        resultsMap.clear()
        selectedSkills.clear()
        calculatedResultsCache.clear()
    }
    if (countEl) countEl.textContent = 'Running calculations...'
    renderResultsTable()

    await ensureSaved()

    try {
        const runner = createRunner(currentConfig as unknown as SimulationRunnerConfig)

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
                        calculatedResultsCache.set(result.skill, result)
                        resultsMap.set(result.skill, {
                            ...result,
                            status: 'fresh',
                        })
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
        const runner = createRunner(currentConfig as unknown as SimulationRunnerConfig)

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
