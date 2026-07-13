// Vendored from uma-tools/umalator/compare.ts and adapted to the published
// uma-skill-tools master API. The upstream file targets unpublished engine
// changes (a level parameter on addSkill, withItidoriarasoi, otherHorse), so
// it cannot run against any public uma-skill-tools commit; this copy expresses
// the same behavior through the public API:
//
// - mood/popularity are set per-builder (RaceParameters) instead of living on
//   HorseParameters; both umas here carry their own mood/popularity.
// - otherHorse(desc) is replaced by otherRawWisdom(wisdom, mood), which is the
//   only thing the engine consumes it for (Perspective.Other activation rolls).
// - Unique-skill level scaling is applied through the builder's skill hooks
//   (see uniqueLevelFactor) instead of an addSkill level parameter.
// - Over-1200 mechanics per upstream 91f624e: Asiwotameru applies everywhere,
//   StaminaSyoubu is JP-only (global does not have it).
// - options.useCompeteTop (withItidoriarasoi) is not supported by the public
//   engine and is ignored.
import type { CourseData } from '../uma-tools/uma-skill-tools/CourseData'
import { Region, RegionList } from '../uma-tools/uma-skill-tools/Region'
import type { RaceParameters } from '../uma-tools/uma-skill-tools/RaceParameters'
import type { RaceSolver } from '../uma-tools/uma-skill-tools/RaceSolver'
import { Perspective } from '../uma-tools/uma-skill-tools/RaceSolver'
import {
    RaceSolverBuilder,
    type SkillData,
} from '../uma-tools/uma-skill-tools/RaceSolverBuilder'
import type { GameHpPolicy } from '../uma-tools/uma-skill-tools/HpPolicy'
import type { PRNG } from '../uma-tools/uma-skill-tools/Random'
import { Rule30CARng } from '../uma-tools/uma-skill-tools/Random'
import {
    type ActivationSamplePolicy,
    AllCornerRandomPolicy,
    ErlangRandomPolicy,
    ImmediatePolicy,
    LogNormalRandomPolicy,
    RandomPolicy,
    StraightRandomPolicy,
} from '../uma-tools/uma-skill-tools/ActivationSamplePolicy'
import type {
    HorseState,
    SamplePolicyDesc,
} from '../uma-tools/components/HorseDefTypes'
import skillmetaRaw from '../uma-tools/skill_meta.json'

// Injected at build time (esbuild define / vitest define).
declare const CC_GLOBAL: boolean

const skillmeta = skillmetaRaw as Record<string, { groupId: string }>

/** Race parameters without the per-uma fields; those come from the umas. */
export type CompareRaceParams = Omit<RaceParameters, 'mood' | 'popularity'>

/** HorseState plus the id of its unique skill so level scaling knows its target. */
export interface CompareHorseState extends HorseState {
    uniqueSkillId?: string
}

export interface CompareOptions {
    usePosKeep?: boolean
    useIntChecks?: boolean
}

// Unique-skill level multipliers, recovered from the reference implementation
// (uma-tools umalator-global compiled worker): stat-up effects (types 1-5) and
// TargetSpeed (27) / Accel (31) have their own tables; everything else scales
// 2% per level. Index is level - 1; levels are clamped to [1, 10].
const STAT_UP_FACTORS = Object.freeze([
    1, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.1,
])
const LEVEL_FACTORS: Record<number, readonly number[]> = Object.freeze({
    1: STAT_UP_FACTORS,
    2: STAT_UP_FACTORS,
    3: STAT_UP_FACTORS,
    4: STAT_UP_FACTORS,
    5: STAT_UP_FACTORS,
    27: Object.freeze([
        1, 1.01, 1.04, 1.07, 1.1, 1.13, 1.16, 1.19, 1.22, 1.25,
    ]),
    31: Object.freeze([
        1, 1.02, 1.04, 1.06, 1.08, 1.1, 1.125, 1.15, 1.175, 1.2,
    ]),
})

/** Effect-modifier multiplier for a unique skill at the given level. */
export function uniqueLevelFactor(effectType: number, level: number): number {
    const lv = Math.min(Math.max(Math.round(level), 1), 10)
    const table = LEVEL_FACTORS[effectType]
    return table ? table[lv - 1]! : 1 + (lv - 1) * 0.02
}

