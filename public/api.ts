import { ensureSaved } from './configManager'
import { renderResultsTable, setRunSelectiveCalculations } from './resultsUI'
import {
    getCalculatedResultsCache,
    getCurrentConfigFile,
    getResultsMap,
    getSelectedSkills,
    setLastCalculationTime,
} from './state'
import { showToast } from './toast'
import type { SkillResult } from './types'

export async function runCalculations(clearExisting = true): Promise<void> {
    const currentConfigFile = getCurrentConfigFile()
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()
    const calculatedResultsCache = getCalculatedResultsCache()

    if (!currentConfigFile) return
    const button = document.getElementById('run-button') as HTMLButtonElement
    const countEl = document.getElementById('results-count')
    if (!button) return
    button.disabled = true

    if (clearExisting) {
        // Clear previous results and cache, show calculating state
        resultsMap.clear()
        selectedSkills.clear()
        calculatedResultsCache.clear()
    }
    if (countEl) countEl.textContent = 'Running calculations...'
    renderResultsTable()

    await ensureSaved()

    try {
        const response = await fetch(
            `/api/simulate?configFile=${encodeURIComponent(currentConfigFile)}`,
            {
                method: 'GET',
            },
        )

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        if (!response.body) {
            throw new Error('Response body is null')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
            let result: ReadableStreamReadResult<Uint8Array>
            try {
                result = await reader.read()
            } catch (readError) {
                const err = readError as Error
                console.error('Error reading stream:', readError)
                button.disabled = false
                showToast({
                    type: 'error',
                    message: `Error reading stream: ${err.message}`,
                })
                break
            }

            const { done, value } = result
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6)) as {
                            type: string
                            phase?: string
                            result?: SkillResult
                            results?: SkillResult[]
                            error?: string
                            info?: string
                        }
                        if (data.type === 'started') {
                            // Calculation started
                        } else if (data.type === 'phase') {
                            // Phase update - could show in UI if desired
                            if (countEl && data.phase) {
                                countEl.textContent = data.phase
                            }
                        } else if (data.type === 'info') {
                            // Info message
                            if (data.info) {
                                showToast({ type: 'info', message: data.info })
                            }
                        } else if (data.type === 'result' && data.result) {
                            // Individual skill result - add to map
                            calculatedResultsCache.set(
                                data.result.skill,
                                data.result,
                            )
                            resultsMap.set(data.result.skill, {
                                ...data.result,
                                status: 'fresh',
                            })
                            renderResultsTable()
                        } else if (data.type === 'complete') {
                            button.disabled = false
                            setLastCalculationTime(new Date())

                            // Update with final sorted results
                            if (data.results) {
                                for (const result of data.results) {
                                    calculatedResultsCache.set(
                                        result.skill,
                                        result,
                                    )
                                    resultsMap.set(result.skill, {
                                        ...result,
                                        status: 'fresh',
                                    })
                                }
                            }

                            renderResultsTable()
                        } else if (data.type === 'error') {
                            button.disabled = false
                            showToast({
                                type: 'error',
                                message: data.error || 'Simulation error',
                            })
                        }
                    } catch {
                        // Ignore keepalive messages, log unexpected parse errors
                        if (!line.includes('keepalive')) {
                            console.warn('SSE parse error:', line)
                        }
                    }
                }
            }
        }
    } catch (error) {
        const err = error as Error
        button.disabled = false
        showToast({ type: 'error', message: `Error: ${err.message}` })
    }
}

/**
 * Run calculations for specific skills only.
 * More efficient than runCalculations(false) when only a few skills need updating.
 */
export async function runSelectiveCalculations(skillNames: string[]): Promise<void> {
    const currentConfigFile = getCurrentConfigFile()
    const resultsMap = getResultsMap()
    const calculatedResultsCache = getCalculatedResultsCache()

    if (!currentConfigFile || skillNames.length === 0) return

    await ensureSaved()

    try {
        const skillsParam = encodeURIComponent(skillNames.join(','))
        const response = await fetch(
            `/api/simulate?configFile=${encodeURIComponent(currentConfigFile)}&skills=${skillsParam}`,
            { method: 'GET' },
        )

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        if (!response.body) {
            throw new Error('Response body is null')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
            let result: ReadableStreamReadResult<Uint8Array>
            try {
                result = await reader.read()
            } catch (readError) {
                const err = readError as Error
                console.error('Error reading stream:', readError)
                showToast({
                    type: 'error',
                    message: `Error reading stream: ${err.message}`,
                })
                break
            }

            if (result.done) break

            const chunk = decoder.decode(result.value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6))
                        if (data.type === 'result' && data.result) {
                            calculatedResultsCache.set(
                                data.result.skill,
                                data.result,
                            )
                            resultsMap.set(data.result.skill, {
                                ...data.result,
                                status: 'fresh',
                            })
                            renderResultsTable()
                        } else if (data.type === 'batch' && data.results) {
                            for (const result of data.results) {
                                calculatedResultsCache.set(result.skill, result)
                                resultsMap.set(result.skill, {
                                    ...result,
                                    status: 'fresh',
                                })
                            }
                            renderResultsTable()
                        } else if (data.type === 'error') {
                            console.error(
                                'Selective calculation error:',
                                data.error,
                            )
                            // Mark skills as error state
                            for (const skillName of skillNames) {
                                const existing = resultsMap.get(skillName)
                                if (existing?.status === 'pending') {
                                    resultsMap.set(skillName, {
                                        ...existing,
                                        status: 'error',
                                        errorMessage: data.error,
                                    })
                                }
                            }
                            renderResultsTable()
                        }
                    } catch {
                        // Ignore keepalive messages, log unexpected parse errors
                        if (!line.includes('keepalive')) {
                            console.warn('SSE parse error:', line)
                        }
                    }
                }
            }
        }
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
