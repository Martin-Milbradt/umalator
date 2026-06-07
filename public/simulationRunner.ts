// Browser entry point for the shared simulation orchestrator. Owns only the
// Web Worker transport; all orchestration lives in
// shared/simulation-orchestrator.ts (shared with the Node runner).
import type { SimulationTask, WorkerMessage } from '../types'
import {
    type ProgressCallback,
    type SimulationRunnerConfig,
    type StaticData,
    type TaskResult,
    type WorkerAdapter,
    runSimulation,
} from '../shared/simulation-orchestrator'

// Re-export so existing importers (public/api.ts) keep their import paths.
export {
    parseRaceConditions,
    processWithConcurrency,
} from '../shared/simulation-orchestrator'
export type {
    ParsedRaceConditions,
    ProgressCallback,
    RaceCondition,
    SimulationProgress,
    SimulationRunnerConfig,
    StaticData,
} from '../shared/simulation-orchestrator'

// Terminate a worker that never reports back so one bad skill can't hang a run.
const WORKER_TIMEOUT_MS = 5 * 60 * 1000

function runBrowserTask(
    workerUrl: string,
    task: SimulationTask,
): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl)

        const timeoutId = setTimeout(() => {
            worker.terminate()
            reject(
                new Error(
                    `Worker timeout after ${WORKER_TIMEOUT_MS / 1000}s for skill: ${task.skillName} (seed ${task.simOptions.seed})`,
                ),
            )
        }, WORKER_TIMEOUT_MS)

        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
            clearTimeout(timeoutId)
            const message = event.data
            if (message.success && message.result) {
                resolve(message.result)
            } else {
                reject(new Error(message.error || 'Unknown error'))
            }
            worker.terminate()
        }

        worker.onerror = (error) => {
            clearTimeout(timeoutId)
            reject(error)
            worker.terminate()
        }

        worker.postMessage(task)
    })
}

export class BrowserSimulationRunner {
    constructor(
        readonly config: SimulationRunnerConfig,
        readonly staticData: StaticData,
        readonly workerUrl: string,
    ) {}

    async run(
        onProgress: ProgressCallback,
        skillFilter?: string[],
    ): Promise<void> {
        const workerUrl = this.workerUrl
        const adapter: WorkerAdapter = {
            concurrency: (skillCount) =>
                Math.min(skillCount, navigator.hardwareConcurrency ?? 4),
            runTask: (task) => runBrowserTask(workerUrl, task),
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
