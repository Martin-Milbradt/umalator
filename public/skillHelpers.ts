import { SKILLS_TO_IGNORE } from './constants'
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

    const baseName = getBaseSkillName(skillName)
    const variants = getVariantsForBaseName(baseName)

    // Determine which skills to update - always include skillName
    let skillsToUpdate: string[]
    if (variants.length === 2) {
        skillsToUpdate = [...new Set([skillName, ...variants])]
    } else {
        const otherVariant = getOtherVariant(skillName)
        if (otherVariant) {
            const variantsToAdd = Array.isArray(otherVariant)
                ? otherVariant
                : [otherVariant]
            skillsToUpdate = [skillName, ...variantsToAdd]
        } else {
            skillsToUpdate = [skillName]
        }
    }

    // Apply the operation to all relevant skills
    for (const variantName of skillsToUpdate) {
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

/**
 * Get the basic variant (higher order) of a skill in the same group.
 * Returns null if no basic variant exists.
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

    // Find skill with higher order (basic version) in the same group
    for (const [otherId, otherMeta] of Object.entries(skillmeta)) {
        if (
            otherMeta.groupId === currentGroupId &&
            (otherMeta.order ?? 0) > currentOrder
        ) {
            const names = skillnames[otherId]
            if (names?.[0]) {
                return names[0]
            }
        }
    }
    return null
}

/**
 * Get the upgraded variant (lower order) of a skill in the same group.
 * Returns null if no upgraded variant exists.
 */
export function getUpgradedVariant(skillName: string): string | null {
    const skillmeta = getSkillmeta()
    const skillnames = getSkillnames()
    if (!skillmeta || !skillnames) return null

    const skillId = findSkillId(skillName)
    if (!skillId) return null

    const currentMeta = skillmeta[skillId]
    if (!currentMeta?.groupId) return null

    const currentGroupId = currentMeta.groupId
    const currentOrder = currentMeta.order ?? 0

    // Find skill with lower order (upgraded version) in the same group
    for (const [otherId, otherMeta] of Object.entries(skillmeta)) {
        if (
            otherMeta.groupId === currentGroupId &&
            (otherMeta.order ?? 0) < currentOrder
        ) {
            const names = skillnames[otherId]
            if (names?.[0]) {
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
 * Calculate skill cost including prerequisite costs.
 * For upgraded skills (◎), this adds the cost of prerequisite skills (○)
 * that Uma doesn't already have.
 *
 * NOTE: This logic is intentionally duplicated from utils.ts:calculateSkillCost
 * to avoid complex build steps for sharing server-side code with the frontend.
 * Keep both implementations in sync when modifying cost calculation logic.
 */
export function getSkillCostWithDiscount(skillName: string): number {
    const currentConfig = getCurrentConfig()
    const skillmeta = getSkillmeta()
    const skillnames = getSkillnames()

    const baseCost = getSkillBaseCost(skillName)
    const discount = currentConfig?.skills[skillName]?.discount ?? 0
    let totalCost = Math.ceil(baseCost * (1 - discount / 100))

    if (!skillmeta || !skillnames) return totalCost

    const skillId = findSkillId(skillName)
    if (!skillId) return totalCost

    const currentMeta = skillmeta[skillId]
    if (!currentMeta?.groupId) return totalCost

    const currentGroupId = currentMeta.groupId
    const currentOrder = currentMeta.order ?? 0
    const umaSkills = currentConfig?.uma?.skills || []

    // Find prerequisite skills (same groupId, higher order = basic versions)
    for (const [otherSkillId, otherMeta] of Object.entries(skillmeta)) {
        if (
            otherMeta.groupId === currentGroupId &&
            (otherMeta.order ?? 0) > currentOrder
        ) {
            const otherSkillNames = skillnames[otherSkillId]
            if (!otherSkillNames) continue

            // Skip negative/debuff skills (ending with " ×") and ignored skills
            const primaryName = otherSkillNames[0]
            if (
                primaryName.endsWith(' ×') ||
                SKILLS_TO_IGNORE.includes(primaryName)
            ) {
                continue
            }

            // Check if Uma already has this prerequisite
            const umaHasPrereq = umaSkills.some((umaSkill) => {
                const umaSkillId = findSkillId(umaSkill)
                return umaSkillId === otherSkillId
            })

            if (!umaHasPrereq) {
                // Add prerequisite cost with its discount
                const prereqBaseCost = otherMeta.baseCost ?? 200
                const prereqDiscount =
                    currentConfig?.skills[primaryName]?.discount ?? 0
                totalCost += Math.ceil(
                    prereqBaseCost * (1 - prereqDiscount / 100),
                )
            }
        }
    }

    return totalCost
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
