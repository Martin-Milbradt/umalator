import type { StaticField } from './types'

// localStorage key for persisting last used config
export const LAST_USED_CONFIG_KEY = 'lastUsedConfig'

// Mapping constants for skill trigger checking
// NOTE: Keep in sync with utils.ts STRATEGY_TO_RUNNING_STYLE
// Running style values verified from skill_data.json:
// 1=Front Runner (Nige), 2=Pace Chaser (Senkou), 3=Late Surger (Sasi), 4=End Closer (Oikomi), 5=Runaway (Oonige)
export const STRATEGY_TO_RUNNING_STYLE: Record<string, number> = {
    'End Closer': 4,
    'Front Runner': 1,
    'Late Surger': 3,
    Nige: 1,
    Oikomi: 4,
    Oonige: 5,
    'Pace Chaser': 2,
    Runaway: 5,
    Sasi: 3,
    Senkou: 2,
}

export const TRACK_NAME_TO_ID: Record<string, number> = {
    Chukyo: 10007,
    Fukushima: 10004,
    Hakodate: 10002,
    Hanshin: 10009,
    Kokura: 10010,
    Kyoto: 10008,
    Nakayama: 10005,
    Niigata: 10003,
    Ooi: 10101,
    Sapporo: 10001,
    Tokyo: 10006,
}

export const CONDITION_MAP: Record<string, number> = {
    firm: 1,
    good: 2,
    heavy: 4,
    soft: 3,
}

export const WEATHER_MAP: Record<string, number> = {
    cloudy: 2,
    rainy: 3,
    snowy: 4,
    sunny: 1,
}

export const SEASON_MAP: Record<string, number> = {
    autumn: 3,
    fall: 3,
    sakura: 5,
    spring: 1,
    summer: 2,
    winter: 4,
}

export const tracknames: Record<string, [string, string]> = {
    10001: ['', 'Sapporo'],
    10002: ['', 'Hakodate'],
    10003: ['', 'Niigata'],
    10004: ['', 'Fukushima'],
    10005: ['', 'Nakayama'],
    10006: ['', 'Tokyo'],
    10007: ['', 'Chukyo'],
    10008: ['', 'Kyoto'],
    10009: ['', 'Hanshin'],
    10010: ['', 'Kokura'],
    10101: ['', 'Ooi'],
}

// Max values for fields that support inequality expansion
export const FIELD_MAX_VALUES: Partial<Record<StaticField, number>> = {
    distance_type: 4, // Sprint=1, Mile=2, Medium=3, Long=4
    ground_condition: 4, // Good=1, Yielding=2, Soft=3, Heavy=4
    ground_type: 2, // Turf=1, Dirt=2
    is_basis_distance: 1, // 0=non-standard, 1=standard (divisible by 400)
    rotation: 4, // Clockwise=1, Counterclockwise=2, UnusedOrientation=3, NoTurns=4
    running_style: 5, // Runaway=1, Front Runner=2, Pace Chaser=3, Late Surger=4, End Closer=5
    season: 5, // Spring=1, Summer=2, Autumn=3, Winter=4, Sakura=5
    weather: 4, // Sunny=1, Cloudy=2, Rainy=3, Snowy=4
}

export const DISTANCE_CATEGORIES = ['<Sprint>', '<Mile>', '<Medium>', '<Long>']
export const RANDOM_LOCATION = '<Random>'

// Skills to ignore when calculating prerequisite costs (negative/debuff skills)
export const SKILLS_TO_IGNORE = [
    '99 Problems',
    'G1 Averseness',
    'Gatekept',
    'Inner Post Averseness',
    'Outer Post Averseness',
    'Paddock Fright',
    'Wallflower',
    "You're Not the Boss of Me!",
    '♡ 3D Nail Art',
]
