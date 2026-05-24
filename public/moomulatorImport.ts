import type { Config, Skill, SkillMeta, SkillNames, Uma } from './types'

export interface MoomulatorConfig {
    outfitId?: string
    speed?: number
    stamina?: number
    power?: number
    guts?: number
    wisdom?: number
    strategy?: string
    distanceAptitude?: string
    surfaceAptitude?: string
    strategyAptitude?: string
    mood?: number
    skills?: string[]
    forcedSkillPositions?: Record<string, unknown>
}

export interface ConversionResult {
    config: Config
    unknownSkillIds: string[]
}

const STRATEGY_MAP: Record<string, string> = {
    oonige: 'Runaway',
    nige: 'Front Runner',
    senkou: 'Pace Chaser',
    sasi: 'Late Surger',
    sashi: 'Late Surger',
    oikomi: 'End Closer',
}

const APTITUDES = new Set(['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'])

function findSkillIdByName(
    name: string,
    skillnames: SkillNames,
): string | null {
    for (const [id, names] of Object.entries(skillnames)) {
        if (names[0] === name) return id
    }
    return null
}

/**
 * Higher-order sibling in the same groupId — the "basic" (white) version of a
 * gold/upgrade. Matches `getBasicVariant` in skillHelpers; gold → white only,
 * never the other direction. × purple variants are skipped.
 */
function findBasicVariant(
    name: string,
    skillnames: SkillNames,
    skillmeta: SkillMeta,
): string | null {
    if (name.endsWith(' ×')) return null
    const id = findSkillIdByName(name, skillnames)
    if (!id) return null
    const meta = skillmeta[id]
    if (!meta?.groupId) return null
    const currentOrder = meta.order ?? 0
    for (const [otherId, otherMeta] of Object.entries(skillmeta)) {
        if (
            otherMeta.groupId === meta.groupId &&
            (otherMeta.order ?? 0) > currentOrder
        ) {
            const otherName = skillnames[otherId]?.[0]
            if (otherName && !otherName.endsWith(' ×')) return otherName
        }
    }
    return null
}

function stripHintSuffix(name: string): string | null {
    return / [○◎]$/.test(name) ? name.replace(/ [○◎]$/, '') : null
}

/**
 * For an owned skill, returns the names that should also be available:
 * - the stripped base name for ○/◎ hint variants (UI group entry that
 *   `renderSkills` expands into both hint tiers)
 * - the white/basic version of a gold/upgrade (same groupId, higher order)
 */
function expandToAvailable(
    name: string,
    skillnames: SkillNames,
    skillmeta: SkillMeta,
): string[] {
    const out: string[] = [name]
    const stripped = stripHintSuffix(name)
    if (stripped) out.push(stripped)
    const basic = findBasicVariant(name, skillnames, skillmeta)
    if (basic) out.push(basic)
    return out
}

export function convertMoomulatorConfig(
    data: unknown,
    skillnames: SkillNames,
    skillmeta: SkillMeta,
    template?: Config | null,
): ConversionResult {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('Clipboard JSON must be an object')
    }
    const src = data as MoomulatorConfig

    const uma: Uma = {}
    if (typeof src.speed === 'number') uma.speed = src.speed
    if (typeof src.stamina === 'number') uma.stamina = src.stamina
    if (typeof src.power === 'number') uma.power = src.power
    if (typeof src.guts === 'number') uma.guts = src.guts
    if (typeof src.wisdom === 'number') uma.wisdom = src.wisdom
    if (typeof src.mood === 'number') uma.mood = src.mood

    if (typeof src.strategy === 'string') {
        const mapped = STRATEGY_MAP[src.strategy.toLowerCase().trim()]
        if (mapped) uma.strategy = mapped
    }

    if (
        typeof src.distanceAptitude === 'string' &&
        APTITUDES.has(src.distanceAptitude)
    ) {
        uma.distanceAptitude = src.distanceAptitude
    }
    if (
        typeof src.surfaceAptitude === 'string' &&
        APTITUDES.has(src.surfaceAptitude)
    ) {
        uma.surfaceAptitude = src.surfaceAptitude
    }
    if (
        typeof src.strategyAptitude === 'string' &&
        APTITUDES.has(src.strategyAptitude)
    ) {
        uma.styleAptitude = src.strategyAptitude
    }

    const skillIds = Array.isArray(src.skills) ? src.skills : []
    const skills: string[] = []
    const unknownSkillIds: string[] = []
    let unique: string | undefined

    for (const id of skillIds) {
        if (typeof id !== 'string') continue
        const names = skillnames[id]
        const name = names?.[0]
        if (!name) {
            unknownSkillIds.push(id)
            continue
        }
        // The character's main unique is the (typically only) cost-0 skill.
        // Inherited uniques (900xxx) have non-zero cost and stay in skills.
        const baseCost = skillmeta[id]?.baseCost
        if (baseCost === 0 && unique === undefined) {
            unique = name
        } else {
            skills.push(name)
        }
    }

    if (unique) uma.unique = unique
    uma.skills = skills

    // Available-skills map: start from the template, then add every owned
    // skill at 0% discount. The template's discount wins on overlap so we
    // don't clobber a deliberately tuned setup.
    const availableSkills: Record<string, Skill> = {}
    if (template?.skills) {
        for (const [name, skill] of Object.entries(template.skills)) {
            availableSkills[name] = { ...skill }
        }
    }
    const ownedNames = unique ? [unique, ...skills] : skills
    for (const ownedName of ownedNames) {
        for (const name of expandToAvailable(ownedName, skillnames, skillmeta)) {
            if (!(name in availableSkills)) {
                availableSkills[name] = { discount: 0 }
            }
        }
    }

    const config: Config = { skills: availableSkills, uma }
    if (template?.track) config.track = { ...template.track }
    if (template?.filters) config.filters = { ...template.filters }

    return { config, unknownSkillIds }
}
