import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RawCourseData, SimulationTask, SkillMeta } from './types'
import type { SkillDataEntry } from './utils'
import {
    DEFAULT_NUM_SIMULATIONS,
    type SimulationProgress,
    type SimulationRunnerConfig,
    type StaticData,
    type WorkerAdapter,
    runSimulation,
} from './shared/simulation-orchestrator'

function loadStaticData(): StaticData {
    const dir = resolve('uma-tools/umalator-global')
    const read = <T>(file: string): T =>
        JSON.parse(readFileSync(`${dir}/${file}`, 'utf-8')) as T
    return {
        courseData: read<Record<string, RawCourseData>>('course_data.json'),
        skillData: read<Record<string, SkillDataEntry>>('skill_data.json'),
        skillMeta: read<Record<string, SkillMeta>>('skill_meta.json'),
        skillNames: read<Record<string, string[]>>('skillnames.json'),
        trackNames: read<Record<string, string[]>>('tracknames.json'),
    }
}

const staticData = loadStaticData()

function baseConfig(
    overrides: Partial<SimulationRunnerConfig> = {},
): SimulationRunnerConfig {
    return {
        skills: { Concentration: { discount: 0 } },
        track: {
            trackName: 'Tokyo',
            distance: 1600,
            surface: 'Turf',
            groundCondition: 'Firm',
            weather: 'Sunny',
            season: 'Spring',
        },
        uma: { strategy: 'End Closer' },
        ...overrides,
    }
}

/**
 * WorkerAdapter that records the tasks it is handed and returns canned results,
 * so the shared orchestration is exercised without spawning real workers.
 */
function fakeAdapter(samplesFor: (task: SimulationTask) => number): {
    adapter: WorkerAdapter
    tasks: SimulationTask[]
} {
    const tasks: SimulationTask[] = []
    const adapter: WorkerAdapter = {
        concurrency: () => 4,
        runTask: (task) => {
            tasks.push(task)
            const n = samplesFor(task)
            return Promise.resolve({
                skillName: task.skillName,
                rawResults: Array.from({ length: n }, (_, i) => (i % 5) - 2),
            })
        },
    }
    return { adapter, tasks }
}

async function collect(
    config: SimulationRunnerConfig,
    adapter: WorkerAdapter,
): Promise<SimulationProgress[]> {
    const events: SimulationProgress[] = []
    await runSimulation(config, staticData, (p) => events.push(p), adapter)
    return events
}

