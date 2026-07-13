import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SimulationRunner } from './simulation-runner'
import type { SimulationRunnerConfig } from './shared/simulation-orchestrator'
import type { SkillResult } from './utils'

// Owned skills get removal/downgrade rows simulated the other way around
// (uma without the skill vs uma with it) and reported negated: mean = what
// removing loses, cost = the refunded SP.
describe('owned skill rows', () => {
    const dataDir = resolve(import.meta.dirname, 'uma-tools', 'umalator-global')
    const loadJson = <T>(file: string): T =>
        JSON.parse(readFileSync(resolve(dataDir, file), 'utf-8')) as T
    const staticData = {
        courseData: loadJson<Record<string, never>>('course_data.json'),
        skillData: loadJson<Record<string, never>>('skill_data.json'),
        skillMeta: loadJson<Record<string, never>>('skill_meta.json'),
        skillNames: loadJson<Record<string, never>>('skillnames.json'),
        trackNames: loadJson<Record<string, never>>('tracknames.json'),
    }
    const workerPath = new URL('./simulation.worker.js', import.meta.url)

    // Gold "Professor of Curvature" (180 SP) has white "Corner Adept ○"
    // (180 SP) below it and a purple "Corner Adept ×" that must not get a row.
    const baseConfig: SimulationRunnerConfig = {
        skills: {
            Concentration: { discount: 0 },
            'Professor of Curvature': { discount: 20 },
            'Corner Adept ○': { discount: 0 },
        },
        track: {
            trackName: 'Hanshin',
            distance: 1600,
            surface: 'Turf',
            groundCondition: 'Firm',
            weather: 'Sunny',
            season: 'Spring',
            numUmas: 9,
        },
        uma: {
            speed: 1100,
            stamina: 800,
            power: 900,
            guts: 400,
            wisdom: 600,
            mood: 2,
            strategy: 'Pace Chaser',
            skills: ['Professor of Curvature'],
            unique: 'Luck Runs My Way',
        },
        numSimulations: 50,
        seed: 246813579,
    }

    const runToCompletion = async (
        config: SimulationRunnerConfig,
    ): Promise<Map<string, SkillResult>> => {
        const runner = new SimulationRunner(config, staticData, workerPath)
        const results = new Map<string, SkillResult>()
        await runner.run((progress) => {
            if (progress.type === 'error') {
                throw new Error(progress.error)
            }
            if (progress.type === 'complete') {
                for (const r of progress.results ?? []) {
                    results.set(r.skill, r)
                }
            }
        })
        return results
    }

    it('produces negated removal, downgrade, and unique rows', async () => {
        const results = await runToCompletion(baseConfig)

        // Normal buy candidate is unaffected.
        const buy = results.get('Concentration')
        expect(buy).toBeDefined()
        expect(buy!.owned).toBeUndefined()
        expect(buy!.cost).toBeGreaterThan(0)

        // Removal row: refund = gold at 20% (144) + white prereq (180).
        const removal = results.get('Professor of Curvature')
        expect(removal).toBeDefined()
        expect(removal!.owned).toBe(true)
        expect(removal!.ownedAction).toBe('remove')
        expect(removal!.hasCost).toBe(true)
        expect(removal!.cost).toBe(-324)
        // A corner speed gold reliably helps; removing it loses ground.
        expect(removal!.meanLength).toBeLessThan(0)
        // negative mean over negative cost sorts like a buy row
        expect(removal!.meanLengthPerCost).toBeGreaterThan(0)

        // Downgrade row: refund = full gold chain minus the white's cost.
        const downgrade = results.get('Corner Adept ○')
        expect(downgrade).toBeDefined()
        expect(downgrade!.ownedAction).toBe('downgrade')
        expect(downgrade!.cost).toBe(-144)
        // Downgrading loses at most the removal's full effect.
        expect(downgrade!.meanLength).toBeLessThanOrEqual(0)
        expect(downgrade!.meanLength).toBeGreaterThanOrEqual(
            removal!.meanLength,
        )

        // The purple sibling gets no row.
        expect(results.has('Corner Adept ×')).toBe(false)

        // The unique gets a disable row without cost columns.
        const unique = results.get('Luck Runs My Way')
        expect(unique).toBeDefined()
        expect(unique!.ownedAction).toBe('disable-unique')
        expect(unique!.hasCost).toBe(false)
        expect(unique!.meanLength).toBeLessThan(0)
    }, 60000)

    it('skips owned rows when calcOwned is off', async () => {
        const results = await runToCompletion({
            ...baseConfig,
            filters: { calcOwned: false },
            numSimulations: 25,
        })
        expect(results.has('Concentration')).toBe(true)
        expect(results.has('Professor of Curvature')).toBe(false)
        expect(results.has('Corner Adept ○')).toBe(false)
        expect(results.has('Luck Runs My Way')).toBe(false)
    }, 60000)

    it('turns a disabled unique into a re-enable row with positive gain', async () => {
        const results = await runToCompletion({
            ...baseConfig,
            uma: { ...baseConfig.uma, uniqueDisabled: true },
            numSimulations: 50,
        })
        const unique = results.get('Luck Runs My Way')
        expect(unique).toBeDefined()
        expect(unique!.ownedAction).toBe('enable-unique')
        expect(unique!.meanLength).toBeGreaterThan(0)
    }, 60000)
})