interface UniqueAtLevel {
    id: string
    lv: number
    perspective: Perspective
}

/**
 * Scales the effects of each uma's unique skill by its level via the
 * builder's skill hooks. Must be pushed before withAsiwotameru so a scaled
 * PowerUp counts toward the over-1200 power threshold, mirroring the
 * reference implementation where scaling happens at skill-build time.
 */
function applyUniqueLevelScaling(
    builder: RaceSolverBuilder,
    uniques: UniqueAtLevel[],
): void {
    const scaled = uniques.filter((u) => u.id !== '' && u.lv > 1)
    if (scaled.length === 0) return
    builder._extraSkillHooks.push((skilldata: SkillData[]) => {
        for (const sd of skilldata) {
            const u = scaled.find(
                (u) => u.id === sd.skillId && u.perspective === sd.perspective,
            )
            if (u === undefined) continue
            sd.effects = sd.effects.map((ef) => ({
                ...ef,
                modifier: ef.modifier * uniqueLevelFactor(ef.type, u.lv),
            }))
        }
    })
}

class FixedDistancePolicy {
    constructor(readonly pos: number) {}
    sample(_0: RegionList, nsamples: number, _1: PRNG) {
        return Array.from(
            { length: nsamples },
            (_) => new Region(this.pos, this.pos + 10),
        )
    }

    // these should never be called because this policy is only used as an
    // override and never reconciled with anything
    reconcile(_: ActivationSamplePolicy): ActivationSamplePolicy {
        throw new Error('FixedDistancePolicy cannot be reconciled')
    }
    reconcileImmediate(_: ActivationSamplePolicy): ActivationSamplePolicy {
        throw new Error('FixedDistancePolicy cannot be reconciled')
    }
    reconcileDistributionRandom(
        _: ActivationSamplePolicy,
    ): ActivationSamplePolicy {
        throw new Error('FixedDistancePolicy cannot be reconciled')
    }
    reconcileRandom(_: ActivationSamplePolicy): ActivationSamplePolicy {
        throw new Error('FixedDistancePolicy cannot be reconciled')
    }
    reconcileStraightRandom(_: ActivationSamplePolicy): ActivationSamplePolicy {
        throw new Error('FixedDistancePolicy cannot be reconciled')
    }
    reconcileAllCornerRandom(
        _: ActivationSamplePolicy,
    ): ActivationSamplePolicy {
        throw new Error('FixedDistancePolicy cannot be reconciled')
    }
}

export function instantiateSamplePolicy(
    desc: SamplePolicyDesc | undefined,
): ActivationSamplePolicy | undefined {
    if (desc == null) return undefined
    switch (desc.policy) {
        case 'immediate':
            return ImmediatePolicy
        case 'random':
            return RandomPolicy
        case 'straight-random':
            return StraightRandomPolicy
        case 'all-corner-random':
            return AllCornerRandomPolicy
        case 'log-normal':
            return new LogNormalRandomPolicy(desc.mu, desc.sigma)
        case 'erlang':
            return new ErlangRandomPolicy(desc.k, desc.lambda)
        case 'fixed':
            return new FixedDistancePolicy(
                desc.pos,
            ) as unknown as ActivationSamplePolicy
    }
}

/** Per-skill activation records: [start, end] positions ('downhill' stores time). */
export type SkillPositionMap = Map<string, [number, number][] | number>

function getActivator(
    selfSet: SkillPositionMap,
    otherSet: SkillPositionMap | null,
) {
    return function (s: RaceSolver, id: string, persp?: Perspective) {
        const skillSet = persp == Perspective.Self ? selfSet : otherSet
        if (id == 'downhill') {
            if (!skillSet!.has('downhill')) skillSet!.set('downhill', 0)
            skillSet!.set(
                'downhill',
                (skillSet!.get('downhill') as number) - s.accumulatetime.t,
            )
        } else if (
            skillSet != null &&
            id != 'asitame' &&
            id != 'staminasyoubu'
        ) {
            if (!skillSet.has(id)) skillSet.set(id, [])
            ;(skillSet.get(id) as [number, number][]).push([s.pos, -1])
        }
    }
}

