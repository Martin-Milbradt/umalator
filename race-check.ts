import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RawCourseData, SkillMeta } from './types'
import type { SkillDataEntry, SkillResult } from './utils'
import { deriveSeason, parseLocationToTrackName, Season } from './utils'
import {
    SimulationRunner,
    type SimulationProgress,
    type SimulationRunnerConfig,
} from './simulation-runner'

interface MMLRace {
    raceName: string
    grade: string
    year: string
    turn: string
    type: string
    location: string
    length: string
    lengthM: string
}

interface SkillSpec {
    name: string
    strategy: string
}

interface RaceCheckConfig {
    races: string
    skills: SkillSpec[]
    uma: {
        distanceAptitude: string
        guts: number
        power: number
        speed: number
        stamina: number
        styleAptitude: string
        surfaceAptitude: string
        wisdom: number
    }
}

const SEASON_TO_NAME: Record<number, string> = {
    [Season.Spring]: 'Spring',
    [Season.Summer]: 'Summer',
    [Season.Autumn]: 'Fall',
    [Season.Winter]: 'Winter',
    [Season.Sakura]: 'Sakura',
}

function loadJson<T>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
}

function parseArgs(): {
    racesPath?: string
    skills?: SkillSpec[]
    configPath?: string
    track?: string
    distance?: number
    surface?: string
    season?: string
    numSims: number
    json: boolean
} {
    const args = process.argv.slice(2)
    const result: ReturnType<typeof parseArgs> = { numSims: 100, json: false }

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--races':
                result.racesPath = args[++i]
                break
            case '--skills':
                result.skills = args[++i]!.split(',').map((s) => {
                    const trimmed = s.trim()
                    const colonIdx = trimmed.lastIndexOf(':')
                    if (colonIdx === -1)
                        return { name: trimmed, strategy: 'End Closer' }
                    return {
                        name: trimmed.slice(0, colonIdx).trim(),
                        strategy: trimmed.slice(colonIdx + 1).trim(),
                    }
                })
                break
            case '--config':
                result.configPath = args[++i]
                break
            case '--track':
                result.track = args[++i]
                break
            case '--distance':
                result.distance = parseInt(args[++i]!, 10)
                break
            case '--surface':
                result.surface = args[++i]
                break
            case '--season':
                result.season = args[++i]
                break
            case '--sims':
                result.numSims = parseInt(args[++i]!, 10)
                break
            case '--json':
                result.json = true
                break
            case '--help':
            case '-h':
                console.log(
                    `Usage: npx tsx race-check.ts [options]

Options:
  --races <path>     Path to races JSON file (MML format)
  --skills <list>    Comma-separated skills with optional strategy
                     e.g. "Straightaway Spurt:End Closer,Angling and Scheming:Front Runner"
  --config <path>    Config file for uma stats (overrides defaults)
  --track <name>     One-off: track name (e.g. Kyoto)
  --distance <m>     One-off: distance in meters
  --surface <type>   One-off: Turf or Dirt (default: Turf)
  --season <name>    One-off: Spring/Summer/Fall/Winter
  --sims <n>         Simulations per skill (default: 100)
  --json             Output as JSON instead of table
  -h, --help         Show this help`,
                )
                process.exit(0)
        }
    }
    return result
}

function parseDistance(lengthM: string): number {
    return parseInt(lengthM.replace(/\s*m\s*$/, ''), 10)
}

function seasonName(season: Season): string {
    return SEASON_TO_NAME[season] ?? 'Spring'
}

interface RaceSpec {
    raceName: string
    turn: string
    trackName: string
    distance: number
    surface: string
    season: string
}

function mmlToRaceSpecs(races: MMLRace[]): RaceSpec[] {
    return races.map((r) => ({
        raceName: r.raceName,
        turn: r.turn,
        trackName: parseLocationToTrackName(r.location),
        distance: parseDistance(r.lengthM),
        surface: r.type,
        season: seasonName(deriveSeason(r.turn)),
    }))
}

