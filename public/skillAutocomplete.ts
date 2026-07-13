import { getSkillData, getSkillmeta, getSkillnames } from './state'
import type { SkillData, SkillMeta, SkillNames } from './types'

export type AutocompleteMode = 'regular' | 'unique' | 'all'

const DEFAULT_LIMIT = 8

function passesMode(
    baseCost: number | undefined,
    mode: AutocompleteMode,
): boolean {
    if (mode === 'all') return true
    const cost = baseCost ?? 200
    return mode === 'unique' ? cost === 0 : cost > 0
}

/**
 * Pure ranking function for skill-name suggestions. Splits matches into
 * prefix vs substring buckets so users typing "corner" see "Corner Recovery
 * ○" before "Sprint Corners ○". Empty query returns the first `limit`
 * skills that pass the mode filter so a fresh focus shows something.
 */
export function filterSkillSuggestions(
    query: string,
    mode: AutocompleteMode,
    skillnames: SkillNames | null,
    skillmeta: SkillMeta | null,
    limit: number = DEFAULT_LIMIT,
    exclude: Iterable<string> | null = null,
    skillData: SkillData | null = null,
): string[] {
    if (!skillnames) return []
    const normalizedQuery = query.toLowerCase().trim()
    const excludeSet = exclude ? new Set(exclude) : null

    const prefix: string[] = []
    const substring: string[] = []
    const all: string[] = []

    for (const [id, names] of Object.entries(skillnames)) {
        const canonical = names?.[0]
        if (!canonical) continue
        // Skip phantom names with no simulatable skill_data record (e.g. the
        // auto-generated "X (inherited)" uniques). Only filters once data has
        // loaded so the picker isn't empty mid-load.
        if (skillData && !(id in skillData)) continue
        if (!passesMode(skillmeta?.[id]?.baseCost, mode)) continue
        if (excludeSet?.has(canonical)) continue

        if (!normalizedQuery) {
            all.push(canonical)
            continue
        }

        const lower = canonical.toLowerCase()
        if (lower.startsWith(normalizedQuery)) {
            prefix.push(canonical)
        } else if (lower.includes(normalizedQuery)) {
            substring.push(canonical)
        }
    }

    const collator = new Intl.Collator('en', { sensitivity: 'base' })
    const sortFn = (a: string, b: string) => collator.compare(a, b)
    if (!normalizedQuery) {
        return all.sort(sortFn).slice(0, limit)
    }
    prefix.sort(sortFn)
    substring.sort(sortFn)
    return [...prefix, ...substring].slice(0, limit)
}

interface AttachOptions {
    /** Override the data source for tests; defaults to live state. */
    getNames?: () => SkillNames | null
    getMeta?: () => SkillMeta | null
    getData?: () => SkillData | null
    limit?: number
    /** Names to suppress from suggestions (e.g. skills already in the list). */
    getExclude?: () => Iterable<string> | null
}

const ITEM_BASE_CLASSES =
    'px-2 py-1 text-[13px] cursor-pointer text-zinc-200 truncate'
const ITEM_HIGHLIGHT_CLASSES = 'bg-sky-700'
const LIST_CLASSES =
    'fixed z-50 max-h-60 overflow-y-auto bg-zinc-800 border border-zinc-600 rounded shadow-lg'

/**
 * Wires a typeahead dropdown onto an existing text input. The dropdown
 * lives on document.body and is positioned with getBoundingClientRect, so
 * the surrounding flex layouts stay untouched.
 *
 * On selection, the input's value is set and a `change` event is fired so
 * existing on-blur handlers (which call getCanonicalSkillName) keep working.
 *
 * Returns a detach function the caller can invoke if it removes the input
 * before blur (e.g. when re-rendering the parent UI).
 */
