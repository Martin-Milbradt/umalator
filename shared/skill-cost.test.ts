import { describe, expect, it } from 'vitest'
import {
    applyDiscount,
    calculateSkillCost,
    type SkillCostMeta,
} from './skill-cost'

describe('applyDiscount', () => {
    it('floors fractional costs', () => {
        expect(applyDiscount(110, 35)).toBe(71)
        expect(applyDiscount(130, 35)).toBe(84)
    })

    it('returns base cost at 0% discount', () => {
        expect(applyDiscount(200, 0)).toBe(200)
    })

    it('returns 0 at 100% discount', () => {
        expect(applyDiscount(200, 100)).toBe(0)
    })

    // 170 * 0.7 = 118.999... in IEEE 754, so naive flooring yields 118, but the
    // game displays 119 (e.g. Corner Recovery ○ at 30% off). The same off-by-one
    // affects baseCost=90 → 63 and baseCost=180 → 126 at 30%.
    it('matches in-game cost when 1 - discount/100 is not exactly representable', () => {
        expect(applyDiscount(170, 30)).toBe(119)
        expect(applyDiscount(90, 30)).toBe(63)
        expect(applyDiscount(180, 30)).toBe(126)
    })
})

describe('calculateSkillCost', () => {
    const zeroDiscount = () => 0

    it('returns own discounted cost when the skill has no group', () => {
        const skillMeta: Record<string, SkillCostMeta> = {
            s: { baseCost: 200 },
        }
        const cost = calculateSkillCost({
            skillId: 's',
            discount: 10,
            skillMeta,
            skillNames: { s: ['Solo'] },
            umaSkillIds: [],
            getPrereqDiscount: zeroDiscount,
        })
        expect(cost).toBe(180)
    })

    it('charges every uncovered prerequisite in the group', () => {
        // Flash Forward chain. Order: FF (20290) < ◎ (20300) < ○ (20310).
        const skillMeta: Record<string, SkillCostMeta> = {
            ff: { baseCost: 150, groupId: 'g', order: 20290, score: 394 },
            rare: { baseCost: 110, groupId: 'g', order: 20300, score: 217 },
            normal: { baseCost: 100, groupId: 'g', order: 20310, score: 174 },
        }
        const skillNames = {
            ff: ['Flash Forward'],
            rare: ['Medium Straightaways ◎'],
            normal: ['Medium Straightaways ○'],
        }

        // Uma has nothing: FF charges both prereqs.
        expect(
            calculateSkillCost({
                skillId: 'ff',
                discount: 0,
                skillMeta,
                skillNames,
                umaSkillIds: [],
                getPrereqDiscount: zeroDiscount,
            }),
        ).toBe(150 + 110 + 100)

        // Uma has ◎: FF only charges for itself (◎ covers ○).
        expect(
            calculateSkillCost({
                skillId: 'ff',
                discount: 0,
                skillMeta,
                skillNames,
                umaSkillIds: ['rare'],
                getPrereqDiscount: zeroDiscount,
            }),
        ).toBe(150)

        // Uma has ○: FF charges itself and ◎ (○ is covered).
        expect(
            calculateSkillCost({
                skillId: 'ff',
                discount: 0,
                skillMeta,
                skillNames,
                umaSkillIds: ['normal'],
                getPrereqDiscount: zeroDiscount,
            }),
        ).toBe(150 + 110)
    })

    it('skips purple siblings identified by negative score', () => {
        // Competitive Spirit group: ◎ and ○ are positive, Wallflower is the
        // purple skill. Wallflower shouldn't be charged as a prerequisite for ◎.
        const skillMeta: Record<string, SkillCostMeta> = {
            rare: { baseCost: 160, groupId: 'g', order: 1800, score: 174 },
            normal: { baseCost: 130, groupId: 'g', order: 1810, score: 129 },
            purple: { baseCost: 50, groupId: 'g', order: 1820, score: -129 },
        }
        const skillNames = {
            rare: ['Competitive Spirit ◎'],
            normal: ['Competitive Spirit ○'],
            purple: ['Wallflower'],
        }

        const cost = calculateSkillCost({
            skillId: 'rare',
            discount: 0,
            skillMeta,
            skillNames,
            umaSkillIds: [],
            getPrereqDiscount: zeroDiscount,
        })
        // 160 (◎) + 130 (○); Wallflower's 50 is skipped via score < 0.
        expect(cost).toBe(290)
    })

    it('skips × purple siblings via their negative score too', () => {
        // Right-Handed group: ◎ and ○ are positive, × is the purple skill.
        const skillMeta: Record<string, SkillCostMeta> = {
            rare: { baseCost: 110, groupId: 'g', order: 10, score: 174 },
            normal: { baseCost: 100, groupId: 'g', order: 20, score: 129 },
            purple: { baseCost: 50, groupId: 'g', order: 30, score: -129 },
        }
        const skillNames = {
            rare: ['Right-Handed ◎'],
            normal: ['Right-Handed ○'],
            purple: ['Right-Handed ×'],
        }

        expect(
            calculateSkillCost({
                skillId: 'rare',
                discount: 0,
                skillMeta,
                skillNames,
                umaSkillIds: [],
                getPrereqDiscount: zeroDiscount,
            }),
        ).toBe(210)
    })

    it('passes per-prereq discount through the callback', () => {
        const skillMeta: Record<string, SkillCostMeta> = {
            rare: { baseCost: 170, groupId: 'g', order: 1, score: 100 },
            normal: { baseCost: 170, groupId: 'g', order: 2, score: 80 },
        }
        const discounts: Record<string, number> = {
            rare: 10,
            normal: 20,
        }
        const cost = calculateSkillCost({
            skillId: 'rare',
            discount: discounts.rare,
            skillMeta,
            skillNames: { rare: ['A'], normal: ['B'] },
            umaSkillIds: [],
            getPrereqDiscount: (id) => discounts[id] ?? 0,
        })
        // 170 * 0.9 = 153, 170 * 0.8 = 136 → 289
        expect(cost).toBe(289)
    })
})
