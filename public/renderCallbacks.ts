// Callback registry to break circular dependencies between UI modules
// Each module registers its render function, and other modules can call them via this registry

type RenderCallback = () => void

let renderUmaCallback: RenderCallback | null = null
let renderSkillsCallback: RenderCallback | null = null
let renderResultsCallback: RenderCallback | null = null

export function registerRenderUma(callback: RenderCallback): void {
    renderUmaCallback = callback
}

export function registerRenderSkills(callback: RenderCallback): void {
    renderSkillsCallback = callback
}

export function registerRenderResults(callback: RenderCallback): void {
    renderResultsCallback = callback
}

export function callRenderUma(): void {
    if (renderUmaCallback) {
        renderUmaCallback()
    }
}

export function callRenderSkills(): void {
    if (renderSkillsCallback) {
        renderSkillsCallback()
    }
}

export function callRenderResults(): void {
    if (renderResultsCallback) {
        renderResultsCallback()
    }
}
