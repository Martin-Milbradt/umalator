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

export const DISTANCE_CATEGORIES = ['<Sprint>', '<Mile>', '<Medium>', '<Long>']
export const RANDOM_LOCATION = '<Random>'
