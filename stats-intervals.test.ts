import { describe, expect, it } from 'vitest'
import {
    calculateStatsFromRawResults,
    standardNormalQuantile,
    zForConfidenceLevel,
} from './utils'

describe('standardNormalQuantile', () => {
    it('matches known normal quantiles', () => {
        expect(standardNormalQuantile(0.975)).toBeCloseTo(1.959964, 4)
        expect(standardNormalQuantile(0.95)).toBeCloseTo(1.644854, 4)
        expect(standardNormalQuantile(0.5)).toBeCloseTo(0, 6)
        expect(standardNormalQuantile(0.025)).toBeCloseTo(-1.959964, 4)
    })

    it('rejects p outside (0,1)', () => {
        expect(() => standardNormalQuantile(0)).toThrow()
        expect(() => standardNormalQuantile(1)).toThrow()
        expect(() => standardNormalQuantile(-0.1)).toThrow()
    })
})

describe('zForConfidenceLevel', () => {
    it('gives the standard z-scores', () => {
        expect(zForConfidenceLevel(90)).toBeCloseTo(1.644854, 4)
        expect(zForConfidenceLevel(95)).toBeCloseTo(1.959964, 4)
        expect(zForConfidenceLevel(99)).toBeCloseTo(2.575829, 4)
    })
})

describe('calculateStatsFromRawResults confidence interval of the mean', () => {
    it('computes mean ± z·(s/√n) with the sample standard deviation', () => {
        const r = calculateStatsFromRawResults([1, 2, 3, 4, 5], 100, 0, 'X', 95)
        // mean=3, sample sd=√2.5≈1.5811, SE≈0.70711, z≈1.95996, margin≈1.3859
        expect(r.meanLength).toBeCloseTo(3, 10)
        expect(r.ciMeanLower).toBeCloseTo(1.6141, 3)
        expect(r.ciMeanUpper).toBeCloseTo(4.3859, 3)
    })

    it('is tighter than the percentile range for a spread sample', () => {
        const r = calculateStatsFromRawResults([1, 2, 3, 4, 5], 100, 0, 'X', 95)
        // percentile range spans the extremes here; CI of the mean is inside it
        expect(r.ciMeanLower).toBeGreaterThan(r.ciLower)
        expect(r.ciMeanUpper).toBeLessThan(r.ciUpper)
    })

    it('collapses to the mean for a single sample (zero margin)', () => {
        const r = calculateStatsFromRawResults([7], 100, 0, 'X', 95)
        expect(r.ciMeanLower).toBeCloseTo(7, 10)
        expect(r.ciMeanUpper).toBeCloseTo(7, 10)
    })

    it('widens the interval as the confidence level rises', () => {
        const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        const at90 = calculateStatsFromRawResults(sample, 100, 0, 'X', 90)
        const at99 = calculateStatsFromRawResults(sample, 100, 0, 'X', 99)
        const width90 = at90.ciMeanUpper - at90.ciMeanLower
        const width99 = at99.ciMeanUpper - at99.ciMeanLower
        expect(width99).toBeGreaterThan(width90)
    })

    it('keeps the percentile range as the outcome spread (ciLower/ciUpper)', () => {
        const r = calculateStatsFromRawResults([1, 2, 3, 4, 5], 100, 0, 'X', 95)
        // 2.5th percentile index = floor(5*0.025)=0 -> 1; 97.5th = index 4 -> 5
        expect(r.ciLower).toBe(1)
        expect(r.ciUpper).toBe(5)
    })
})