export function attachSkillAutocomplete(
    input: HTMLInputElement,
    mode: AutocompleteMode,
    options: AttachOptions = {},
): () => void {
    const getNames = options.getNames ?? getSkillnames
    const getMeta = options.getMeta ?? getSkillmeta
    const getData = options.getData ?? getSkillData
    const limit = options.limit ?? DEFAULT_LIMIT
    const getExclude = options.getExclude

    const list = document.createElement('ul')
    list.className = LIST_CLASSES
    list.style.display = 'none'
    list.setAttribute('role', 'listbox')

    let suggestions: string[] = []
    let highlighted = -1
    // Tracks whether the user actively chose a suggestion (arrow keys or
    // mouse hover). Reset on each keystroke so deleting all text returns to
    // the "auto-highlight is just a default" state.
    let userPickedSuggestion = false
    let detached = false

    const positionList = () => {
        const rect = input.getBoundingClientRect()
        list.style.left = `${rect.left}px`
        list.style.top = `${rect.bottom}px`
        list.style.minWidth = `${rect.width}px`
    }

    const closeList = () => {
        list.style.display = 'none'
        highlighted = -1
    }

    const renderItems = () => {
        list.innerHTML = ''
        suggestions.forEach((name, index) => {
            const item = document.createElement('li')
            item.textContent = name
            item.setAttribute('role', 'option')
            item.className =
                index === highlighted
                    ? `${ITEM_BASE_CLASSES} ${ITEM_HIGHLIGHT_CLASSES}`
                    : ITEM_BASE_CLASSES
            item.addEventListener('mouseenter', () => {
                highlighted = index
                userPickedSuggestion = true
                renderItems()
            })
            // mousedown fires before blur, so we can commit before the
            // input's blur handler closes the dropdown and reads the value.
            item.addEventListener('mousedown', (e) => {
                e.preventDefault()
                commit(index)
            })
            list.appendChild(item)
        })
    }

    const refresh = () => {
        if (detached) return
        suggestions = filterSkillSuggestions(
            input.value,
            mode,
            getNames(),
            getMeta(),
            limit,
            getExclude?.() ?? null,
            getData(),
        )
        if (suggestions.length === 0) {
            closeList()
            return
        }
        // Auto-highlight the first match so Enter commits the top result
        // without requiring an extra ArrowDown.
        if (highlighted < 0 || highlighted >= suggestions.length) {
            highlighted = 0
        }
        positionList()
        list.style.display = 'block'
        renderItems()
    }

    const commit = (index: number) => {
        const value = suggestions[index]
        if (!value) return
        input.value = value
        closeList()
        input.dispatchEvent(new Event('change', { bubbles: true }))
        // The input is usually still focused after a mousedown commit;
        // blur it so the parent's existing blur handler runs.
        input.blur()
    }

    const onInput = () => {
        // Reset to 0 so the first suggestion is highlighted after each keystroke.
        highlighted = 0
        userPickedSuggestion = false
        refresh()
    }
    const onFocus = () => refresh()
    const onScroll = () => {
        if (list.style.display !== 'none') positionList()
    }
    const onKeyDown = (e: KeyboardEvent) => {
        if (list.style.display === 'none') return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            e.stopImmediatePropagation()
            if (suggestions.length === 0) return
            highlighted = (highlighted + 1) % suggestions.length
            userPickedSuggestion = true
            renderItems()
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            e.stopImmediatePropagation()
            if (suggestions.length === 0) return
            highlighted =
                highlighted <= 0 ? suggestions.length - 1 : highlighted - 1
            userPickedSuggestion = true
            renderItems()
        } else if (e.key === 'Enter') {
            // If the user cleared the input AND hasn't actively picked a
            // suggestion (arrow keys / hover), defer to the parent's Enter
            // handler (which will blur with empty value and delete the row).
            // The auto-highlight on suggestion 0 alone doesn't count as a pick:
            // without this defer, Enter would commit the top result and hijack
            // the delete. But once the user has navigated, Enter commits even
            // with empty input.
            if (input.value.trim() === '' && !userPickedSuggestion) {
                closeList()
                return
            }
            if (highlighted >= 0 && suggestions[highlighted]) {
                e.preventDefault()
                // Block sibling listeners (e.g. the rename input's own Enter
                // handler that calls input.blur() with the partial value).
                e.stopImmediatePropagation()
                commit(highlighted)
            }
        } else if (e.key === 'Escape') {
            // Just close the dropdown; let the input's own Esc handler decide
            // whether to abort the rename.
            e.stopImmediatePropagation()
            closeList()
        }
    }
    const onBlur = () => {
        // Defer so a mousedown on a list item gets a chance to commit first.
        setTimeout(closeList, 100)
    }

    input.addEventListener('input', onInput)
    input.addEventListener('focus', onFocus)
    input.addEventListener('keydown', onKeyDown)
    input.addEventListener('blur', onBlur)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    document.body.appendChild(list)

    const detach = () => {
        if (detached) return
        detached = true
        input.removeEventListener('input', onInput)
        input.removeEventListener('focus', onFocus)
        input.removeEventListener('keydown', onKeyDown)
        input.removeEventListener('blur', onBlur)
        window.removeEventListener('scroll', onScroll, true)
        window.removeEventListener('resize', onScroll)
        observer.disconnect()
        list.remove()
    }

    // Auto-detach when the input is removed from the DOM (e.g. parent
    // container's innerHTML is cleared on re-render). Without this the
    // dropdown <ul> would leak on document.body.
    const observer = new MutationObserver(() => {
        if (!input.isConnected) detach()
    })
    const observeTarget = input.getRootNode() as Node
    observer.observe(observeTarget, { childList: true, subtree: true })

    return detach
}
