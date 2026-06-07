// Throwaway analysis: characterize the per-race gain distributions produced by
// the AG.json skills and run a Monte-Carlo coverage study comparing 95% CI
// methods for the mean at n=500. Not part of the build; safe to delete.
import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { RawCourseData, SimulationTask, SkillMeta } from '../types'
import { standardNormalQuantile, type SkillDataEntry } from '../utils'
import {
    runSimulation,
    type SimulationProgress,
    type SimulationRunnerConfig,
    type StaticData,
    type TaskResult,
    type WorkerAdapter,
} from '../shared/simulation-orchestrator'

const REF_SIMS = 20000 // reference "population" size per skill
const N_SUB = 500 // the n the app actually uses
const B_OUT = 800 // outer resamples in the coverage study
const B_IN = 600 // inner bootstrap replicates
const SEED = 0x5eed1234

// ---- normal CDF (Abramowitz-Stegun 7.1.26) ---------------------------------
function erf(x: number): number {
    const t = 1 / (1 + 0.3275911 * Math.abs(x))
    const y =
        1 -
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
            0.284496736) *
            t +
            0.254829592) *
            t *
            Math.exp(-x * x)
    return x >= 0 ? y : -y
}
function normalCdf(x: number): number {
    return 0.5 * (1 + erf(x / Math.SQRT2))
}

// ---- seeded RNG (mulberry32) ----------------------------------------------
function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// ---- summary statistics ----------------------------------------------------
interface Diag {
    skill: string
    n: number
    mean: number
    sd: number
    min: number
    max: number
    range: number
    median: number
    pctZero: number
    skew: number
    exKurt: number
    berryEsseen500: number
}

function diagnose(skill: string, x: number[]): Diag {
    const n = x.length
    const mean = x.reduce((a, b) => a + b, 0) / n
    let m2 = 0
    let m3 = 0
    let m4 = 0
    let absM3 = 0
    let zero = 0
    for (const v of x) {
        const d = v - mean
        m2 += d * d
        m3 += d * d * d
        m4 += d * d * d * d
        absM3 += Math.abs(d) ** 3
        if (Math.abs(v) < 1e-9) zero++
    }
    const varPop = m2 / n
    const sdPop = Math.sqrt(varPop)
    const sd = Math.sqrt(m2 / (n - 1))
    const sorted = [...x].sort((a, b) => a - b)
    const mid = Math.floor(n / 2)
    const median = n % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
    const skew = sdPop > 0 ? m3 / n / sdPop ** 3 : 0
    const exKurt = sdPop > 0 ? m4 / n / sdPop ** 4 - 3 : 0
    // Berry-Esseen Gaussian-approximation error bound for Wald at n=500.
    const rho = absM3 / n
    const be = sdPop > 0 ? (0.48 * rho) / (sdPop ** 3 * Math.sqrt(N_SUB)) : 0
    return {
        skill,
        n,
        mean,
        sd,
        min: sorted[0]!,
        max: sorted[n - 1]!,
        range: sorted[n - 1]! - sorted[0]!,
        median,
        pctZero: (100 * zero) / n,
        skew,
        exKurt,
        berryEsseen500: Math.min(be, 0.5),
    }
}

// ---- CI methods (return [lo, hi]) -----------------------------------------
const Z = standardNormalQuantile(0.975) // 1.95996
const LN80 = Math.log(80)

function meanSd(s: number[]): [number, number] {
    const n = s.length
    const m = s.reduce((a, b) => a + b, 0) / n
    let q = 0
    for (const v of s) q += (v - m) * (v - m)
    return [m, Math.sqrt(q / (n - 1))]
}

function wald(m: number, sd: number, n: number): [number, number] {
    const h = (Z * sd) / Math.sqrt(n)
    return [m - h, m + h]
}
function hoeffding(m: number, n: number, range: number): [number, number] {
    const h = range * Math.sqrt(Math.log(40) / (2 * n))
    return [m - h, m + h]
}
function empBernstein(m: number, sd: number, n: number, range: number): [number, number] {
    const h = sd * Math.sqrt((2 * LN80) / n) + (7 * range * LN80) / (3 * (n - 1))
    return [m - h, m + h]
}

function sortedPercentile(sortedArr: number[], p: number): number {
    const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(sortedArr.length * p)))
    return sortedArr[idx]!
}

