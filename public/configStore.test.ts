import { describe, expect, it } from 'vitest'
import { validateConfigData } from './configStore'

describe('validateConfigData', () => {
    it('accepts a minimal config with a skills object', () => {
        const data = { skills: {} }
        expect(validateConfigData(data)).toBe(data)
    })

    it('accepts a config with populated skills and other fields', () => {
        const data = {
            skills: { 'Left-Handed': { discount: 10 } },
            track: { distance: 1200 },
            uma: { speed: 1200 },
        }
        expect(validateConfigData(data)).toBe(data)
    })

    it.each([
        ['null', null],
        ['a number', 42],
        ['a string', 'nope'],
        ['an array', []],
        ['an object without skills', { track: {} }],
        ['an object with skills set to null', { skills: null }],
        ['an object with skills set to a string', { skills: 'x' }],
    ])('rejects %s', (_label, data) => {
        expect(() => validateConfigData(data)).toThrow(/skills/)
    })
})
