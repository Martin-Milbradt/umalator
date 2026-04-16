// Pure skill-cost math shared between the browser UI (public/skillHelpers.ts)
// and the Node worker path (utils.ts). Do not import anything that pulls in
// browser-only or node-only APIs — this module must stay runtime-neutral.

// Math.floor matches the in-game cost display (e.g. 110 * 0.65 = 71.5 → 71).
export function applyDiscount(baseCost: number, discount: number): number {
    return Math.floor(baseCost * (1 - discount / 100))
}

export interface SkillCostMeta {
    baseCost?: number
    groupId?: string
    order?: number
    // Purple skills (negative hints like "Wallflower" or "Right-Handed ×") all
    // have `score < 0`; positive hints have `score > 0`. Used to reject purple
    // skills as prerequisite candidates.
    score?: number
}

export interface CalculateSkillCostArgs {
    /** Skill being priced, by ID. */
    skillId: string
    /** Discount on the target skill, 0-100. */
    discount: number
    /** All known skills' metadata keyed by skill ID. */
    skillMeta: Record<string, SkillCostMeta>
    /** Canonical names keyed by skill ID (first entry is the display name). */
    skillNames: Record<string, string[]>
    /** Skills the Uma currently has equipped, by ID. */
    umaSkillIds: readonly string[]
    /** Returns the discount (0-100) applied to a given prerequisite. */
    getPrereqDiscount: (prereqSkillId: string, prereqName: string) => number
}

/**
 * Cost for acquiring a skill, including prerequisite hints the Uma doesn't
 * already cover. For a three-level chain like Flash Forward -> ◎ -> ○, if the
 * Uma already has ◎ equipped, ○ counts as covered and isn't charged.
 *
 * Purple siblings (identified by `score < 0`) are never charged as
 * prerequisites — the game doesn't treat them as hint precursors. This
 * covers both the × variants (e.g. "Right-Handed ×") and the named purple
 * hints ("Wallflower", "Gatekept", etc.) that share a group with a positive
 * skill.
 */
export function calculateSkillCost(args: CalculateSkillCostArgs): number {
    const {
        skillId,
        discount,
        skillMeta,
        skillNames,
        umaSkillIds,
        getPrereqDiscount,
    } = args

    const currentSkill = skillMeta[skillId]
    const baseCost = currentSkill?.baseCost ?? 200
    let totalCost = applyDiscount(baseCost, discount)

    if (!currentSkill?.groupId) return totalCost

    const groupId = currentSkill.groupId
    const order = currentSkill.order ?? 0

    // The most advanced (lowest order) skill the Uma has in this group dictates
    // which prerequisites are already covered.
    let umaGroupOrder = Infinity
    for (const umaId of umaSkillIds) {
        const umaMeta = skillMeta[umaId]
        if (umaMeta?.groupId === groupId) {
            umaGroupOrder = Math.min(umaGroupOrder, umaMeta.order ?? 0)
        }
    }

    for (const [otherId, otherMeta] of Object.entries(skillMeta)) {
        const otherOrder = otherMeta.order ?? 0
        if (
            otherMeta.groupId !== groupId ||
            otherOrder <= order ||
            umaGroupOrder <= otherOrder
        ) {
            continue
        }
        if (otherMeta.score !== undefined && otherMeta.score < 0) continue

        const primaryName = skillNames[otherId]?.[0]
        if (!primaryName) continue

        const prereqDiscount = getPrereqDiscount(otherId, primaryName)
        const prereqBaseCost = otherMeta.baseCost ?? 200
        totalCost += applyDiscount(prereqBaseCost, prereqDiscount)
    }

    return totalCost
}