async function runRaceSkills(
    race: RaceSpec,
    skills: SkillSpec[],
    uma: RaceCheckConfig['uma'],
    staticData: {
        courseData: Record<string, RawCourseData>
        skillData: Record<string, SkillDataEntry>
        skillMeta: Record<string, SkillMeta>
        skillNames: Record<string, string[]>
        trackNames: Record<string, string[]>
    },
    workerPath: URL,
    numSims: number,
): Promise<Map<string, number | null>> {
    const results = new Map<string, number | null>()
    for (const skill of skills) {
        results.set(skill.name, null)
    }

    // Group skills by strategy
    const byStrategy = new Map<string, SkillSpec[]>()
    for (const skill of skills) {
        const group = byStrategy.get(skill.strategy) ?? []
        group.push(skill)
        byStrategy.set(skill.strategy, group)
    }

    for (const [strategy, groupSkills] of byStrategy) {
        const skillsConfig: Record<
            string,
            { discount: number }
        > = {}
        for (const s of groupSkills) {
            skillsConfig[s.name] = { discount: 0 }
        }

        const config: SimulationRunnerConfig = {
            skills: skillsConfig,
            track: {
                trackName: race.trackName,
                distance: race.distance,
                surface: race.surface,
                groundCondition: 'Firm',
                weather: 'Sunny',
                season: race.season,
                numUmas: 18,
            },
            uma: {
                speed: uma.speed,
                stamina: uma.stamina,
                power: uma.power,
                guts: uma.guts,
                wisdom: uma.wisdom,
                strategy,
                distanceAptitude: uma.distanceAptitude,
                surfaceAptitude: uma.surfaceAptitude,
                styleAptitude: uma.styleAptitude,
            },
            deterministic: false,
            numSimulations: numSims,
        }

        const skillFilter = groupSkills.map((s) => s.name)

        await new Promise<void>((resolve, reject) => {
            const runner = new SimulationRunner(config, staticData, workerPath)
            runner
                .run((progress: SimulationProgress) => {
                    if (progress.type === 'complete' && progress.results) {
                        for (const r of progress.results) {
                            results.set(r.skill, r.meanLength)
                        }
                    }
                    if (progress.type === 'error') {
                        // Skill can't trigger or other error: leave as null
                    }
                }, skillFilter)
                .then(resolve)
                .catch(reject)
        })
    }

    return results
}

const RESULTS_FILE = 'race-check-results.md'

function buildMarkdownTable(
    races: RaceSpec[],
    skills: SkillSpec[],
    allResults: Map<string, number | null>[],
): string {
    const skillNames = skills.map((s) => s.name)
    const headers = ['Race', 'Turn', 'Location', 'Length', ...skillNames]
    const alignments = [
        '---', '---', '---', '---',
        ...skillNames.map(() => '---:'),
    ]

    const rows = races.map((race, r) => {
        const results = allResults[r]!
        return [
            race.raceName,
            race.turn,
            race.trackName,
            `${race.distance}m`,
            ...skillNames.map((name) => {
                const v = results.get(name)
                return v != null ? v.toFixed(2) : '--'
            }),
        ]
    })

    const lines = [
        `| ${headers.join(' | ')} |`,
        `| ${alignments.join(' | ')} |`,
        ...rows.map((cols) => `| ${cols.join(' | ')} |`),
    ]
    return lines.join('\n')
}

function printAndWriteTable(
    races: RaceSpec[],
    skills: SkillSpec[],
    allResults: Map<string, number | null>[],
): void {
    const table = buildMarkdownTable(races, skills, allResults)
    console.log(table)
    writeFileSync(RESULTS_FILE, table + '\n')
    process.stderr.write(`Results written to ${RESULTS_FILE}\n`)
}

