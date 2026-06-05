// Shared viewport breakpoint helpers. The query mirrors Tailwind's `md`
// breakpoint (>=768px is desktop), so JS-driven layout decisions stay in
// lockstep with the `md:` utility classes used in the markup.
export const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)'

export function isMobileViewport(): boolean {
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}