function getDeactivator(
    selfSet: SkillPositionMap,
    otherSet: SkillPositionMap | null,
    course: CourseData,
) {
    return function (s: RaceSolver, id: string, persp?: Perspective) {
        const skillSet = persp == Perspective.Self ? selfSet : otherSet
        if (id == 'downhill') {
            skillSet!.set(
                'downhill',
                (skillSet!.get('downhill') as number) + s.accumulatetime.t,
            )
        } else if (
            skillSet != null &&
            id != 'asitame' &&
            id != 'staminasyoubu'
        ) {
            const ar = skillSet.get(id) as [number, number][] // activation record
            // in the case of adding multiple copies of speed debuffs a skill can activate again before the first
            // activation has finished (as each copy has the same ID), so we can't just access a specific index
            // (-1).
            // assume that multiple activations of a skill always deactivate in the same order (probably true?) so
            // just seach for the first record that hasn't had its deactivation location filled out yet.
            const r = ar.find((x) => x[1] == -1)
            // onSkillDeactivate gets called twice for skills that have both speed and accel components, so the end
            // position could already have been filled out and r will be undefined
            if (r != null) r[1] = Math.min(s.pos, course.distance)
        }
    }
}

export interface RunData {
    t: [number[], number[]]
    p: [number[], number[]]
    v: [number[], number[]]
    hp: [number[], number[]]
    sk: [SkillPositionMap | null, SkillPositionMap | null]
    sdly: [number, number]
    dh: [number, number]
}

export interface ComparisonResult {
    results: number[]
    runData: {
        nspurt: [number, number]
        minrun: RunData | undefined
        maxrun: RunData | undefined
        meanrun: RunData | undefined
        medianrun: RunData | undefined
    }
}

// builder.onSkillActivate declares a 2-arg callback but the solver invokes it
// with (solver, skillId, perspective); widen so our 3-arg handlers type-check.
type SkillCallback = (s: RaceSolver, id: string, persp?: Perspective) => void
interface BuilderWithSkillCallbacks {
    onSkillActivate(cb: SkillCallback): void
    onSkillDeactivate(cb: SkillCallback): void
}

