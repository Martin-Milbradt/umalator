import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TARGET_SHA, shouldPin } from './scripts/pin-submodule.mjs'

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8')

describe('pin-submodule TARGET_SHA', () => {
    it('is a full 40-char lowercase hex SHA', () => {
        expect(TARGET_SHA).toMatch(/^[0-9a-f]{40}$/)
    })
})

describe('shouldPin', () => {
    it('is false only for the exact target SHA', () => {
        expect(shouldPin(TARGET_SHA)).toBe(false)
        expect(shouldPin(` ${TARGET_SHA}\n`)).toBe(false)
    })

    it('is true for any other, short, or missing SHA', () => {
        expect(shouldPin('6ba5ca0')).toBe(true)
        expect(shouldPin(TARGET_SHA.slice(0, 7))).toBe(true)
        expect(shouldPin('')).toBe(true)
        expect(shouldPin(undefined)).toBe(true)
        expect(shouldPin(null)).toBe(true)
    })
})

// The pinned commit is referenced in human-facing docs as well as the script.
// These guard against the docs drifting from the one place that actually does
// the checkout (the exact "silently on the wrong commit" failure issue #66 is
// about).
describe('pinned SHA stays consistent across the repo', () => {
    it.each(['docs/cloud-setup.md', 'CLAUDE.md'])('%s documents TARGET_SHA', (file) => {
        expect(read(file)).toContain(TARGET_SHA)
    })

    it.each(['start_web.ps1', '.github/workflows/deploy.yml'])(
        '%s delegates the pin to the script instead of hardcoding the SHA',
        (file) => {
            const text = read(file)
            expect(text).toContain('pin-submodule.mjs')
            expect(text).not.toContain(TARGET_SHA)
        },
    )
})
