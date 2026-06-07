import { describe, expect, it } from 'vitest'
import { bootstrapMeanCI, calculateStatsFromRawResults } from './utils'

// A zero-inflated, bimodal sample like a recovery/trigger skill: most races gain
// nothing, a cluster gains a little, a few gain a lot. mean = 32.5 / 500 = 0.065.
const zeroInflated = [
    ...Array<number>(470).fill(0),
    ...Array<number>(25).fill(0.5),
    ...Array<number>(5).fill(4),
]

describe('bootstrapMeanCI', () => {
    it('never returns a bound below the data range (no spurious negatives)', () => {
        const ci = bootstrapMeanCI([...zeroInflated].sort((a, b) => a - b), 95)
        expect(ci.lower).toBeGreaterThanOrEqual(0)
        expect(ci.upper).toBeLessThanOrEqual(4)
    })

    it('brackets the sample mean', () => {
        const sorted = [...zeroInflated].sort((a, b) => a - b)
        const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
        const ci = bootstrapMeanCI(sorted, 95)
        expect(ci.lower).toBeLessThanOrEqual(mean)
        expect(ci.upper).toBeGreaterThanOrEqual(mean)
    })

    it('is reproducible for identical input (seeded from the sample)', () => {
        const sorted = [...zeroInflated].sort((a, b) => a - b)
        expect(bootstrapMeanCI(sorted, 95)).toEqual(bootstrapMeanCI(sorted, 95))
    })

    it('widens as the confidence level rises', () => {
        const sorted = [...zeroInflated].sort((a, b) => a - b)
        const at90 = bootstrapMeanCI(sorted, 90)
        const at99 = bootstrapMeanCI(sorted, 99)
        expect(at99.upper - at99.lower).toBeGreaterThanOrEqual(
            at90.upper - at90.lower,
        )
    })

    it('collapses to the value for a single sample', () => {
        expect(bootstrapMeanCI([7], 95)).toEqual({ lower: 7, upper: 7 })
    })

    it('collapses to the value when every sample is identical', () => {
        const ci = bootstrapMeanCI([3, 3, 3, 3, 3], 95)
        expect(ci).toEqual({ lower: 3, upper: 3 })
    })
})

describe('calculateStatsFromRawResults mean CI', () => {
    it('keeps the mean CI non-negative for a non-negative zero-inflated sample', () => {
        const r = calculateStatsFromRawResults(zeroInflated, 110, 0, 'X', 95)
        // The bug this replaced: a symmetric normal CI dipped below 0 here.
        expect(r.ciMeanLower).toBeGreaterThanOrEqual(0)
        expect(r.ciMeanLower).toBeLessThanOrEqual(r.meanLength)
        expect(r.ciMeanUpper).toBeGreaterThanOrEqual(r.meanLength)
    })

    it('keeps the outcome Range (ciLower/ciUpper) as raw percentiles', () => {
        const r = calculateStatsFromRawResults([1, 2, 3, 4, 5], 100, 0, 'X', 95)
        // 2.5th percentile index = floor(5*0.025)=0 -> 1; 97.5th = index 4 -> 5
        expect(r.ciLower).toBe(1)
        expect(r.ciUpper).toBe(5)
    })

    it('produces identical results across runs (deterministic bootstrap)', () => {
        const a = calculateStatsFromRawResults(zeroInflated, 110, 0, 'X', 95)
        const b = calculateStatsFromRawResults(zeroInflated, 110, 0, 'X', 95)
        expect(a).toEqual(b)
    })
})