export function runComparison(
    nsamples: number,
    course: CourseData,
    racedef: CompareRaceParams,
    uma1: CompareHorseState,
    uma2: CompareHorseState,
    seed: [number, number],
    options: CompareOptions,
): ComparisonResult {
    const standard = new RaceSolverBuilder(nsamples)
        .seed(...seed)
        .course(course)
        .ground(racedef.groundCondition)
        .weather(racedef.weather)
        .season(racedef.season)
        .time(racedef.time)
    if (racedef.orderRange != null) {
        standard
            .order(racedef.orderRange[0], racedef.orderRange[1])
            .numUmas(racedef.numUmas!)
    }
    const compare = standard.fork()
    standard
        .horse(uma1)
        .mood(uma1.mood)
        .popularity(uma1.popularity)
        .otherRawWisdom(uma2.wisdom, uma2.mood)
    compare
        .horse(uma2)
        .mood(uma2.mood)
        .popularity(uma2.popularity)
        .otherRawWisdom(uma1.wisdom, uma1.mood)
    const wisdomSeeds = new Map<string, [number, number]>()
    const wisdomRng = new Rule30CARng(...seed)
    for (let i = 0; i < 20; ++i) wisdomRng.pair() // advance the RNG state a bit because we only seeded the low bits
    // ensure skills common to the two umas are added in the same order regardless of what additional skills they have
    // this is important to make sure the rng for their activations is synced
    // sort first by groupId so that white and gold versions of a skill get added in the same order
    const uma2Keys = new Set(uma2.skills.keys())
    const common = Array.from(uma1.skills.keys())
        .filter((k) => uma2Keys.has(k))
        .sort((a, b) => +a - +b)
    const commonIdx = (id: string) => {
        const i = common.indexOf(skillmeta[id]!.groupId)
        return i > -1 ? i : common.length
    }
    const sort = (a: string, b: string) => commonIdx(a) - commonIdx(b) || +a - +b
    Array.from(uma1.skills.values())
        .sort(sort)
        .forEach((id) => {
            wisdomSeeds.set(id, wisdomRng.pair() as [number, number])
            standard.addSkill(
                id,
                Perspective.Self,
                instantiateSamplePolicy(uma1.samplePolicies.get(id)),
            )
        })
    Array.from(uma2.skills.values())
        .sort(sort)
        .forEach((id) => {
            // this means that the second set of rolls 'wins' for skills on both, but this doesn't actually matter
            wisdomSeeds.set(id, wisdomRng.pair() as [number, number])
            compare.addSkill(
                id,
                Perspective.Self,
                instantiateSamplePolicy(uma2.samplePolicies.get(id)),
            )
        })
    // iterating twice like this is VERY ANNOYING
    // unfortunately, because we add every skill to both umas, if we add them in the same iteration uma2 will have all the
    // Other skills before its Self skills, which can cause skill desync issues when there are debuffs
    // TODO i don't really like this, this might just be masking some deeper underlying issue.
    uma1.skills.forEach((id) =>
        compare.addSkill(
            id,
            Perspective.Other,
            instantiateSamplePolicy(uma1.samplePolicies.get(id)),
        ),
    )
    uma2.skills.forEach((id) =>
        standard.addSkill(
            id,
            Perspective.Other,
            instantiateSamplePolicy(uma2.samplePolicies.get(id)),
        ),
    )
    // Level scaling must be hooked before withAsiwotameru (hooks run in order).
    applyUniqueLevelScaling(standard, [
        {
            id: uma1.uniqueSkillId ?? '',
            lv: uma1.uniqueLv,
            perspective: Perspective.Self,
        },
        {
            id: uma2.uniqueSkillId ?? '',
            lv: uma2.uniqueLv,
            perspective: Perspective.Other,
        },
    ])
    applyUniqueLevelScaling(compare, [
        {
            id: uma2.uniqueSkillId ?? '',
            lv: uma2.uniqueLv,
            perspective: Perspective.Self,
        },
        {
            id: uma1.uniqueSkillId ?? '',
            lv: uma1.uniqueLv,
            perspective: Perspective.Other,
        },
    ])
    standard.withAsiwotameru()
    compare.withAsiwotameru()
    if (!CC_GLOBAL) {
        standard.withStaminaSyoubu()
        compare.withStaminaSyoubu()
    }
    if (options.usePosKeep) {
        standard.useDefaultPacer()
        compare.useDefaultPacer()
    }
    if (options.useIntChecks) {
        standard.withWisdomChecks(wisdomSeeds)
        compare.withWisdomChecks(wisdomSeeds)
    }
    const skillPos1: SkillPositionMap = new Map()
    const skillPos2: SkillPositionMap = new Map()
    ;(standard as unknown as BuilderWithSkillCallbacks).onSkillActivate(
        getActivator(skillPos1, null),
    )
    ;(standard as unknown as BuilderWithSkillCallbacks).onSkillDeactivate(
        getDeactivator(skillPos1, null, course),
    )
    ;(compare as unknown as BuilderWithSkillCallbacks).onSkillActivate(
        getActivator(skillPos2, null),
    )
    ;(compare as unknown as BuilderWithSkillCallbacks).onSkillDeactivate(
        getDeactivator(skillPos2, null, course),
    )
    let a = standard.build()
    let b = compare.build()
    let ai: 0 | 1 = 1
    let bi: 0 | 1 = 0
    let sign = 1
    const diff: number[] = []
    let min = Infinity,
        max = -Infinity,
        estMean = 0,
        estMedian = 0,
        bestMeanDiff = Infinity,
        bestMedianDiff = Infinity
    let minrun, maxrun, meanrun, medianrun
    const nspurt: [number, number] = [0, 0]
    const sampleCutoff = Math.max(Math.floor(nsamples * 0.8), nsamples - 200)
    let retry = false
    for (let i = 0; i < nsamples; ++i) {
        const s1 = a.next(retry).value as RaceSolver
        const s2 = b.next(retry).value as RaceSolver
        const data: RunData = {
            t: [[], []],
            p: [[], []],
            v: [[], []],
            hp: [[], []],
            sk: [null, null],
            sdly: [0, 0],
            dh: [0, 0],
        }

        while (s2.pos < course.distance) {
            s2.step(1 / 15)
            data.t[ai].push(s2.accumulatetime.t)
            data.p[ai].push(s2.pos)
            data.v[ai].push(
                s2.currentSpeed +
                    (s2.modifiers.currentSpeed.acc +
                        s2.modifiers.currentSpeed.err),
            )
            data.hp[ai].push((s2.hp as GameHpPolicy).hp)
        }
        data.sdly[ai] = s2.startDelay

        while (s1.accumulatetime.t < s2.accumulatetime.t) {
            s1.step(1 / 15)
            data.t[bi].push(s1.accumulatetime.t)
            data.p[bi].push(s1.pos)
            data.v[bi].push(
                s1.currentSpeed +
                    (s1.modifiers.currentSpeed.acc +
                        s1.modifiers.currentSpeed.err),
            )
            data.hp[bi].push((s1.hp as GameHpPolicy).hp)
        }
        // run the rest of the way to have data for the chart
        const pos1 = s1.pos
        while (s1.pos < course.distance) {
            s1.step(1 / 15)
            data.t[bi].push(s1.accumulatetime.t)
            data.p[bi].push(s1.pos)
            data.v[bi].push(
                s1.currentSpeed +
                    (s1.modifiers.currentSpeed.acc +
                        s1.modifiers.currentSpeed.err),
            )
            data.hp[bi].push((s1.hp as GameHpPolicy).hp)
        }
        data.sdly[bi] = s1.startDelay

        s2.cleanup()
        s1.cleanup()

        data.dh[1] = (skillPos2.get('downhill') as number | undefined) || 0
        skillPos2.delete('downhill')
        data.dh[0] = (skillPos1.get('downhill') as number | undefined) || 0
        skillPos1.delete('downhill')
        data.sk[1] = new Map(skillPos2) // NOT ai (NB. why not?)
        skillPos2.clear()
        data.sk[0] = new Map(skillPos1) // NOT bi (NB. why not?)
        skillPos1.clear()

        // if `standard` is faster than `compare` then the former ends up going past the course distance
        // this is not in itself a problem, but it would overestimate the difference if for example a skill
        // continues past the end of the course. i feel like there are probably some other situations where it would
        // be inaccurate also. if this happens we have to swap them around and run it again.
        if (s2.pos < pos1 || isNaN(pos1)) {
            ;[b, a] = [a, b]
            ;[bi, ai] = [ai, bi]
            sign *= -1
            --i // this one didnt count
            retry = true
        } else {
            retry = false
            nspurt[bi] += +(s1.isLastSpurt && s1.lastSpurtTransition == -1)
            nspurt[ai] += +(s2.isLastSpurt && s2.lastSpurtTransition == -1)
            const basinn = (sign * (s2.pos - pos1)) / 2.5
            diff.push(basinn)
            if (basinn < min) {
                min = basinn
                minrun = data
            }
            if (basinn > max) {
                max = basinn
                maxrun = data
            }
            if (i == sampleCutoff) {
                diff.sort((a, b) => a - b)
                estMean = diff.reduce((a, b) => a + b) / diff.length
                const mid = Math.floor(diff.length / 2)
                estMedian =
                    mid > 0 && diff.length % 2 == 0
                        ? (diff[mid - 1]! + diff[mid]!) / 2
                        : diff[mid]!
            }
            if (i >= sampleCutoff) {
                const meanDiff = Math.abs(basinn - estMean)
                const medianDiff = Math.abs(basinn - estMedian)
                if (meanDiff < bestMeanDiff) {
                    bestMeanDiff = meanDiff
                    meanrun = data
                }
                if (medianDiff < bestMedianDiff) {
                    bestMedianDiff = medianDiff
                    medianrun = data
                }
            }
        }
    }
    diff.sort((a, b) => a - b)
    return {
        results: diff,
        runData: { nspurt, minrun, maxrun, meanrun, medianrun },
    }
}
