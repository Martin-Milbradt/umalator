import {
    applyDiscount,
    calculateSkillCost,
} from '../shared/skill-cost'
import {
    getCurrentConfig,
    getSkillmeta,
    getSkillNameLookup,
    getSkillnames,
    getSkillNameToId,
    getVariantCache,
    setSkillNameLookup,
    setVariantCache,
} from './state'
import type { VariantDefaultOperation } from './types'

export function buildSkillNameLookup(): void {
    const skillnames = getSkillnames()
    if (!skillnames) return
    const lookup = new Map<string, string>()
    for (const [, names] of Object.entries(skillnames)) {
        if (Array.isArray(names) && names[0]) {
            const canonicalName = names[0]
            lookup.set(canonicalName.toLowerCase(), canonicalName)
        }
    }
    setSkillNameLookup(lookup)
}

export function buildVariantCache(): void {
    const skillnames = getSkillnames()
    if (!skillnames) return
    const cache = new Map<string, string[]>()
    for (const [, names] of Object.entries(skillnames)) {
        if (!Array.isArray(names) || !names[0]) continue
        const name = names[0]
        // Match names ending with " ○" or " ◎"
        const match = name.match(/^(.+) ([○◎])$/)
        if (match) {
            const baseName = match[1]
            if (!cache.has(baseName)) {
                cache.set(baseName, [])
            }
            cache.get(baseName)?.push(name)
        }
    }
    setVariantCache(cache)
}

export function normalizeSkillName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[◎○×]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

export function getCanonicalSkillName(inputName: string): string {
    const skillNameLookup = getSkillNameLookup()
    if (!skillNameLookup) return inputName
    const canonical = skillNameLookup.get(inputName.toLowerCase().trim())
    return canonical || inputName
}

/**
 * Whether `name` is a real skill the simulation will recognize. True if it
 * matches a canonical skill name (case-insensitive) or a base name with known
 * ○/◎ variants (e.g. "Long Corners"). False for typos like "Trium" so callers
 * can reject the input instead of writing it to the config. If skill data
 * hasn't loaded yet this returns true to avoid spurious rejections.
 */
export function isValidSkillName(name: string): boolean {
    const trimmed = name.trim()
    if (!trimmed) return false
    const skillNameLookup = getSkillNameLookup()
    const variantCache = getVariantCache()
    if (!skillNameLookup || !variantCache) return true
    const lower = trimmed.toLowerCase()
    if (skillNameLookup.has(lower)) return true
    // Base names like "Long Corners" don't appear in the canonical-name
    // lookup but are valid because renderSkills expands them into variants.
    for (const baseName of variantCache.keys()) {
        if (baseName.toLowerCase() === lower) return true
    }
    return false
}

export function getBaseSkillName(skillName: string): string {
    return skillName.replace(/[◎○]$/, '').trim()
}

export function getVariantsForBaseName(baseName: string): string[] {
    const variantCache = getVariantCache()
    if (!variantCache) return []
    return variantCache.get(baseName) || []
}

export function getOtherVariant(skillName: string): string | string[] | null {
    const variantCache = getVariantCache()
    if (!variantCache) return null
    const baseName = getBaseSkillName(skillName)
    const hasCircle = skillName.endsWith(' ○')
    const hasDoubleCircle = skillName.endsWith(' ◎')

    if (!hasCircle && !hasDoubleCircle) {
        const variants = getVariantsForBaseName(baseName)
        if (variants.length === 2) {
            return variants
        }
        return null
    }

    const otherVariantName = hasCircle ? `${baseName} ◎` : `${baseName} ○`
    const variants = variantCache.get(baseName) || []

    // Check if the other variant exists in the cache
    if (variants.includes(otherVariantName)) {
        return otherVariantName
    }

    return null
}

/**
 * Canonical skill-variant names that share discount / default state with `skillName`.
 * For a ○/◎ pair, returns both variants. Always includes `skillName` itself. Does
 * not include the stripped base name; callers that need to touch a legacy
 * base-name config entry must handle it separately.
 */
export function getDiscountVariants(skillName: string): string[] {
    const baseName = getBaseSkillName(skillName)
    const variants = getVariantsForBaseName(baseName)
    const names = new Set<string>([skillName])

    if (variants.length === 2) {
        for (const variant of variants) names.add(variant)
    } else {
        const otherVariant = getOtherVariant(skillName)
        if (otherVariant) {
            const others = Array.isArray(otherVariant)
                ? otherVariant
                : [otherVariant]
            for (const variant of others) names.add(variant)
        }
    }

    return [...names]
}

