import { isMobileViewport } from './responsive'

// The split between the skills pane and the results pane is user-resizable.
// On desktop the divider is vertical and drags the left pane's *width*
// (`--left-w`); on mobile the layout stacks and the divider is horizontal,
// dragging the top pane's *height* (`--top-h`). Both values live as CSS custom
// properties on #layout and are read by the panes via arbitrary-value classes.

const STORAGE_LEFT = 'umalator:left-width'
const STORAGE_TOP = 'umalator:top-height'

const DEFAULT_LEFT = '800px'
const DEFAULT_TOP = '45vh'

// Keep both panes usable: never let the drag collapse either side below these.
const MIN_LEFT = 320
const MIN_RIGHT = 320
const MIN_TOP = 120
const MIN_BOTTOM = 160

export function setupPaneResizer(): void {
    const layout = document.getElementById('layout')
    const divider = document.getElementById('pane-divider')
    if (!layout || !divider) return

    const savedLeft = localStorage.getItem(STORAGE_LEFT)
    if (savedLeft) layout.style.setProperty('--left-w', savedLeft)
    const savedTop = localStorage.getItem(STORAGE_TOP)
    if (savedTop) layout.style.setProperty('--top-h', savedTop)

    function clampLeftToContainer(): void {
        if (!layout || isMobileViewport()) return
        const rect = layout.getBoundingClientRect()
        const max = rect.width - MIN_RIGHT
        const current =
            parseFloat(layout.style.getPropertyValue('--left-w')) || 0
        if (current > max) {
            layout.style.setProperty(
                '--left-w',
                `${Math.max(MIN_LEFT, max)}px`,
            )
        }
    }

    function applyDrag(clientX: number, clientY: number): void {
        if (!layout) return
        const rect = layout.getBoundingClientRect()
        if (isMobileViewport()) {
            const max = rect.height - MIN_BOTTOM
            const height = Math.max(
                MIN_TOP,
                Math.min(clientY - rect.top, max),
            )
            layout.style.setProperty('--top-h', `${height}px`)
        } else {
            const max = rect.width - MIN_RIGHT
            const width = Math.max(MIN_LEFT, Math.min(clientX - rect.left, max))
            layout.style.setProperty('--left-w', `${width}px`)
        }
    }

    function persist(): void {
        if (!layout) return
        if (isMobileViewport()) {
            const value = layout.style.getPropertyValue('--top-h')
            if (value) localStorage.setItem(STORAGE_TOP, value)
        } else {
            const value = layout.style.getPropertyValue('--left-w')
            if (value) localStorage.setItem(STORAGE_LEFT, value)
        }
    }

    let dragging = false

    divider.addEventListener('pointerdown', (e) => {
        dragging = true
        divider.setPointerCapture(e.pointerId)
        document.body.style.userSelect = 'none'
        e.preventDefault()
    })
    divider.addEventListener('pointermove', (e) => {
        if (!dragging) return
        applyDrag(e.clientX, e.clientY)
    })
    // Arrow (not a hoisted declaration) so it captures the non-null narrowing
    // of `divider` from the guard above.
    const endDrag = (e: PointerEvent): void => {
        if (!dragging) return
        dragging = false
        if (divider.hasPointerCapture(e.pointerId)) {
            divider.releasePointerCapture(e.pointerId)
        }
        document.body.style.userSelect = ''
        persist()
    }
    divider.addEventListener('pointerup', endDrag)
    divider.addEventListener('pointercancel', endDrag)

    // Double-click resets the active axis to its default proportion.
    divider.addEventListener('dblclick', () => {
        if (isMobileViewport()) {
            layout.style.setProperty('--top-h', DEFAULT_TOP)
            localStorage.removeItem(STORAGE_TOP)
        } else {
            layout.style.setProperty('--left-w', DEFAULT_LEFT)
            localStorage.removeItem(STORAGE_LEFT)
        }
    })

    // A saved width can exceed a now-smaller window; keep the right pane usable.
    window.addEventListener('resize', clampLeftToContainer)
    clampLeftToContainer()
}