describe('runSimulation orchestration', () => {
    it('defaults to DEFAULT_NUM_SIMULATIONS when the config omits a count', async () => {
        const { adapter, tasks } = fakeAdapter((t) => t.numSimulations)
        await collect(baseConfig(), adapter)
        expect(tasks.length).toBeGreaterThan(0)
        for (const task of tasks) {
            expect(task.numSimulations).toBe(DEFAULT_NUM_SIMULATIONS)
        }
    })

    it('respects an explicit numSimulations (the browser path used to ignore it)', async () => {
        const { adapter, tasks } = fakeAdapter((t) => t.numSimulations)
        await collect(baseConfig({ numSimulations: 123 }), adapter)
        expect(tasks.length).toBeGreaterThan(0)
        for (const task of tasks) {
            expect(task.numSimulations).toBe(123)
        }
    })

    it('reports an info event when fewer simulations run than requested', async () => {
        // Return half the requested count to simulate per-combination rounding.
        const { adapter } = fakeAdapter((t) => Math.floor(t.numSimulations / 2))
        const events = await collect(baseConfig({ numSimulations: 100 }), adapter)
        const info = events.find(
            (e) => e.type === 'info' && /Ran 50 simulations/.test(e.info ?? ''),
        )
        expect(info).toBeDefined()
    })

    it('does not report a shortfall when the full count runs', async () => {
        const { adapter } = fakeAdapter((t) => t.numSimulations)
        const events = await collect(baseConfig({ numSimulations: 100 }), adapter)
        const shortfall = events.find(
            (e) => e.type === 'info' && /per-combination batching/.test(e.info ?? ''),
        )
        expect(shortfall).toBeUndefined()
    })

    it('completes with results sorted by efficiency (mean length per cost)', async () => {
        const { adapter } = fakeAdapter((t) => t.numSimulations)
        const events = await collect(baseConfig(), adapter)
        const complete = events.find((e) => e.type === 'complete')
        expect(complete?.results).toBeDefined()
        const results = complete!.results!
        for (let i = 1; i < results.length; i++) {
            expect(results[i - 1]!.meanLengthPerCost).toBeGreaterThanOrEqual(
                results[i]!.meanLengthPerCost,
            )
        }
    })

    async function seedsFor(
        config: SimulationRunnerConfig,
    ): Promise<(number | null)[]> {
        const { adapter, tasks } = fakeAdapter((t) => t.numSimulations)
        await collect(config, adapter)
        return tasks.map((t) => t.simOptions.seed)
    }

    it('uses the configured seed and is reproducible across runs', async () => {
        const a = await seedsFor(baseConfig({ seed: 4242 }))
        const b = await seedsFor(baseConfig({ seed: 4242 }))
        expect(a.length).toBeGreaterThan(0)
        expect(a).toEqual(b)
        expect(a[0]).toBe(4242)
    })

    it('derives different seeds for different configured seeds', async () => {
        const a = await seedsFor(baseConfig({ seed: 1 }))
        const b = await seedsFor(baseConfig({ seed: 2 }))
        expect(a[0]).not.toBe(b[0])
    })

    it('uses a fresh random seed when none is configured', async () => {
        const a = await seedsFor(baseConfig())
        const b = await seedsFor(baseConfig())
        // Random 0..1e9 seeds: a collision across runs is astronomically unlikely.
        expect(a[0]).not.toBe(b[0])
    })

    it('emits an error when no skills are available', async () => {
        const { adapter } = fakeAdapter((t) => t.numSimulations)
        const events = await collect(
            baseConfig({ skills: { 'Definitely Not A Real Skill': { discount: 0 } } }),
            adapter,
        )
        expect(events.some((e) => e.type === 'error')).toBe(true)
        expect(events.some((e) => e.type === 'complete')).toBe(false)
    })

    it('enables position keep on every task', async () => {
        const { adapter, tasks } = fakeAdapter((t) => t.numSimulations)
        await collect(baseConfig(), adapter)
        expect(tasks.length).toBeGreaterThan(0)
        for (const task of tasks) {
            expect(task.simOptions.usePosKeep).toBe(true)
        }
    })

    it.each([
        ['Front Runner', [1, 1]],
        ['Pace Chaser', [2, 4]],
        ['Late Surger', [5, 9]],
        ['End Closer', [5, 9]],
        ['Runaway', [1, 1]],
    ])(
        'uses the per-strategy order range for %s in a 9-uma field',
        async (strategy, expected) => {
            const { adapter, tasks } = fakeAdapter((t) => t.numSimulations)
            const config = baseConfig({ uma: { strategy } })
            config.track.numUmas = 9
            await collect(config, adapter)
            expect(tasks.length).toBeGreaterThan(0)
            for (const task of tasks) {
                expect(task.racedef.orderRange).toEqual(expected)
            }
        },
    )

    it('skips skills with no implemented effects and tags partial ones', async () => {
        const { adapter, tasks } = fakeAdapter((t) => t.numSimulations)
        // Go with the Flow: only a lane-movement effect (type 28) -> 'none'.
        // Nimble Navigator: Accel + lane movement -> 'partial'.
        // Concentration: start-delay effect -> fully implemented.
        const events = await collect(
            baseConfig({
                skills: {
                    Concentration: { discount: 0 },
                    'Go with the Flow': { discount: 0 },
                    'Nimble Navigator': { discount: 0 },
                },
            }),
            adapter,
        )
        const simulated = tasks.map((t) => t.skillName)
        expect(simulated).not.toContain('Go with the Flow')
        expect(simulated).toContain('Nimble Navigator')
        expect(simulated).toContain('Concentration')

        const results = events.find((e) => e.type === 'complete')!.results!
        const byName = new Map(results.map((r) => [r.skill, r]))
        expect(byName.get('Go with the Flow')?.coverage).toBe('none')
        expect(byName.get('Nimble Navigator')?.coverage).toBe('partial')
        expect(byName.get('Concentration')?.coverage).toBeUndefined()
    })

    it('scales the order range with the configured field size', async () => {
        const { adapter, tasks } = fakeAdapter((t) => t.numSimulations)
        const config = baseConfig({ uma: { strategy: 'End Closer' } })
        config.track.numUmas = 18
        await collect(config, adapter)
        expect(tasks.length).toBeGreaterThan(0)
        for (const task of tasks) {
            expect(task.racedef.orderRange).toEqual([9, 18])
        }
    })
})
