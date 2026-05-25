import { describe, expect, it } from 'vitest'
import {
    isBareUmalatorConfig,
    isUmalatorEnvelope,
    UMALATOR_FORMAT_ID,
    unwrapBareUmalatorConfig,
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

describe('bare umalator config', () => {
    it('recognises a bare config by its skills object', () => {
        expect(isBareUmalatorConfig({ skills: {} })).toBe(true)
        expect(isBareUmalatorConfig(sampleConfig)).toBe(true)
    })

    it('does not match an envelope (avoids double-handling)', () => {
        const envelope = {
            format: UMALATOR_FORMAT_ID,
            name: 'x.json',
            config: sampleConfig,
        }
        expect(isBareUmalatorConfig(envelope)).toBe(false)
    })

    it('does not match moomulator data (skills is an array)', () => {
        expect(
            isBareUmalatorConfig({
                outfitId: '105001',
                skills: ['100501', '200172'],
            }),
        ).toBe(false)
    })

    it.each([
        ['null', null],
        ['array', []],
        ['string', 'nope'],
        ['object without skills', { uma: {} }],
        ['object with skills set to null', { skills: null }],
    ])('rejects %s', (_label, data) => {
        expect(isBareUmalatorConfig(data)).toBe(false)
    })

    it('unwrap returns the validated config', () => {
        expect(unwrapBareUmalatorConfig(sampleConfig)).toEqual(sampleConfig)
    })

    it('unwrap throws for non-bare-config input', () => {
        expect(() => unwrapBareUmalatorConfig({ uma: {} })).toThrow(
            /bare umalator config/,
        )
    })
})