/**
 * Updates the default value for a skill and all its variants.
 * Handles both ○/◎ variant pairs consistently.
 */
export function updateSkillVariantsDefault(
    skillName: string,
    operation: VariantDefaultOperation,
    newValue?: number | null,
): void {
    const currentConfig = getCurrentConfig()
    if (!currentConfig) return

    for (const variantName of getDiscountVariants(skillName)) {
        if (!currentConfig.skills[variantName]) continue

        if (operation === 'remove') {
            delete currentConfig.skills[variantName].default
        } else if (operation === 'set' && newValue !== undefined) {
            currentConfig.skills[variantName].default = newValue
        }
    }
}

export function findSkillId(skillName: string): string | null {
    const skillNameToId = getSkillNameToId()
    const skillnames = getSkillnames()
    if (!skillNameToId || !skillnames) return null
    if (skillNameToId[skillName]) {
        return skillNameToId[skillName]
    }

    const normalizedSkillName = normalizeSkillName(skillName)
    // An input of just "◎" / "×" etc. normalizes to "" — with the bidirectional
    // substring fallback below, "".includes("") would match every skill and
    // return an arbitrary first entry. Reject before entering the loop.
    if (!normalizedSkillName) return null
    for (const [id, names] of Object.entries(skillnames)) {
        if (Array.isArray(names)) {
            for (const name of names) {
                if (name) {
                    const normalizedName = normalizeSkillName(name)
                    if (
                        normalizedName === normalizedSkillName ||
                        normalizedName.includes(normalizedSkillName) ||
                        normalizedSkillName.includes(normalizedName)
                    ) {
                        return id
                    }
                }
            }
        }
    }

    return null
}

export function getSkillIconUrl(skillName: string): string | null {
    const skillId = findSkillId(skillName)
    if (!skillId) return null
    const meta = getSkillmeta()
    const iconId = meta?.[skillId]?.iconId
    if (!iconId) return null
    const base = import.meta.env.BASE_URL ?? '/'
    return `${base}data/icons/utx_ico_skill_${iconId}.png`
}

export function getSkillGroupId(skillName: string): string | null {
    const skillmeta = getSkillmeta()
    if (!skillmeta) return null
    const skillId = findSkillId(skillName)
    if (!skillId) return null
    return skillmeta[skillId]?.groupId || null
}

export function getSkillOrder(skillName: string): number {
    const skillmeta = getSkillmeta()
    if (!skillmeta) return 0
    const skillId = findSkillId(skillName)
    if (!skillId) return 0
    return skillmeta[skillId]?.order ?? 0
}

export function compareSkills(a: string, b: string): number {
    const orderDiff = getSkillOrder(a) - getSkillOrder(b)
    if (orderDiff !== 0) return orderDiff
    const idA = findSkillId(a) ?? ''
    const idB = findSkillId(b) ?? ''
    return idA.localeCompare(idB)
}

/**
 * Check if Uma has an upgraded version of the given skill.
 * Upgraded skills have lower order numbers in the same groupId.
 */
export function umaHasUpgradedVersion(skillName: string): boolean {
    const currentConfig = getCurrentConfig()
    const skillmeta = getSkillmeta()
    if (!currentConfig?.uma?.skills || !skillmeta) return false

    const groupId = getSkillGroupId(skillName)
    if (!groupId) return false

    const skillOrder = getSkillOrder(skillName)

    for (const umaSkill of currentConfig.uma.skills) {
        const umaGroupId = getSkillGroupId(umaSkill)
        const umaOrder = getSkillOrder(umaSkill)
        if (umaGroupId === groupId && umaOrder < skillOrder) {
            return true
        }
    }
    return false
}

/**
 * Check if a skill is currently on Uma (exact match).
 */
export function isSkillOnUma(skillName: string): boolean {
    const currentConfig = getCurrentConfig()
    return currentConfig?.uma?.skills?.includes(skillName) ?? false
}

/**
 * Get the skill from the same group that is currently on Uma.
 * Returns null if no skill from the group is on Uma.
 */
export function getGroupVariantOnUma(skillName: string): string | null {
    const currentConfig = getCurrentConfig()
    const skillmeta = getSkillmeta()
    if (!currentConfig?.uma?.skills || !skillmeta) return null

    const groupId = getSkillGroupId(skillName)
    if (!groupId) return null

    for (const umaSkill of currentConfig.uma.skills) {
        const umaGroupId = getSkillGroupId(umaSkill)
        if (umaGroupId === groupId) {
            return umaSkill
        }
    }
    return null
}

