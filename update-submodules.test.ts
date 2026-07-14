import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SUBMODULES } from './scripts/update-submodules.mjs'

const read = (file: string): string => readFileSync(file, 'utf8')

describe('update-submodules wiring', () => {
    it('updates the parent before the nested submodule', () => {
        // Checking out the parent moves its recorded nested gitlink, so the
        // nested update must come after it or it would be undone.
        expect(SUBMODULES).toEqual(['uma-tools', 'uma-tools/uma-skill-tools'])
    })

    it.each([
        'package.json',
        '.github/workflows/ci.yml',
        '.github/workflows/deploy.yml',
        'start_web.ps1',
    ])('%s runs the update script', (file) => {
        expect(read(file)).toContain('update-submodules.mjs')
    })

    it.each(['docs/cloud-setup.md', 'CLAUDE.md'])(
        '%s documents the script and pins no SHA',
        (file) => {
            const text = read(file)
            expect(text).toContain('update-submodules.mjs')
            // Nothing is pinned; a full SHA in the docs would mean a pin
            // mechanism crept back in without updating them.
            expect(text).not.toMatch(/\b[0-9a-f]{40}\b/)
        },
    )
})