function bootstrapMeans(s: number[], b: number, rng: () => number): number[] {
    const n = s.length
    const means = new Array<number>(b)
    for (let k = 0; k < b; k++) {
        let sum = 0
        for (let i = 0; i < n; i++) sum += s[(rng() * n) | 0]!
        means[k] = sum / n
    }
    means.sort((a, b2) => a - b2)
    return means
}

function percentileBoot(bootSorted: number[]): [number, number] {
    return [sortedPercentile(bootSorted, 0.025), sortedPercentile(bootSorted, 0.975)]
}

function bca(s: number[], thetaHat: number, bootSorted: number[]): [number, number] {
    const b = bootSorted.length
    let less = 0
    for (const v of bootSorted) if (v < thetaHat) less++
    const frac = Math.min(b - 0.5, Math.max(0.5, less)) / b
    const z0 = standardNormalQuantile(frac)
    // jackknife acceleration
    const n = s.length
    const total = s.reduce((a, c) => a + c, 0)
    const jk = new Array<number>(n)
    let jkMean = 0
    for (let i = 0; i < n; i++) {
        jk[i] = (total - s[i]!) / (n - 1)
        jkMean += jk[i]!
    }
    jkMean /= n
    let num = 0
    let den = 0
    for (let i = 0; i < n; i++) {
        const d = jkMean - jk[i]!
        num += d * d * d
        den += d * d
    }
    const a = den > 0 ? num / (6 * den ** 1.5) : 0
    const zLo = -Z
    const zHi = Z
    const adj = (zt: number): number => {
        const denom = 1 - a * (z0 + zt)
        return normalCdf(z0 + (z0 + zt) / denom)
    }
    const a1 = adj(zLo)
    const a2 = adj(zHi)
    return [sortedPercentile(bootSorted, a1), sortedPercentile(bootSorted, a2)]
}

// ---- coverage study --------------------------------------------------------
interface Cover {
    method: string
    coverage: number
    meanHalfWidth: number
    pctCrossZero: number
}

function coverageStudy(pop: number[], diag: Diag, rng: () => number): Cover[] {
    const muPop = diag.mean
    const range = diag.range
    const methods = ['Wald-z', 'Hoeffding', 'Emp.Bernstein', 'Boot-pct', 'Boot-BCa']
    const hit = methods.map(() => 0)
    const width = methods.map(() => 0)
    const crossZero = methods.map(() => 0)
    const nPop = pop.length

    for (let r = 0; r < B_OUT; r++) {
        const sub = new Array<number>(N_SUB)
        for (let i = 0; i < N_SUB; i++) sub[i] = pop[(rng() * nPop) | 0]!
        const [m, sd] = meanSd(sub)
        const bootSorted = bootstrapMeans(sub, B_IN, rng)
        const intervals: [number, number][] = [
            wald(m, sd, N_SUB),
            hoeffding(m, N_SUB, range),
            empBernstein(m, sd, N_SUB, range),
            percentileBoot(bootSorted),
            bca(sub, m, bootSorted),
        ]
        for (let j = 0; j < methods.length; j++) {
            const [lo, hi] = intervals[j]!
            if (lo <= muPop && muPop <= hi) hit[j]!++
            width[j]! += (hi - lo) / 2
            if (lo < 0 && hi > 0) crossZero[j]!++
        }
    }
    return methods.map((method, j) => ({
        method,
        coverage: (100 * hit[j]!) / B_OUT,
        meanHalfWidth: width[j]! / B_OUT,
        pctCrossZero: (100 * crossZero[j]!) / B_OUT,
    }))
}

// ---- run reference sims ----------------------------------------------------
const dataDir = resolve('uma-tools/umalator-global')
function loadJson<T>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
}
const config = loadJson<SimulationRunnerConfig>(resolve('configs/AG.json'))
config.numSimulations = REF_SIMS
config.seed = 1234567
const staticData: StaticData = {
    courseData: loadJson<Record<string, RawCourseData>>(`${dataDir}/course_data.json`),
    skillData: loadJson<Record<string, SkillDataEntry>>(`${dataDir}/skill_data.json`),
    skillMeta: loadJson<Record<string, SkillMeta>>(`${dataDir}/skill_meta.json`),
    skillNames: loadJson<Record<string, string[]>>(`${dataDir}/skillnames.json`),
    trackNames: loadJson<Record<string, string[]>>(`${dataDir}/tracknames.json`),
}

