import { describe, expect, it } from 'vitest'
import { deriveSeason, parseLocationToTrackName, Season } from './utils'

describe('deriveSeason', () => {
    it('maps winter months', () => {
        expect(deriveSeason('12_01')).toBe(Season.Winter)
        expect(deriveSeason('01_02')).toBe(Season.Winter)
        expect(deriveSeason('02_01')).toBe(Season.Winter)
    })

    it('maps spring months', () => {
        expect(deriveSeason('03_01')).toBe(Season.Spring)
        expect(deriveSeason('04_02')).toBe(Season.Spring)
        expect(deriveSeason('05_01')).toBe(Season.Spring)
    })

    it('maps summer months', () => {
        expect(deriveSeason('06_01')).toBe(Season.Summer)
        expect(deriveSeason('07_02')).toBe(Season.Summer)
        expect(deriveSeason('08_01')).toBe(Season.Summer)
    })

    it('maps autumn months', () => {
        expect(deriveSeason('09_01')).toBe(Season.Autumn)
        expect(deriveSeason('10_02')).toBe(Season.Autumn)
        expect(deriveSeason('11_01')).toBe(Season.Autumn)
    })
})

describe('parseLocationToTrackName', () => {
    it('strips left arrow prefix', () => {
        expect(parseLocationToTrackName('⇐ Niigata')).toBe('Niigata')
        expect(parseLocationToTrackName('⇐ Tokyo')).toBe('Tokyo')
    })

    it('strips right arrow prefix', () => {
        expect(parseLocationToTrackName('⇒ Kyoto')).toBe('Kyoto')
        expect(parseLocationToTrackName('⇒ Hanshin')).toBe('Hanshin')
    })

    it('handles bare track names', () => {
        expect(parseLocationToTrackName('Nakayama')).toBe('Nakayama')
    })
})
