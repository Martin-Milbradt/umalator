import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RawCourseData, SkillMeta } from './types'
import type { SkillDataEntry } from './utils'
import {
    SimulationRunner,
    type SimulationProgress,
    type SimulationRunnerConfig,
} from './simulation-runner'

const configArg = process.argv[2]
if (!configArg || configArg === '--help' || configArg === '-h') {
    console.error('Usage: npx tsx cli.ts <config.json> [--skills skill1,skill2]')
    process.exit(configArg ? 0 : 1)
}

const skillsIdx = process.argv.indexOf('--skills')
const skillFilter =
    skillsIdx !== -1 && process.argv[skillsIdx + 1]
        ? process.argv[skillsIdx + 1]
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : undefined

const configPath = resolve(
    configArg.includes('/') || configArg.includes('\\')
        ? configArg
        : `configs/${configArg}`,
)

const dataDir = resolve('uma-tools/umalator-global')

function loadJson<T>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
}

const config = loadJson<SimulationRunnerConfig>(configPath)
const staticData = {
    courseData: loadJson<Record<string, RawCourseData>>(`${dataDir}/course_data.json`),
    skillData: loadJson<Record<string, SkillDataEntry>>(`${dataDir}/skill_data.json`),
    skillMeta: loadJson<Record<string, SkillMeta>>(`${dataDir}/skill_meta.json`),
    skillNames: loadJson<Record<string, string[]>>(`${dataDir}/skillnames.json`),
    trackNames: loadJson<Record<string, string[]>>(`${dataDir}/tracknames.json`),
}

const workerPath = new URL('./simulation.worker.js', import.meta.url)
const runner = new SimulationRunner(config, staticData, workerPath)

const errors: string[] = []

await runner.run((progress: SimulationProgress) => {
    if (progress.type === 'error') {
        errors.push(progress.error ?? 'Unknown error')
    }
    if (progress.type === 'complete') {
        console.log(JSON.stringify(progress.results, null, 2))
    }
}, skillFilter)

if (errors.length > 0) {
    console.error(JSON.stringify({ errors }, null, 2))
    process.exit(1)
}
