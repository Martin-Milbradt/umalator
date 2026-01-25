import { describe, expect, it } from 'vitest'
import {
    parseRaceConditions,
    processWithConcurrency,
} from './simulation-runner'

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
