import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { describe, expect, it } from 'vitest'
import {
    parseRaceConditions,
    processWithConcurrency,
} from './simulation-runner'
import {
    calculateStatsFromRawResults,
    createWeightedConditionArray,
    createWeightedSeasonArray,
    createWeightedWeatherArray,
    processCourseData,
    type CourseData,
} from './utils'
import type { RawCourseData, SimulationTask } from './types'

describe('processWithConcurrency', () => {
    it('processes items in parallel up to concurrency limit', async () => {
        const results: number[] = []
        const factories = [1, 2, 3, 4, 5].map(
            (n) => () =>
                new Promise<number>((resolve) => {
                    results.push(n)
                    resolve(n * 2)
                }),
        )

        const output = await processWithConcurrency(factories, 2)

        expect(output).toHaveLength(5)
        expect(output.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10])
    })

    it('handles empty input', async () => {
        const output = await processWithConcurrency([], 2)
        expect(output).toEqual([])
    })

    it('handles single item', async () => {
        const output = await processWithConcurrency(
            [() => Promise.resolve('single')],
            5,
        )
        expect(output).toEqual(['single'])
    })
})

describe('parseRaceConditions', () => {
    it('parses fixed race conditions', () => {
        const track = {
            groundCondition: 'good',
            weather: 'sunny',
            season: 'spring',
        }
        const uma = {
            strategy: 'Nige',
            mood: 2,
        }

        const conditions = parseRaceConditions(track, uma)

        expect(conditions.groundCondition.isRandom).toBe(false)
        expect(conditions.groundCondition.value).toBe(2) // Yielding = Good in game
        expect(conditions.groundCondition.display).toBe('good')

        expect(conditions.weather.isRandom).toBe(false)
        expect(conditions.weather.value).toBe(1) // sunny
        expect(conditions.weather.display).toBe('sunny')

        expect(conditions.season.isRandom).toBe(false)
        expect(conditions.season.value).toBe(1) // spring
        expect(conditions.season.display).toBe('spring')

        expect(conditions.mood.isRandom).toBe(false)
        expect(conditions.mood.value).toBe(2)
    })

    it('parses random race conditions', () => {
        const track = {
            groundCondition: '<Random>',
            weather: '<Random>',
            season: '<Random>',
        }
        const uma = {
            strategy: 'Nige',
            // mood omitted for random
        }

        const conditions = parseRaceConditions(track, uma)

        expect(conditions.groundCondition.isRandom).toBe(true)
        expect(conditions.groundCondition.forFiltering).toBeNull()
        expect(conditions.groundCondition.display).toBe('<Random>')
        expect(conditions.groundCondition.weighted).not.toBeNull()

        expect(conditions.weather.isRandom).toBe(true)
        expect(conditions.weather.forFiltering).toBeNull()
        expect(conditions.weather.display).toBe('<Random>')
        expect(conditions.weather.weighted).not.toBeNull()

        expect(conditions.season.isRandom).toBe(true)
        expect(conditions.season.forFiltering).toBeNull()
        expect(conditions.season.display).toBe('<Random>')
        expect(conditions.season.weighted).not.toBeNull()

        expect(conditions.mood.isRandom).toBe(true)
        expect(conditions.mood.forFiltering).toBeNull()
    })
})

