import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The results pane must scroll as a single unit: the table renders at full
// height and the table + uma/race box share one scrollbar when they overflow.
// These invariants guard against the regression where `overflow-x-auto` on the
// results container turned it into a vertical scroll box that flex-shrank,
// trapping the table in a tiny scroll area while the panel itself never moved.
const html = readFileSync(
    fileURLToPath(new URL('./index.html', import.meta.url)),
    'utf8',
)

function attrsOf(id: string): string {
    const open = html.indexOf(`id="${id}"`)
    expect(open, `#${id} should exist`).toBeGreaterThan(-1)
    // Grab the class attribute of the element bearing this id.
    const around = html.slice(html.lastIndexOf('<', open), html.indexOf('>', open))
    const match = around.match(/class="([^"]*)"/)
    return match ? match[1]! : ''
}

describe('results pane scroll layout', () => {
    it('the right pane clips rather than scrolling itself', () => {
        const cls = attrsOf('right-pane')
        expect(cls).toContain('flex')
        expect(cls).toContain('flex-col')
        expect(cls).toContain('overflow-hidden')
        expect(cls).not.toContain('overflow-y-auto')
    })

    it('a single inner scroller fills the remaining height', () => {
        const cls = attrsOf('right-scroll')
        expect(cls).toContain('flex-1')
        expect(cls).toContain('min-h-0')
        expect(cls).toContain('overflow-y-auto')
    })

    it('the results table and uma/race box live inside that scroller', () => {
        const scrollerOpen = html.indexOf('id="right-scroll"')
        const rightPaneOpen = html.indexOf('id="right-pane"')
        // Everything that should scroll together must appear after the scroller
        // opens and before the right pane closes.
        for (const id of ['results-container', 'uma-container', 'track-container']) {
            const at = html.indexOf(`id="${id}"`)
            expect(at, `#${id} should exist`).toBeGreaterThan(scrollerOpen)
            expect(at).toBeGreaterThan(rightPaneOpen)
        }
    })

    it('keeps the results table free to render at full height', () => {
        // The container may scroll horizontally for the wide table, but it must
        // not be the vertical scroller — otherwise it flex-shrinks and traps the
        // table. Vertical scrolling belongs to #right-scroll.
        const cls = attrsOf('results-container')
        expect(cls).toContain('overflow-x-auto')
        expect(cls).not.toContain('overflow-y-auto')
        expect(cls).not.toContain('flex-1')
    })
})
