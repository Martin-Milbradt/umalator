import type { SimulationTask, WorkerMessage } from './types'
import { runSkillSimulation } from './simulation.worker'

// Browser Web Worker entry point.
// Receives SimulationTask via postMessage, returns result via postMessage.
self.onmessage = (event: MessageEvent<SimulationTask>) => {
    try {
        const result = runSkillSimulation(event.data)
        self.postMessage({ success: true, result } satisfies WorkerMessage)
    } catch (error) {
        self.postMessage({
            success: false,
            error: String(error),
        } satisfies WorkerMessage)
    }
}
