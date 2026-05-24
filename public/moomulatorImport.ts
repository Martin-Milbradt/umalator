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
    for (const name of ownedNames) {
        if (!(name in availableSkills)) {
            availableSkills[name] = { discount: 0 }
        }
    }

    const config: Config = { skills: availableSkills, uma }
    if (template?.track) config.track = { ...template.track }
    if (template?.filters) config.filters = { ...template.filters }

    return { config, unknownSkillIds }
}
