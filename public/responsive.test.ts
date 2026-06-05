import { describe, expect, it } from 'vitest'
import {
    DISCOUNT_DROPDOWN_MAX_PANEL_WIDTH,
    shouldUseDiscountDropdownForWidth,
} from './responsive'

describe('shouldUseDiscountDropdownForWidth', () => {
    it('uses the dropdown when the pane is narrower than the threshold', () => {
        expect(
            shouldUseDiscountDropdownForWidth(
                DISCOUNT_DROPDOWN_MAX_PANEL_WIDTH - 1,
            ),
        ).toBe(true)
        expect(shouldUseDiscountDropdownForWidth(240)).toBe(true)
    })

    it('uses the button row once the pane is at least the threshold wide', () => {
        expect(
            shouldUseDiscountDropdownForWidth(
                DISCOUNT_DROPDOWN_MAX_PANEL_WIDTH,
            ),
        ).toBe(false)
        expect(shouldUseDiscountDropdownForWidth(800)).toBe(false)
    })
})