async function main(): Promise<void> {
    const args = parseArgs()

    // Load default config
    const defaultConfigPath = resolve(
        new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'race-check.default.json',
    )
    const defaultConfig = loadJson<RaceCheckConfig>(defaultConfigPath)

    // Apply overrides
    const skills = args.skills ?? defaultConfig.skills
    const uma = defaultConfig.uma

    // If --config provided, override uma stats from it
    if (args.configPath) {
        const configPath = resolve(
            args.configPath.includes('/') || args.configPath.includes('\\')
                ? args.configPath
                : `configs/${args.configPath}`,
        )
        const umaConfig = loadJson<SimulationRunnerConfig>(configPath)
        if (umaConfig.uma) {
            if (umaConfig.uma.speed != null) uma.speed = umaConfig.uma.speed
            if (umaConfig.uma.stamina != null) uma.stamina = umaConfig.uma.stamina
            if (umaConfig.uma.power != null) uma.power = umaConfig.uma.power
            if (umaConfig.uma.guts != null) uma.guts = umaConfig.uma.guts
            if (umaConfig.uma.wisdom != null) uma.wisdom = umaConfig.uma.wisdom
            if (umaConfig.uma.distanceAptitude)
                uma.distanceAptitude = umaConfig.uma.distanceAptitude
            if (umaConfig.uma.surfaceAptitude)
                uma.surfaceAptitude = umaConfig.uma.surfaceAptitude
            if (umaConfig.uma.styleAptitude)
                uma.styleAptitude = umaConfig.uma.styleAptitude
        }
    }

    // Build race list
    let raceSpecs: RaceSpec[]

    if (args.track && args.distance) {
        // One-off mode
        raceSpecs = [
            {
                raceName: `${args.track} ${args.distance}m`,
                turn: '',
                trackName: args.track,
                distance: args.distance,
                surface: args.surface ?? 'Turf',
                season: args.season ?? 'Spring',
            },
        ]
    } else {
        // Batch mode
        const racesPath = args.racesPath ?? defaultConfig.races
        const races = loadJson<MMLRace[]>(racesPath)
        raceSpecs = mmlToRaceSpecs(races)
    }

    // Load static data
    const dataDir = resolve('uma-tools/umalator-global')
    const staticData = {
        courseData: loadJson<Record<string, RawCourseData>>(
            `${dataDir}/course_data.json`,
        ),
        skillData: loadJson<Record<string, SkillDataEntry>>(
            `${dataDir}/skill_data.json`,
        ),
        skillMeta: loadJson<Record<string, SkillMeta>>(
            `${dataDir}/skill_meta.json`,
        ),
        skillNames: loadJson<Record<string, string[]>>(
            `${dataDir}/skillnames.json`,
        ),
        trackNames: loadJson<Record<string, string[]>>(
            `${dataDir}/tracknames.json`,
        ),
    }

    const workerPath = new URL('./simulation.worker.js', import.meta.url)

    // Run simulations for each race
    const allResults: Map<string, number | null>[] = []
    const total = raceSpecs.length
    for (let i = 0; i < raceSpecs.length; i++) {
        const race = raceSpecs[i]!
        process.stderr.write(
            `\r[${i + 1}/${total}] ${race.raceName}...`,
        )
        const results = await runRaceSkills(
            race,
            skills,
            uma,
            staticData,
            workerPath,
            args.numSims,
        )
        allResults.push(results)
    }
    process.stderr.write('\r' + ' '.repeat(60) + '\r')

    if (args.json) {
        const output = raceSpecs.map((race, i) => {
            const results = allResults[i]!
            const skillResults: Record<string, number | null> = {}
            for (const skill of skills) {
                skillResults[skill.name] = results.get(skill.name) ?? null
            }
            return {
                raceName: race.raceName,
                turn: race.turn,
                trackName: race.trackName,
                distance: race.distance,
                surface: race.surface,
                ...skillResults,
            }
        })
        console.log(JSON.stringify(output, null, 2))
    } else {
        printAndWriteTable(raceSpecs, skills, allResults)
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
