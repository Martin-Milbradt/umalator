import { describe, expect, it } from 'vitest'
import {
    isUmalatorEnvelope,
    UMALATOR_FORMAT_ID,
    unwrapUmalatorEnvelope,
    wrapConfigForClipboard,
} from './clipboardFormat'
import type { Config } from './types'

const sampleConfig: Config = {
    skills: {
        Concentration: { discount: 30 },
        'End Closer Savvy ○': { discount: 0 },
    },
    track: { distance: 1600, trackName: 'Tokyo' },
    uma: { speed: 1200, unique: 'Nemesis', skills: ['Concentration'] },
}

describe('clipboard envelope', () => {
    it('round-trips a config through wrap → JSON → unwrap', () => {
        const payload = wrapConfigForClipboard('CM14.json', sampleConfig)
        const parsed = JSON.parse(payload)
        expect(parsed).toMatchObject({
            format: UMALATOR_FORMAT_ID,
            name: 'CM14.json',
        })
        expect(parsed).not.toHaveProperty('version')
        const { name, config } = unwrapUmalatorEnvelope(parsed)
        expect(name).toBe('CM14.json')
        expect(config).toEqual(sampleConfig)
    })

    it('isUmalatorEnvelope discriminates by format field', () => {
        expect(isUmalatorEnvelope({ format: UMALATOR_FORMAT_ID })).toBe(true)
        // Moomulator-shaped data has no format field.
        expect(
            isUmalatorEnvelope({ outfitId: '105001', skills: ['100501'] }),
        ).toBe(false)
        // Bare config (no envelope).
        expect(isUmalatorEnvelope(sampleConfig)).toBe(false)
        expect(isUmalatorEnvelope(null)).toBe(false)
        expect(isUmalatorEnvelope([])).toBe(false)
        expect(isUmalatorEnvelope('string')).toBe(false)
    })

    it.each([
        ['missing name', { format: UMALATOR_FORMAT_ID, config: sampleConfig }],
        ['empty name', { format: UMALATOR_FORMAT_ID, name: '   ', config: sampleConfig }],
        ['missing config', { format: UMALATOR_FORMAT_ID, name: 'x.json' }],
        [
            'config without skills',
            { format: UMALATOR_FORMAT_ID, name: 'x.json', config: { uma: {} } },
        ],
    ])('rejects envelope with %s', (_label, payload) => {
        expect(() => unwrapUmalatorEnvelope(payload)).toThrow()
    })

    it('rejects non-envelope payloads in unwrap', () => {
        expect(() => unwrapUmalatorEnvelope({ skills: {} })).toThrow(
            /envelope/i,
        )
    })
})
