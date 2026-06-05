// Shared viewport breakpoint helpers. The query mirrors Tailwind's `md`
// breakpoint (>=768px is desktop), so JS-driven layout decisions stay in
// lockstep with the `md:` utility classes used in the markup.
export const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)'

export function isMobileViewport(): boolean {
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

// Below this skills-pane width the seven-button discount row no longer fits
// comfortably next to the skill name, so the per-skill discount control
// collapses to a compact dropdown. This is measured against the pane that holds
// the discounts rather than the full window width, so a narrowed (resized)
// desktop pane collapses too — not just narrow phones.
export const DISCOUNT_DROPDOWN_MAX_PANEL_WIDTH = 480

export function shouldUseDiscountDropdownForWidth(panelWidth: number): boolean {
    return panelWidth < DISCOUNT_DROPDOWN_MAX_PANEL_WIDTH
}
