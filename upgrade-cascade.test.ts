import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSkillNameLookup } from './public/skillHelpers'
import {
    addSkillToUmaFromTable,
    refreshGroupResults,
} from './public/resultsUI'
import {
    getCalculatedResultsCache,
    getCurrentConfig,
    getResultsMap,
    setCurrentConfig,
    setSkillmeta,
    setSkillNameToId,
    setSkillnames,
} from './public/state'
import type { SkillResult, SkillResultWithStatus } from './public/types'

// renderResultsTable reads document.getElementById and no-ops if the tbody is
// missing. Stubbing here lets us exercise the result-map side-effects without
// pulling in jsdom for a single test file.
vi.stubGlobal('document', {
    getElementById: () => null,
})

const freshResult = (skill: string, mean: number): SkillResult => ({
    skill,
    cost: 100,
    discount: 0,
    meanLength: mean,
    medianLength: mean,
    meanLengthPerCost: mean / 100,
    minLength: 0,
    maxLength: mean * 2,
    ciLower: 0,
    ciUpper: mean * 2,
})

const freshWithStatus = (
    skill: string,
    mean: number,
): SkillResultWithStatus => ({
    ...freshResult(skill, mean),
    status: 'fresh',
})

// Medium Straightaways group mirrors the Flash Forward ↑ ◎ ↑ ○ chain
// from the live data (lower order = more upgraded).
const FLASH_FORWARD = 'Flash Forward'
const MEDIUM_RARE = 'Medium Straightaways ◎'
const MEDIUM_NORMAL = 'Medium Straightaways ○'

function seedGroup(umaSkills: string[]): void {
    setCurrentConfig({
        skills: {
            [FLASH_FORWARD]: { discount: 10 },
            [MEDIUM_RARE]: { discount: 10 },
            [MEDIUM_NORMAL]: { discount: 10 },
        },
        uma: { skills: umaSkills },
    })
    const cache = getCalculatedResultsCache()
    cache.clear()
    cache.set(FLASH_FORWARD, freshResult(FLASH_FORWARD, 0.5))
    cache.set(MEDIUM_RARE, freshResult(MEDIUM_RARE, 0.3))
    cache.set(MEDIUM_NORMAL, freshResult(MEDIUM_NORMAL, 0.2))

    const results = getResultsMap()
    results.clear()
    // Seed results for every sibling not on Uma.
    for (const skill of [FLASH_FORWARD, MEDIUM_RARE, MEDIUM_NORMAL]) {
        if (!umaSkills.includes(skill)) {
            results.set(
                skill,
                freshWithStatus(
                    skill,
                    skill === FLASH_FORWARD
                        ? 0.5
                        : skill === MEDIUM_RARE
                          ? 0.3
                          : 0.2,
                ),
            )
        }
    }
}

describe('refreshGroupResults', () => {
    beforeAll(() => {
        setSkillmeta({
            '201103': { baseCost: 150, groupId: '20110', order: 20290 },
            '201101': { baseCost: 110, groupId: '20110', order: 20300 },
            '201102': { baseCost: 100, groupId: '20110', order: 20310 },
        })
        setSkillnames({
            '201103': [FLASH_FORWARD],
            '201101': [MEDIUM_RARE],
            '201102': [MEDIUM_NORMAL],
        })
        setSkillNameToId({
            [FLASH_FORWARD]: '201103',
            [MEDIUM_RARE]: '201101',
            [MEDIUM_NORMAL]: '201102',
        })
        buildSkillNameLookup()
    })

    beforeEach(() => {
        seedGroup([])
    })

    it('adding ○ invalidates every sibling cache and keeps ◎/Flash Forward pending', () => {
        // Caller updated uma.skills to [○] before invoking refreshGroupResults.
        seedGroup([MEDIUM_NORMAL])

        refreshGroupResults(MEDIUM_NORMAL)

        const cache = getCalculatedResultsCache()
        // Every sibling's cache is dropped — a change in uma.skills can affect any
        // sibling's simulation baseline, not just the more-upgraded ones.
        expect(cache.has(FLASH_FORWARD)).toBe(false)
        expect(cache.has(MEDIUM_RARE)).toBe(false)
        expect(cache.has(MEDIUM_NORMAL)).toBe(false)

        const results = getResultsMap()
        expect(results.get(FLASH_FORWARD)?.status).toBe('pending')
        expect(results.get(MEDIUM_RARE)?.status).toBe('pending')
        // ○ is on Uma; filter would hide it, so it's dropped from resultsMap.
        expect(results.has(MEDIUM_NORMAL)).toBe(false)
    })

    it('adding ◎ invalidates Flash Forward and drops dominated ○', () => {
        // Adding ◎ must not leave Flash Forward's cached mean in place, since
        // its simulation baseline changed.
        seedGroup([MEDIUM_RARE])

        refreshGroupResults(MEDIUM_RARE)

        const cache = getCalculatedResultsCache()
        expect(cache.has(FLASH_FORWARD)).toBe(false)
        expect(cache.has(MEDIUM_RARE)).toBe(false)
        expect(cache.has(MEDIUM_NORMAL)).toBe(false)

        const results = getResultsMap()
        expect(results.get(FLASH_FORWARD)?.status).toBe('pending')
        // ◎ is on Uma, ○ is dominated by ◎: both filtered out of results.
        expect(results.has(MEDIUM_RARE)).toBe(false)
        expect(results.has(MEDIUM_NORMAL)).toBe(false)
    })

    it('overwriting Flash Forward with ○ restores BOTH ◎ and Flash Forward to results', () => {
        // Swapping Flash Forward to ○ leaves only ○ on Uma, so Flash Forward
        // and ◎ should both appear in the results map.

        // Initial state: Uma had Flash Forward, ◎ and ○ were hidden.
        seedGroup([FLASH_FORWARD])
        // Simulate the hidden state of ◎ and ○ (filter would have removed them).
        const results = getResultsMap()
        results.delete(MEDIUM_RARE)
        results.delete(MEDIUM_NORMAL)

        // User swaps: uma.skills is now [○] and refreshGroupResults is called.
        setCurrentConfig({
            skills: {
                [FLASH_FORWARD]: { discount: 10 },
                [MEDIUM_RARE]: { discount: 10 },
                [MEDIUM_NORMAL]: { discount: 10 },
            },
            uma: { skills: [MEDIUM_NORMAL] },
        })
        refreshGroupResults(MEDIUM_NORMAL)

        expect(results.has(FLASH_FORWARD)).toBe(true)
        expect(results.has(MEDIUM_RARE)).toBe(true)
        expect(results.has(MEDIUM_NORMAL)).toBe(false)
    })

    it('removing the Uma skill restores all siblings to results', () => {
        seedGroup([FLASH_FORWARD])
        const results = getResultsMap()
        // Hidden because of Flash Forward on Uma.
        results.delete(MEDIUM_RARE)
        results.delete(MEDIUM_NORMAL)

        setCurrentConfig({
            skills: {
                [FLASH_FORWARD]: { discount: 10 },
                [MEDIUM_RARE]: { discount: 10 },
                [MEDIUM_NORMAL]: { discount: 10 },
            },
            uma: { skills: [] },
        })
        refreshGroupResults(FLASH_FORWARD)

        expect(results.has(FLASH_FORWARD)).toBe(true)
        expect(results.has(MEDIUM_RARE)).toBe(true)
        expect(results.has(MEDIUM_NORMAL)).toBe(true)
    })

    it('no-ops for a skill outside any group', () => {
        // Use a skill id not registered in skillmeta; nothing should change.
        refreshGroupResults('Unknown Skill')
        const cache = getCalculatedResultsCache()
        expect(cache.size).toBe(3)
    })
})