// Purple variants (× suffix) share the group ID but are not part of the upgrade chain.
function isPurpleVariantName(name: string): boolean {
    return name.endsWith(' ×')
}

/**
 * Add `delta` to the Uma's skill-points budget, no-op if the user hasn't set a
 * budget (null/undefined skillPoints). Use a positive delta to refund (remove a
 * skill) and a negative delta to deduct (add a skill).
 */
export function adjustSkillPoints(delta: number): void {
    const uma = getCurrentConfig()?.uma
    if (uma?.skillPoints != null) uma.skillPoints += delta
}

/**
 * Get the basic variant (higher order) of a skill in the same group.
 * Returns null if no basic variant exists. × purple variants are ignored.
 */
export function getBasicVariant(skillName: string): string | null {
    const skillmeta = getSkillmeta()
    const skillnames = getSkillnames()
    if (!skillmeta || !skillnames) return null

    const skillId = findSkillId(skillName)
    if (!skillId) return null

    const currentMeta = skillmeta[skillId]
    if (!currentMeta?.groupId) return null

    const currentGroupId = currentMeta.groupId
    const currentOrder = currentMeta.order ?? 0

    for (const [otherId, otherMeta] of Object.entries(skillmeta)) {
        if (
            otherMeta.groupId === currentGroupId &&
            (otherMeta.order ?? 0) > currentOrder
        ) {
            const names = skillnames[otherId]
            if (names?.[0] && !isPurpleVariantName(names[0])) {
                return names[0]
            }
        }
    }
    return null
}

/**
 * Get the upgraded variant (lower order) of a skill in the same group.
 * Returns null if no upgraded variant exists. × purple variants are ignored
 * both as lookup targets and as the input skill.
 */
export function getUpgradedVariant(skillName: string): string | null {
    const skillmeta = getSkillmeta()
    const skillnames = getSkillnames()
    if (!skillmeta || !skillnames) return null

    if (isPurpleVariantName(skillName)) return null

    const skillId = findSkillId(skillName)
    if (!skillId) return null

    const currentMeta = skillmeta[skillId]
    if (!currentMeta?.groupId) return null

    const currentGroupId = currentMeta.groupId
    const currentOrder = currentMeta.order ?? 0

    for (const [otherId, otherMeta] of Object.entries(skillmeta)) {
        if (
            otherMeta.groupId === currentGroupId &&
            (otherMeta.order ?? 0) < currentOrder
        ) {
            const names = skillnames[otherId]
            if (names?.[0] && !isPurpleVariantName(names[0])) {
                return names[0]
            }
        }
    }
    return null
}

export function getSkillBaseCost(skillName: string): number {
    const skillmeta = getSkillmeta()
    if (!skillmeta) return 200
    const skillId = findSkillId(skillName)
    if (!skillId) return 200
    return skillmeta[skillId]?.baseCost ?? 200
}

/**
 * Calculate a skill's cost including the hints the Uma doesn't already cover.
 * Thin adapter over shared/skill-cost: resolves name → ID and reads discounts
 * from the live config.
 */
export function getSkillCostWithDiscount(skillName: string): number {
    const currentConfig = getCurrentConfig()
    const skillmeta = getSkillmeta()
    const skillnames = getSkillnames()
    const discount = currentConfig?.skills[skillName]?.discount ?? 0

    if (!skillmeta || !skillnames) {
        return applyDiscount(getSkillBaseCost(skillName), discount)
    }
    const skillId = findSkillId(skillName)
    if (!skillId) {
        return applyDiscount(getSkillBaseCost(skillName), discount)
    }

    const umaSkillIds: string[] = []
    for (const umaSkill of currentConfig?.uma?.skills ?? []) {
        const umaSkillId = findSkillId(umaSkill)
        if (umaSkillId) umaSkillIds.push(umaSkillId)
    }

    return calculateSkillCost({
        skillId,
        discount,
        skillMeta: skillmeta,
        skillNames: skillnames,
        umaSkillIds,
        getPrereqDiscount: (_prereqId, prereqName) =>
            currentConfig?.skills[prereqName]?.discount ?? 0,
    })
}

export function deleteSkill(skillName: string): void {
    const currentConfig = getCurrentConfig()
    if (!currentConfig) return
    const baseName = getBaseSkillName(skillName)
    const skillsToDelete = [baseName, `${baseName} ○`, `${baseName} ◎`]
    skillsToDelete.forEach((skillToDelete) => {
        delete currentConfig.skills[skillToDelete]
    })
}
