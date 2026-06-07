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

    it.each([
        ['skill entry is a string', { skills: { foo: 'bar' } }, /skills\["foo"\]/],
        ['skill entry is an array', { skills: { foo: [] } }, /skills\["foo"\]/],
        [
            'skill discount is a string',
            { skills: { foo: { discount: '10' } } },
            /discount/,
        ],
        [
            'skill default is a boolean',
            { skills: { foo: { default: true } } },
            /default/,
        ],
        ['uma is a string', { skills: {}, uma: 'no' }, /uma/],
        [
            'uma stat is a string',
            { skills: {}, uma: { speed: '1200' } },
            /uma\.speed/,
        ],
        [
            'uma.skills is not an array',
            { skills: {}, uma: { skills: 'oops' } },
            /uma\.skills/,
        ],
        [
            'uma.skills contains a non-string',
            { skills: {}, uma: { skills: ['ok', 42] } },
            /uma\.skills/,
        ],
        ['track is a string', { skills: {}, track: 'no' }, /track/],
        [
            'track.distance is a boolean',
            { skills: {}, track: { distance: true } },
            /track\.distance/,
        ],
        ['seed is a string', { skills: {}, seed: 'x' }, /seed/],
        ['seed is a boolean', { skills: {}, seed: true }, /seed/],
    ])('rejects when %s', (_label, data, pattern) => {
        expect(() => validateConfigData(data)).toThrow(pattern)
    })

    it.each([
        [
            'empty uma',
            { skills: {}, uma: {} },
        ],
        [
            'null numeric uma fields',
            {
                skills: {},
                uma: {
                    speed: null,
                    stamina: null,
                    mood: null,
                    skillPoints: null,
                },
            },
        ],
        [
            'uma.skills is an array of strings',
            { skills: {}, uma: { skills: ['100021', '200172'] } },
        ],
        [
            'track.distance as a numeric string',
            { skills: {}, track: { distance: '2400' } },
        ],
        [
            'track.distance as null',
            { skills: {}, track: { distance: null } },
        ],
        ['a numeric seed', { skills: {}, seed: 12345 }],
        ['a null seed', { skills: {}, seed: null }],
    ])('accepts %s', (_label, data) => {
        expect(validateConfigData(data)).toBe(data)
    })
})