describe('addSkillToUmaFromTable restores the replaced variant (#33)', () => {
    beforeEach(() => {
        setCurrentConfig({
            skills: {
                [FLASH_FORWARD]: { discount: 10 },
                [MEDIUM_RARE]: { discount: 10 },
                [MEDIUM_NORMAL]: { discount: 10 },
            },
            uma: { skills: [MEDIUM_RARE] },
        })
        const cache = getCalculatedResultsCache()
        cache.clear()
        cache.set(FLASH_FORWARD, freshResult(FLASH_FORWARD, 0.5))
        cache.set(MEDIUM_NORMAL, freshResult(MEDIUM_NORMAL, 0.2))

        const results = getResultsMap()
        results.clear()
        // ◎ is on Uma, so only Flash Forward is visible in results initially.
        // ○ is dominated by ◎ and isn't shown either.
        results.set(FLASH_FORWARD, freshWithStatus(FLASH_FORWARD, 0.5))
    })

    it('adding ○ while ◎ is on Uma brings ◎ back to the results table', () => {
        // Replacing ◎ with ○ from the table must rehydrate ◎ from cache rather
        // than drop it.
        addSkillToUmaFromTable(MEDIUM_NORMAL, 100)

        const cfg = getCurrentConfig()
        expect(cfg?.uma?.skills).toEqual([MEDIUM_NORMAL])

        const results = getResultsMap()
        // Flash Forward stays visible (not on Uma, not dominated).
        expect(results.has(FLASH_FORWARD)).toBe(true)
        // ◎ is the replaced variant; it should return to the table.
        expect(results.has(MEDIUM_RARE)).toBe(true)
        // ○ is now on Uma; it stays out of the results table.
        expect(results.has(MEDIUM_NORMAL)).toBe(false)
    })

    it('adding ◎ while ○ is on Uma keeps ○ hidden (dominated)', () => {
        setCurrentConfig({
            skills: {
                [FLASH_FORWARD]: { discount: 10 },
                [MEDIUM_RARE]: { discount: 10 },
                [MEDIUM_NORMAL]: { discount: 10 },
            },
            uma: { skills: [MEDIUM_NORMAL] },
        })
        const results = getResultsMap()
        results.clear()
        results.set(FLASH_FORWARD, freshWithStatus(FLASH_FORWARD, 0.5))
        results.set(MEDIUM_RARE, freshWithStatus(MEDIUM_RARE, 0.3))

        addSkillToUmaFromTable(MEDIUM_RARE, 110)

        expect(getCurrentConfig()?.uma?.skills).toEqual([MEDIUM_RARE])
        // ○ is now dominated by ◎ on Uma; shouldn't reappear.
        expect(results.has(MEDIUM_NORMAL)).toBe(false)
        // ◎ is on Uma; out of results.
        expect(results.has(MEDIUM_RARE)).toBe(false)
        // Flash Forward still shown.
        expect(results.has(FLASH_FORWARD)).toBe(true)
    })
})
