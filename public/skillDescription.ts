/**
 * Lightweight skill-description renderer for tooltips. Reads skill_data.json
 * conditions / effects and produces plain text. Mirrors the high-value
 * substitutions that uma-tools' SkillList component does (running style,
 * distance type, ground, weather, etc.) but skips the deep i18n / preact
 * machinery — the tooltip is "best effort", not a faithful in-game tooltip.
 */
import {
    getSkillData,
    getSkillmeta,
    getSkillNameToId,
    getSkillnames,
} from './state'
import type { SkillDataAlternative, SkillDataEntry } from './types'

const RUNNING_STYLE: Record<number, string> = {
    1: 'Front Runner',
    2: 'Pace Chaser',
    3: 'Late Surger',
    4: 'End Closer',
    5: 'Runaway',
}
const DISTANCE_TYPE: Record<number, string> = {
    1: 'Sprint',
    2: 'Mile',
    3: 'Medium',
    4: 'Long',
}
const GROUND_TYPE: Record<number, string> = { 1: 'Turf', 2: 'Dirt' }
const GROUND_CONDITION: Record<number, string> = {
    1: 'Firm',
    2: 'Good',
    3: 'Soft',
    4: 'Heavy',
}
const SEASON: Record<number, string> = {
    1: 'Spring',
    2: 'Summer',
    3: 'Fall',
    4: 'Winter',
    5: 'Late Spring',
}
const WEATHER: Record<number, string> = {
    1: 'Sunny',
    2: 'Cloudy',
    3: 'Rainy',
    4: 'Snowy',
}
const ROTATION: Record<number, string> = {
    1: 'Clockwise',
    2: 'Counterclockwise',
}
const SLOPE: Record<number, string> = { 0: 'Flat', 1: 'Uphill', 2: 'Downhill' }
const PHASE: Record<number, string> = {
    0: 'Early',
    1: 'Mid',
    2: 'Late',
    3: 'Last Spurt',
}
const TIME: Record<number, string> = {
    1: 'Morning',
    2: 'Mid Day',
    3: 'Evening',
    4: 'Night',
}

const NAMED_VALUES: Record<string, Record<number, string>> = {
    running_style: RUNNING_STYLE,
    distance_type: DISTANCE_TYPE,
    ground_type: GROUND_TYPE,
    ground_condition: GROUND_CONDITION,
    season: SEASON,
    weather: WEATHER,
    rotation: ROTATION,
    slope: SLOPE,
    phase: PHASE,
    phase_random: PHASE,
    phase_firsthalf_random: PHASE,
    phase_laterhalf_random: PHASE,
    time: TIME,
}

const PERCENT_NAMES = new Set([
    'distance_rate',
    'distance_rate_after_random',
    'hp_per',
    'order_rate',
    'random_lot',
    'running_style_count_same_rate',
])

const METER_NAMES = new Set(['course_distance', 'remain_distance'])

const SECOND_NAMES = new Set([
    'accumulatetime',
    'behind_near_lane_time',
    'behind_near_lane_time_set1',
    'blocked_all_continuetime',
    'blocked_front_continuetime',
    'blocked_side_continuetime',
    'infront_near_lane_time',
    'overtake_target_no_order_up_time',
    'overtake_target_time',
])

/**
 * Boolean-style flags. `is_X == 1` renders as the friendly label; `== 0`
 * negates it. Anything else keeps the raw form.
 */
const BOOLEAN_FLAGS: Record<string, string> = {
    is_lastspurt: 'Last Spurt',
    is_finalcorner: 'Final Corner',
    is_finalcorner_laterhalf: 'Final Corner (later half)',
    is_finalcorner_random: 'Final Corner',
    is_last_straight_onetime: 'Final Straight',
    is_basis_distance: 'Basis Distance',
    is_badstart: 'Bad Start',
    is_behind_in: 'Behind',
    is_move_lane: 'Moving Lane',
    is_overtake: 'Overtaking',
    is_surrounded: 'Surrounded',
    is_temptation: 'Tempted',
}

