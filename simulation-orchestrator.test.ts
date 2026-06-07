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

    it('emits an error when no skills are available', async () => {
        const { adapter } = fakeAdapter((t) => t.numSimulations)
        const events = await collect(
            baseConfig({ skills: { 'Definitely Not A Real Skill': { discount: 0 } } }),
            adapter,
        )
        expect(events.some((e) => e.type === 'error')).toBe(true)
        expect(events.some((e) => e.type === 'complete')).toBe(false)
    })
})
