import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { describe, expect, it } from 'vitest'
import { processCourseData, type CourseData } from './utils'
import type { RawCourseData, SimulationTask } from './types'

/**
 * Tests that <Random> weather produces consistent means compared to fixed weather.
 *
 * "It's On!" (200461) is weather-independent, so <Random> weather should produce
 * the same mean as any fixed weather (the weighted average across weathers).
 * Previously, the nsamples bias in runComparison caused a ~13% gap.
 */
describe('random weather consistency', () => {
    const umaToolsDir = resolve(
        import.meta.dirname,
        '..',
        'uma-tools',
        'umalator-global',
    )
    const courseData: Record<string, RawCourseData> = JSON.parse(
        readFileSync(resolve(umaToolsDir, 'course_data.json'), 'utf-8'),
    )
    const workerPath = new URL('./simulation.worker.js', import.meta.url)

    // Hanshin Turf 1600m
    const hanshin1600 = processCourseData(courseData['10304'])

    const baseUma = {
        speed: 1200,
        stamina: 600,
        power: 1000,
        guts: 450,
        wisdom: 550,
        strategy: 'Nige' as const,
        distanceAptitude: 'A' as const,
        surfaceAptitude: 'A' as const,
        strategyAptitude: 'A' as const,
        skills: [] as string[],
    }

    const baseSimOptions = {
        seed: 42,
        useEnhancedSpurt: true,
        accuracyMode: true,
        pacemakerCount: 1,
        allowRushedUma1: true,
        allowRushedUma2: true,
        allowDownhillUma1: true,
        allowDownhillUma2: true,
        allowSectionModifierUma1: true,
        allowSectionModifierUma2: true,
        skillCheckChanceUma1: false,
        skillCheckChanceUma2: false,
    }

    const runWorker = (task: SimulationTask): Promise<{ mean: number }> => {
        return new Promise((resolve, reject) => {
            const worker = new Worker(workerPath, { workerData: task })
            worker.on(
                'message',
                (message: {
                    success: boolean
                    result?: { mean: number }
                    error?: string
                }) => {
                    if (message.success && message.result) {
                        resolve(message.result)
                    } else {
                        reject(new Error(message.error ?? 'Unknown error'))
                    }
                    worker.terminate()
                },
            )
            worker.on('error', (error) => {
                reject(error)
                worker.terminate()
            })
        })
    }

    it('random weather should match fixed weather for weather-independent skill', async () => {
        // Fixed weather (sunny), random season
        const fixedWeatherTask: SimulationTask = {
            skillId: '200461', // It's On!
            skillName: "It's On!",
            courses: [hanshin1600],
            racedef: {
                mood: 2,
                groundCondition: 2,
                weather: 1, // Sunny (fixed)
                season: 1,
                time: 0,
                grade: 100,
                popularity: 1,
                skillId: '',
                numUmas: 18,
            },
            baseUma,
            simOptions: baseSimOptions,
            numSimulations: 500,
            useRandomSeason: true,
            weightedSeasons: [
                // Spring 40%, Summer 22%, Autumn 12%, Winter 26%
                ...Array(40).fill(1),
                ...Array(22).fill(2),
                ...Array(12).fill(3),
                ...Array(26).fill(4),
            ],
        }

        // Random weather + random season
        const randomWeatherTask: SimulationTask = {
            ...fixedWeatherTask,
            useRandomWeather: true,
            weightedWeathers: [
                // Sunny 58%, Cloudy 30%, Rainy 11%, Snowy 1%
                ...Array(58).fill(1),
                ...Array(30).fill(2),
                ...Array(11).fill(3),
                ...Array(1).fill(4),
            ],
        }

        const [fixedResult, randomResult] = await Promise.all([
            runWorker(fixedWeatherTask),
            runWorker(randomWeatherTask),
        ])

        console.log(
            `Fixed weather mean: ${fixedResult.mean.toFixed(4)}, Random weather mean: ${randomResult.mean.toFixed(4)}`,
        )

        const relativeDiff =
            Math.abs(fixedResult.mean - randomResult.mean) /
            Math.max(Math.abs(fixedResult.mean), Math.abs(randomResult.mean))
        console.log(`Relative difference: ${(relativeDiff * 100).toFixed(1)}%`)

        // Weather-independent skill should produce similar means regardless of weather mode.
        // With the budget-aware combo allocation (min 25 nsamples per combo),
        // the nsamples bias is kept under ~7%, plus sampling noise.
        expect(relativeDiff).toBeLessThan(0.1)
    }, 60000)
})