export function formatClause(name: string, op: string, arg: number): string {
    const flag = BOOLEAN_FLAGS[name]
    if (flag && op === '==' && (arg === 0 || arg === 1)) {
        return arg === 1 ? flag : `not ${flag}`
    }
    const table = NAMED_VALUES[name]
    if (table && arg in table) {
        const value = table[arg]
        return op === '==' ? value : `${name} ${op} ${value}`
    }
    if (PERCENT_NAMES.has(name)) return `${name} ${op} ${arg}%`
    if (METER_NAMES.has(name)) return `${name} ${op} ${arg}m`
    if (SECOND_NAMES.has(name)) return `${name} ${op} ${arg}s`
    return `${name} ${op} ${arg}`
}

export function describeCondition(condition: string): string {
    if (!condition) return ''
    return condition
        .split('@')
        .map((orPart) =>
            orPart
                .split('&')
                .map((clause) => {
                    const m = clause
                        .trim()
                        .match(/^([a-z_]+)\s*(==|!=|<=|>=|<|>)\s*(-?\d+)$/)
                    if (!m) return clause.trim()
                    return formatClause(m[1], m[2], parseInt(m[3], 10))
                })
                .join(' AND '),
        )
        .join(' OR ')
}

const EFFECT_NAMES: Record<number, string> = {
    1: 'Speed',
    2: 'Stamina',
    3: 'Power',
    4: 'Guts',
    5: 'Wit',
    9: 'Recovery',
    13: 'Rushed duration',
    21: 'Current speed',
    22: 'Current speed (no decel)',
    27: 'Target speed',
    28: 'Lane movement speed',
    29: 'Rushed chance',
    31: 'Acceleration',
    37: 'Activate random gold',
    42: 'Increase skill duration',
}

function forceSign(n: number): string {
    return n > 0 ? `+${n}` : `${n}`
}

export function describeEffect(type: number, modifier: number): string {
    const name = EFFECT_NAMES[type] ?? `effect_${type}`
    const value = modifier / 10000
    switch (type) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
            return `${name} ${forceSign(value)}`
        case 9:
            return `${name} ${(value * 100).toFixed(1)}%`
        case 13:
            return `${name} ${forceSign(value)}s`
        case 21:
        case 22:
        case 27:
            return `${name} ${forceSign(value)} m/s`
        case 29:
            return `${name} ${forceSign(value)}%`
        case 31:
            return `${name} ${forceSign(value)} m/s²`
        case 42:
            return `${name} ${value}×`
        case 37:
            return name
        default:
            return `${name} ${value}`
    }
}

export function describeAlternative(alt: SkillDataAlternative): string {
    const lines: string[] = []
    if (alt.precondition) {
        lines.push(`Precondition: ${describeCondition(alt.precondition)}`)
    }
    const conds = describeCondition(alt.condition)
    if (conds) lines.push(`When: ${conds}`)
    if (alt.effects?.length) {
        lines.push(
            `Effect: ${alt.effects.map((e) => describeEffect(e.type, e.modifier)).join(', ')}`,
        )
    }
    if (alt.baseDuration > 0) {
        lines.push(`Duration: ${alt.baseDuration / 10000}s`)
    }
    return lines.join('\n')
}

export function describeSkillEntry(entry: SkillDataEntry): string {
    return entry.alternatives
        .map((alt) => describeAlternative(alt))
        .filter((s) => s.length > 0)
        .join('\n──\n')
}

/**
 * Resolves a skill display name (canonical or a UI group base like
 * "End Closer Savvy") to a description. Returns null when the name isn't
 * a known skill or data hasn't loaded yet.
 */
export function describeSkill(skillName: string): string | null {
    const skillData = getSkillData()
    const nameToId = getSkillNameToId()
    const skillnames = getSkillnames()
    const skillmeta = getSkillmeta()
    if (!skillData || !nameToId || !skillnames || !skillmeta) return null

    let id = nameToId[skillName]
    if (!id) {
        // Base name like "End Closer Savvy" — pick any ○/◎ variant in its
        // group and use its description.
        for (const candidate of [`${skillName} ○`, `${skillName} ◎`]) {
            const candidateId = nameToId[candidate]
            if (candidateId) {
                id = candidateId
                break
            }
        }
    }
    if (!id) return null
    const entry = skillData[id]
    if (!entry) return null
    return describeSkillEntry(entry)
}
