import { describe, expect, it } from 'vitest'
import { generateRepresentative } from './simulation.worker'

function countBy<T>(values: T[]): Map<T, number> {
    const counts = new Map<T, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    return counts
}

describe('generateRepresentative', () => {
    it('returns empty for n <= 0', () => {
        expect(generateRepresentative(0, [1, 2, 3])).toEqual([])
        expect(generateRepresentative(-5, [1, 2, 3])).toEqual([])
    })

    it('returns exactly n elements', () => {
        const pool = [1, 1, 1, 2, 2, 3]
        for (const n of [1, 2, 3, 4, 5, 6, 10, 25]) {
            expect(generateRepresentative(n, pool)).toHaveLength(n)
        }
    })

    it('includes every distinct value at least once when n >= distinct', () => {
        const pool = [1, 1, 1, 1, 2, 2, 3]
        const out = generateRepresentative(5, pool)
        expect(new Set(out)).toEqual(new Set([1, 2, 3]))
    })

    it('apportions remaining slots by weight (largest-remainder)', () => {
        // Mirrors the season weights 40/22/12/26.
        const pool = [
            ...Array<string>(40).fill('spring'),
            ...Array<string>(22).fill('summer'),
            ...Array<string>(12).fill('autumn'),
            ...Array<string>(26).fill('winter'),
        ]
        const out = generateRepresentative(10, pool)
        expect(out).toHaveLength(10)
        const counts = countBy(out)
        // Every season represented, none dropped.
        expect(counts.get('spring')).toBeGreaterThanOrEqual(1)
        expect(counts.get('summer')).toBeGreaterThanOrEqual(1)
        expect(counts.get('autumn')).toBeGreaterThanOrEqual(1)
        expect(counts.get('winter')).toBeGreaterThanOrEqual(1)
        // Ordering by weight: spring is heaviest, autumn lightest.
        expect(counts.get('spring')!).toBeGreaterThanOrEqual(
            counts.get('autumn')!,
        )
        expect(counts.get('winter')!).toBeGreaterThanOrEqual(
            counts.get('autumn')!,
        )
    })

    it('picks the most probable values when n < distinct', () => {
        const pool = [
            ...Array<string>(40).fill('spring'),
            ...Array<string>(26).fill('winter'),
            ...Array<string>(22).fill('summer'),
            ...Array<string>(12).fill('autumn'),
        ]
        const out = generateRepresentative(2, pool)
        expect(out).toHaveLength(2)
        // The two heaviest survive; lighter ones cannot fit in 2 slots.
        expect(new Set(out)).toEqual(new Set(['spring', 'winter']))
    })

    it('handles a single distinct value', () => {
        expect(generateRepresentative(3, ['x', 'x'])).toEqual(['x', 'x', 'x'])
    })
})
