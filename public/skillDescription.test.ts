import { describe, expect, it } from 'vitest'
import {
    describeAlternative,
    describeCondition,
    describeEffect,
    describeSkillEntry,
    formatClause,
} from './skillDescription'

describe('formatClause', () => {
    it('substitutes named values for ==', () => {
        expect(formatClause('running_style', '==', 4)).toBe('End Closer')
        expect(formatClause('distance_type', '==', 1)).toBe('Sprint')
        expect(formatClause('ground_condition', '==', 1)).toBe('Firm')
        expect(formatClause('phase', '==', 3)).toBe('Last Spurt')
    })

    it('keeps the operator visible for non-equality comparisons on named values', () => {
        expect(formatClause('phase', '>=', 2)).toBe('phase >= Late')
    })

    it('renders boolean is_* flags as labels', () => {
        expect(formatClause('is_lastspurt', '==', 1)).toBe('Last Spurt')
        expect(formatClause('is_finalcorner', '==', 0)).toBe('not Final Corner')
    })

    it('appends unit suffixes for known numeric domains', () => {
        expect(formatClause('hp_per', '<=', 50)).toBe('hp_per <= 50%')
        expect(formatClause('remain_distance', '<=', 200)).toBe(
            'remain_distance <= 200m',
        )
        expect(formatClause('accumulatetime', '>=', 2)).toBe(
            'accumulatetime >= 2s',
        )
    })

    it('falls through to raw form for unknown names', () => {
        expect(formatClause('weirdthing', '==', 5)).toBe('weirdthing == 5')
    })
})

describe('describeCondition', () => {
    it('joins AND clauses', () => {
        expect(
            describeCondition('running_style==4&is_lastspurt==1&corner==0'),
        ).toBe('End Closer AND Last Spurt AND corner == 0')
    })

    it('joins OR groups with " OR "', () => {
        expect(
            describeCondition(
                'order>=3&bashin_diff_infront<=1@order>=3&bashin_diff_behind<=1',
            ),
        ).toBe(
            'order >= 3 AND bashin_diff_infront <= 1 OR order >= 3 AND bashin_diff_behind <= 1',
        )
    })

    it('returns empty string for empty condition', () => {
        expect(describeCondition('')).toBe('')
    })
})

describe('describeEffect', () => {
    it('formats stat boosts with signed integer', () => {
        // modifier 400000 -> +40 (e.g. Right-Handed ○: speed +40)
        expect(describeEffect(1, 400000)).toBe('Speed +40')
        expect(describeEffect(3, -200000)).toBe('Power -20')
    })

    it('formats acceleration with units', () => {
        // modifier 2000 -> +0.2 m/s² (e.g. Red Ace)
        expect(describeEffect(31, 2000)).toBe('Acceleration +0.2 m/s²')
    })

    it('formats recovery as percentage', () => {
        // modifier 4500 -> 0.45 -> 45.0%
        expect(describeEffect(9, 4500)).toBe('Recovery 45.0%')
    })

    it('handles unknown effect types gracefully', () => {
        expect(describeEffect(999, 10000)).toBe('effect_999 1')
    })
})

describe('describeAlternative', () => {
    it('produces a multi-line summary with conditions and effects', () => {
        const out = describeAlternative({
            baseDuration: 9000,
            condition: 'running_style==4&is_lastspurt==1&corner==0',
            effects: [{ type: 31, modifier: 4000, target: 1 }],
            precondition: '',
        })
        expect(out).toBe(
            'When: End Closer AND Last Spurt AND corner == 0\nEffect: Acceleration +0.4 m/s²\nDuration: 0.9s',
        )
    })

    it('includes precondition line when present', () => {
        const out = describeAlternative({
            baseDuration: 0,
            condition: 'is_lastspurt==1',
            effects: [{ type: 1, modifier: 100000, target: 1 }],
            precondition: 'distance_type==2',
        })
        expect(out).toContain('Precondition: Mile')
        expect(out).toContain('When: Last Spurt')
    })
})

describe('describeSkillEntry', () => {
    it('joins multiple alternatives with a separator', () => {
        const out = describeSkillEntry({
            rarity: 1,
            wisdomCheck: 1,
            alternatives: [
                {
                    baseDuration: 0,
                    condition: 'phase==1',
                    effects: [{ type: 1, modifier: 100000, target: 1 }],
                    precondition: '',
                },
                {
                    baseDuration: 0,
                    condition: 'phase==2',
                    effects: [{ type: 2, modifier: 100000, target: 1 }],
                    precondition: '',
                },
            ],
        })
        expect(out).toBe(
            'When: Mid\nEffect: Speed +10\n──\nWhen: Late\nEffect: Stamina +10',
        )
    })
})