const collector = new Map<string, number[]>()
const workerPath = new URL('../simulation.worker.js', import.meta.url)
function runNodeTask(task: SimulationTask): Promise<TaskResult> {
    return new Promise((res, rej) => {
        const worker = new Worker(workerPath, { workerData: task })
        worker.on('message', (msg: { success: boolean; result?: TaskResult; error?: string }) => {
            if (msg.success && msg.result) res(msg.result)
            else rej(new Error(msg.error || 'fail'))
            worker.terminate()
        })
        worker.on('error', (e) => {
            rej(e)
            worker.terminate()
        })
    })
}
const adapter: WorkerAdapter = {
    concurrency: (n) => Math.min(n, cpus().length),
    runTask: async (task) => {
        const res = await runNodeTask(task)
        if (res.rawResults) collector.set(res.skillName, res.rawResults)
        return res
    },
}

console.error(`Running ${REF_SIMS} reference sims per applicable skill...`)
await runSimulation(
    config,
    staticData,
    (p: SimulationProgress) => {
        if (p.type === 'error') console.error('ERR', p.error)
        if (p.type === 'info') console.error('INFO', p.info)
    },
    adapter,
)

// ---- diagnostics for every skill ------------------------------------------
const diags: Diag[] = []
for (const [skill, raw] of collector.entries()) {
    if (raw.length > 1) diags.push(diagnose(skill, raw))
}
diags.sort((a, b) => a.pctZero - b.pctZero)

console.log('\n=== DISTRIBUTION DIAGNOSTICS (all applicable AG.json skills) ===')
console.log(
    [
        'skill',
        'n',
        'mean',
        'sd',
        'median',
        'min',
        'max',
        '%zero',
        'skew',
        'exKurt',
        'BE@500',
    ].join('\t'),
)
for (const d of diags) {
    console.log(
        [
            d.skill,
            d.n,
            d.mean.toFixed(4),
            d.sd.toFixed(4),
            d.median.toFixed(4),
            d.min.toFixed(3),
            d.max.toFixed(3),
            d.pctZero.toFixed(1),
            d.skew.toFixed(2),
            d.exKurt.toFixed(2),
            d.berryEsseen500.toFixed(3),
        ].join('\t'),
    )
}

// ---- pick representatives spanning the %zero / skew regimes ----------------
function pick(name: string): Diag | undefined {
    return diags.find((d) => d.skill === name)
}
const reps: Diag[] = []
const seen = new Set<string>()
// lowest %zero (most "filled in"), median, highest %zero, plus the highest-mean
const byZero = [...diags]
const byMean = [...diags].sort((a, b) => b.mean - a.mean)
const candidates = [
    byZero[0],
    byZero[Math.floor(byZero.length / 2)],
    byZero[byZero.length - 1],
    byMean[0],
    byMean[Math.floor(byMean.length / 4)],
]
for (const c of candidates) {
    if (c && !seen.has(c.skill) && c.sd > 0) {
        seen.add(c.skill)
        reps.push(c)
    }
}

console.log('\n=== COVERAGE STUDY (n=500, target 95%, ' + B_OUT + ' resamples) ===')
console.log('Representatives:', reps.map((r) => r.skill).join(' | '))
const rng = mulberry32(SEED)
for (const d of reps) {
    const pop = collector.get(d.skill)!
    const rows = coverageStudy(pop, d, rng)
    console.log(`\n--- ${d.skill}  (mean=${d.mean.toFixed(3)}, sd=${d.sd.toFixed(3)}, %zero=${d.pctZero.toFixed(1)}, skew=${d.skew.toFixed(2)}, range=${d.range.toFixed(2)}) ---`)
    console.log(['method', 'coverage%', 'meanHalfWidth', '%crossZero'].join('\t'))
    for (const row of rows) {
        console.log(
            [
                row.method,
                row.coverage.toFixed(1),
                row.meanHalfWidth.toFixed(4),
                row.pctCrossZero.toFixed(1),
            ].join('\t'),
        )
    }
}
console.error('\nDone.')
