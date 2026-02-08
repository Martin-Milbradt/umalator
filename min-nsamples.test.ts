import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    SimulationRunner,
    type SimulationProgress,
} from './simulation-runner'

const DATA_DIR = resolve(__dirname, '../uma-tools/umalator-global')
const loadJson = (name: string) =>
    JSON.parse(readFileSync(resolve(DATA_DIR, name), 'utf8'))

describe('minimum nsamples per combo', () => {
    const staticData = {
        skillMeta: loadJson('skill_meta.json'),
        skillNames: loadJson('skillnames.json'),
        skillData: loadJson('skill_data.json'),
        courseData: loadJson('course_data.json'),
        trackNames: loadJson('tracknames.json'),
    }

    const workerPath = new URL(
        'file:///' +
            resolve(__dirname, 'simulation.worker.js').replace(/\\/g, '/'),
    )

    it('should produce non-zero results for low-activation skills across multiple runs', async () => {
        const config = JSON.parse(
            readFileSync(resolve(__dirname, 'configs/HU.json'), 'utf8'),
        )

        // Run the simulation 5 times and check that at least some produce
        // non-zero max for "It's On!" in the first 100-sim pass.
        let nonZeroFirstPassCount = 0
        const runs = 5

        for (let run = 0; run < runs; run++) {
            let firstPassItsOn: { maxLength: number } | null = null

            const runner = new SimulationRunner(
                config,
                staticData,
                workerPath,
            )

            await runner.run(
                (p: SimulationProgress) => {
                    if (
                        p.type === 'result' &&
                        p.result?.skill === "It's On!" &&
                        !firstPassItsOn
                    ) {
                        firstPassItsOn = { maxLength: p.result.maxLength }
                    }
                },
                ["It's On!"],
            )

            if (firstPassItsOn && firstPassItsOn.maxLength > 0) {
                nonZeroFirstPassCount++
            }
        }

        // With the fix (MIN_SAMPLES_PER_COMBO=2), the probability of all-zero
        // in 100 sims should be much lower. Across 5 runs, we should see
        // non-zero results in most runs.
        expect(nonZeroFirstPassCount).toBeGreaterThanOrEqual(3)
    }, 60000)

    it('should produce valid results for both skills', async () => {
        const config = JSON.parse(
            readFileSync(resolve(__dirname, 'configs/HU.json'), 'utf8'),
        )

        const runner = new SimulationRunner(config, staticData, workerPath)

        let finalResults: SimulationProgress['results'] | undefined

        await runner.run(
            (p: SimulationProgress) => {
                if (p.type === 'complete') {
                    finalResults = p.results
                }
            },
            ["It's On!", 'Ramp Up'],
        )

        expect(finalResults).toBeDefined()
        expect(finalResults!.length).toBe(2)

        for (const result of finalResults!) {
            expect(result.meanLength).toBeGreaterThanOrEqual(0)
            expect(result.minLength).toBeLessThanOrEqual(result.maxLength)
        }
    }, 60000)
})
