// Node entry point for the shared simulation orchestrator. Owns only the
// worker_threads transport; all orchestration lives in
// shared/simulation-orchestrator.ts (shared with the browser runner).
import { cpus } from 'node:os'
import { Worker } from 'node:worker_threads'
import type { SimulationTask } from './types'
import {
    type ProgressCallback,
    type SimulationRunnerConfig,
    type StaticData,
    type TaskResult,
    type WorkerAdapter,
    runSimulation,
} from './shared/simulation-orchestrator'

// Re-export so existing importers (cli.ts, race-check.ts, simulation-runner.test.ts)
// keep their `./simulation-runner` import paths.
export {
    parseRaceConditions,
    processWithConcurrency,
} from './shared/simulation-orchestrator'
export type {
    ParsedRaceConditions,
    ProgressCallback,
    RaceCondition,
    SimulationProgress,
    SimulationRunnerConfig,
    StaticData,
} from './shared/simulation-orchestrator'

// Terminate a worker that never reports back so one bad skill can't hang a run.
const WORKER_TIMEOUT_MS = 5 * 60 * 1000

function runNodeTask(workerPath: URL, task: SimulationTask): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, { workerData: task })

        const timeoutId = setTimeout(() => {
            worker.terminate()
            reject(
                new Error(
                    `Worker timeout after ${WORKER_TIMEOUT_MS / 1000}s for skill: ${task.skillName}`,
                ),
            )
        }, WORKER_TIMEOUT_MS)

        worker.on(
            'message',
            (message: {
                success: boolean
                result?: TaskResult
                error?: string
            }) => {
                clearTimeout(timeoutId)
                if (message.success && message.result) {
                    resolve(message.result)
                } else {
                    reject(new Error(message.error || 'Unknown error'))
                }
                worker.terminate()
            },
        )

        worker.on('error', (error) => {
            clearTimeout(timeoutId)
            reject(error)
            worker.terminate()
        })
    })
}

export class SimulationRunner {
    constructor(
        readonly config: SimulationRunnerConfig,
        readonly staticData: StaticData,
        readonly workerPath: URL,
    ) {}

    /**
     * Run simulations for skills.
     * @param onProgress Callback for progress updates
     * @param skillFilter Optional list of skill names to calculate. If provided, only these skills are simulated.
     */
    async run(
        onProgress: ProgressCallback,
        skillFilter?: string[],
    ): Promise<void> {
        const workerPath = this.workerPath
        const adapter: WorkerAdapter = {
            concurrency: (skillCount) => Math.min(skillCount, cpus().length),
            runTask: (task) => runNodeTask(workerPath, task),
        }
        await runSimulation(
            this.config,
            this.staticData,
            onProgress,
            adapter,
            skillFilter,
        )
    }
}