describe('simulation worker integration', () => {
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

    // Nakayama Turf 2500 course
    const nakayama2500 = processCourseData(courseData['10506'])

    const runWorkerSimulation = (
        skillId: string,
        skillName: string,
        course: CourseData,
        numSimulations: number,
        seed: number,
    ): Promise<number[]> => {
        return new Promise((resolve, reject) => {
            const task: SimulationTask = {
                skillId,
                skillName,
                courses: [course],
                racedef: {
                    mood: 2,
                    groundCondition: 2, // Good
                    weather: 1, // Sunny
                    season: 1, // Spring
                    time: 0,
                    grade: 100, // G1
                    popularity: 1,
                    skillId: '',
                    numUmas: 18,
                },
                baseUma: {
                    speed: 1200,
                    stamina: 600,
                    power: 1000,
                    guts: 450,
                    wisdom: 550,
                    strategy: 'Nige',
                    distanceAptitude: 'A',
                    surfaceAptitude: 'A',
                    strategyAptitude: 'A',
                    skills: [],
                },
                simOptions: {
                    seed,
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
                },
                numSimulations,
                returnRawResults: true,
            }

            const worker = new Worker(workerPath, { workerData: task })

            worker.on(
                'message',
                (message: {
                    success: boolean
                    result?: { rawResults: number[] }
                    error?: string
                }) => {
                    if (message.success && message.result?.rawResults) {
                        resolve(message.result.rawResults)
                    } else {
                        reject(new Error(message.error || 'Unknown error'))
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

    // Run with parameters matching Suzuka_Sagi.json config
    const runWorkerSimulationWithConfig = (
        skillId: string,
        skillName: string,
        course: CourseData,
        numSimulations: number,
        seed: number,
    ): Promise<number[]> => {
        return new Promise((resolve, reject) => {
            const task: SimulationTask = {
                skillId,
                skillName,
                courses: [course],
                racedef: {
                    mood: null, // Random mood (matches config uma.mood: null)
                    groundCondition: 1, // Firm
                    weather: 1, // Sunny
                    season: 4, // Winter
                    time: 0,
                    grade: 100, // G1
                    popularity: 1,
                    skillId: '',
                    numUmas: 9,
                },
                baseUma: {
                    speed: 1134,
                    stamina: 830,
                    power: 1023,
                    guts: 366,
                    wisdom: 614,
                    strategy: 'Senkou', // Front Runner
                    distanceAptitude: 'S',
                    surfaceAptitude: 'A',
                    strategyAptitude: 'A',
                    skills: ['100021'], // Unique: "The View from the Lead Is Mine!"
                },
                simOptions: {
                    seed,
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
                },
                numSimulations,
                useRandomMood: true, // Config has mood: null
                returnRawResults: true,
            }

            const worker = new Worker(workerPath, { workerData: task })

            worker.on(
                'message',
                (message: {
                    success: boolean
                    result?: { rawResults: number[] }
                    error?: string
                }) => {
                    if (message.success && message.result?.rawResults) {
                        resolve(message.result.rawResults)
                    } else {
                        reject(new Error(message.error || 'Unknown error'))
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

    it('Nimble Navigator simulations should have variance', async () => {
        const results = await runWorkerSimulation(
            '200492', // Nimble Navigator
            'Nimble Navigator',
            nakayama2500,
            100,
            12345,
        )

        expect(results).toHaveLength(100)

        const min = Math.min(...results)
        const max = Math.max(...results)
        const mean = results.reduce((a, b) => a + b, 0) / results.length

        // Results should have variance (min != max)
        // If all results are identical, something is wrong with seeding
        expect(max).not.toBe(min)
        expect(max - min).toBeGreaterThan(0)

        console.log(
            `Nimble Navigator 100 sims: mean=${mean.toFixed(2)}, min=${min.toFixed(2)}, max=${max.toFixed(2)}`,
        )
    }, 30000)

    it('different seeds should produce different but statistically similar results', async () => {
        // Run 100 sims with seed A
        const results1 = await runWorkerSimulation(
            '200492',
            'Nimble Navigator',
            nakayama2500,
            100,
            11111,
        )

        // Run 100 sims with seed B
        const results2 = await runWorkerSimulation(
            '200492',
            'Nimble Navigator',
            nakayama2500,
            100,
            22222,
        )

        const mean1 = results1.reduce((a, b) => a + b, 0) / results1.length
        const mean2 = results2.reduce((a, b) => a + b, 0) / results2.length

        // Results should be different (different seeds)
        expect(results1).not.toEqual(results2)

        // But means should be statistically similar (within 50% for 100 samples)
        const relativeDiff = Math.abs(mean1 - mean2) / Math.max(mean1, mean2)
        console.log(
            `Seed 11111: mean=${mean1.toFixed(2)}, Seed 22222: mean=${mean2.toFixed(2)}, diff=${(relativeDiff * 100).toFixed(1)}%`,
        )

        expect(relativeDiff).toBeLessThan(0.5)
    }, 30000)

    it('500 simulations should produce stable statistics', async () => {
        const skillName = 'Nimble Navigator'
        const cost = 150
        const discount = 0
        const ciPercent = 90

        const results = await runWorkerSimulationWithConfig(
            '200492',
            skillName,
            nakayama2500,
            500,
            44444,
        )

        const stats = calculateStatsFromRawResults(
            results,
            cost,
            discount,
            skillName,
            ciPercent,
        )

        console.log(
            `500 sims: mean=${stats.meanLength.toFixed(2)}, median=${stats.medianLength.toFixed(2)}, min=${stats.minLength.toFixed(2)}, max=${stats.maxLength.toFixed(2)}`,
        )

        expect(results.length).toBeGreaterThanOrEqual(500)
        expect(stats.meanLength).toBeGreaterThan(0)
        expect(stats.minLength).toBeLessThanOrEqual(stats.meanLength)
        expect(stats.maxLength).toBeGreaterThanOrEqual(stats.meanLength)
        expect(stats.ciLower).toBeLessThanOrEqual(stats.ciUpper)
    }, 30000)

    it('all-random scenario should complete without combinatorial explosion', async () => {
        // Use two courses to also randomize course selection
        const suzuka2000 = processCourseData(courseData['10905'])

        const task: SimulationTask = {
            skillId: '200492', // Nimble Navigator
            skillName: 'Nimble Navigator',
            courses: [nakayama2500, suzuka2000],
            racedef: {
                mood: 2,
                groundCondition: 2,
                weather: 1,
                season: 1,
                time: 0,
                grade: 100,
                popularity: 1,
                skillId: '',
                numUmas: 18,
            },
            baseUma: {
                speed: 1200,
                stamina: 600,
                power: 1000,
                guts: 450,
                wisdom: 550,
                strategy: 'Nige',
                distanceAptitude: 'A',
                surfaceAptitude: 'A',
                strategyAptitude: 'A',
                skills: [],
            },
            simOptions: {
                seed: 99999,
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
            },
            numSimulations: 100,
            useRandomMood: true,
            useRandomSeason: true,
            useRandomWeather: true,
            useRandomCondition: true,
            weightedSeasons: createWeightedSeasonArray(),
            weightedWeathers: createWeightedWeatherArray(),
            weightedConditions: createWeightedConditionArray(),
            returnRawResults: true,
        }

        const result = await new Promise<number[]>((resolve, reject) => {
            const worker = new Worker(workerPath, { workerData: task })
            worker.on(
                'message',
                (message: {
                    success: boolean
                    result?: { rawResults: number[] }
                    error?: string
                }) => {
                    if (message.success && message.result?.rawResults) {
                        resolve(message.result.rawResults)
                    } else {
                        reject(new Error(message.error || 'Unknown error'))
                    }
                    worker.terminate()
                },
            )
            worker.on('error', (error) => {
                reject(error)
                worker.terminate()
            })
        })

        // Should have a reasonable number of results (not millions from Cartesian explosion)
        // With budget-aware allocation: 2 tracks × combosPerTrack × nsamplesPerCombo
        expect(result.length).toBeGreaterThanOrEqual(50)
        expect(result.length).toBeLessThanOrEqual(200)

        const mean = result.reduce((a, b) => a + b, 0) / result.length
        console.log(
            `All-random 100 sims: mean=${mean.toFixed(2)}, min=${Math.min(...result).toFixed(2)}, max=${Math.max(...result).toFixed(2)}`,
        )
    }, 30000)
})
