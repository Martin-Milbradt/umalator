import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isPlaceholderSkillName } from './public/skillHelpers'
import { setDiscountForVariants } from './public/skillsUI'
import {
    getCurrentConfig,
    getResultsMap,
    setCurrentConfig,
} from './public/state'

vi.stubGlobal('document', {
    getElementById: () => null,
})

describe('isPlaceholderSkillName', () => {
    it('matches the auto-generated placeholder names', () => {
        expect(isPlaceholderSkillName('New Skill')).toBe(true)
        expect(isPlaceholderSkillName('New Skill 1')).toBe(true)
        expect(isPlaceholderSkillName('New Skill 23')).toBe(true)
        expect(isPlaceholderSkillName('  New Skill 2  ')).toBe(true)
    })

    it('rejects real skill names and look-alikes', () => {
        expect(isPlaceholderSkillName('Late Surger Savvy ○')).toBe(false)
        expect(isPlaceholderSkillName('New Skillington')).toBe(false)
        expect(isPlaceholderSkillName('A New Skill')).toBe(false)
        expect(isPlaceholderSkillName('New Skill x')).toBe(false)
    })
})

describe('setDiscountForVariants on a placeholder row', () => {
    beforeEach(() => {
        setCurrentConfig({
            skills: {
                'New Skill': { discount: 0 },
            },
            uma: { skills: [] },
        })
        getResultsMap().clear()
    })

    it('stores the discount so it carries over once the skill is named', () => {
        setDiscountForVariants('New Skill', 30)
        expect(getCurrentConfig()?.skills['New Skill']?.discount).toBe(30)
    })

    it('does not queue a result (no doomed simulation for the placeholder)', () => {
        setDiscountForVariants('New Skill', 30)
        expect(getResultsMap().size).toBe(0)
    })

    it('creates the config entry when the placeholder is missing one', () => {
        setCurrentConfig({ skills: {}, uma: { skills: [] } })
        setDiscountForVariants('New Skill 2', 20)
        expect(getCurrentConfig()?.skills['New Skill 2']?.discount).toBe(20)
        expect(getResultsMap().size).toBe(0)
    })
})
