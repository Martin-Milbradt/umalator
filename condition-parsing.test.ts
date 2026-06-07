import { describe, expect, it } from 'vitest'
import { parseAndBranch } from './utils'

describe('parseAndBranch repeated-field handling', () => {
    it('intersects two bounds on the same field', () => {
        // distance_type>=2 -> [2,3,4]; distance_type<=3 -> [1,2,3]; AND -> [2,3]
        const r = parseAndBranch('distance_type>=2&distance_type<=3')
        expect(r.distanceTypes).toEqual([2, 3])
    })

    it('yields an empty (impossible) set for contradictory bounds', () => {
        const r = parseAndBranch('distance_type==1&distance_type==4')
        expect(r.distanceTypes).toEqual([])
    })

    it('keeps independent fields separate', () => {
        const r = parseAndBranch('distance_type==4&ground_type==1')
        expect(r.distanceTypes).toEqual([4])
        expect(r.groundTypes).toEqual([1])
    })

    it('drops dynamic/unsupported terms (uma-tools evaluates them at runtime)', () => {
        // is_finalcorner and corner are not static fields, so only the static
        // distance_type term survives the pre-filter.
        const r = parseAndBranch('is_finalcorner==1&corner==0&distance_type==4')
        expect(r.distanceTypes).toEqual([4])
        expect(Object.keys(r)).toEqual(['distanceTypes'])
    })
})
