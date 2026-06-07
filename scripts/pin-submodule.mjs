#!/usr/bin/env node
// Pin the nested uma-skill-tools submodule to the exact commit the app depends on.
//
// 24f0a88 is one commit ahead of upstream uma-skill-tools master and carries two
// changes our code relies on: the otherHorse() API used by
// uma-tools/umalator/compare.ts, and the move of mood/popularity from
// RaceParameters onto HorseParameters. The parent uma-tools submodule still
// records an older commit (6ba5ca0), so a vanilla `git submodule update
// --recursive` lands on the wrong commit. This script re-pins it and is the
// single source of truth for the SHA (postinstall, npm run setup, start_web.ps1
// and CI all call it).
//
// 24f0a88 is a loose commit (not a branch tip), so a plain `git fetch` won't
// retrieve it; we fetch the full 40-char SHA explicitly.
//
// Idempotent and safe to run from `postinstall`: it no-ops when the submodule is
// absent or already on the target commit. Pass --strict (CI / `npm run setup`)
// to exit non-zero on failure; without it failures only warn so a plain
// `npm install` never breaks.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const TARGET_SHA = '24f0a8862106dd4aaeea55e90e975acc9ca5d019'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SUBMODULE_PATH = join(REPO_ROOT, 'uma-tools', 'uma-skill-tools')

/** Whether the submodule HEAD differs from the commit we depend on. */
export function shouldPin(currentSha) {
    return currentSha?.trim() !== TARGET_SHA
}

function git(args) {
    return execFileSync('git', args, { cwd: SUBMODULE_PATH, encoding: 'utf8' }).trim()
}

function fail(strict, message) {
    if (strict) {
        throw new Error(`[pin-submodule] ${message}`)
    }
    console.warn(`[pin-submodule] WARNING: ${message}`)
    console.warn('[pin-submodule] Run `npm run setup` to retry.')
}

/**
 * Re-pin uma-skill-tools to TARGET_SHA. Does not initialise the submodule: that
 * is the caller's job (`git submodule update --init --recursive`, or cloning
 * with --recursive). When the submodule is missing this is a no-op so a plain
 * `npm install` in a frontend-only checkout stays quiet.
 */
function pin(strict) {
    if (!existsSync(join(SUBMODULE_PATH, '.git'))) {
        console.log(
            '[pin-submodule] uma-tools/uma-skill-tools not initialised; skipping. ' +
                'Run `npm run setup` (or clone with --recursive) to set it up.',
        )
        return
    }

    let current
    try {
        current = git(['rev-parse', 'HEAD'])
    } catch (err) {
        return fail(strict, `could not read submodule HEAD: ${err.message}`)
    }

    if (!shouldPin(current)) {
        console.log(`[pin-submodule] uma-skill-tools already on ${TARGET_SHA.slice(0, 7)}.`)
        return
    }

    console.log(`[pin-submodule] pinning uma-skill-tools to ${TARGET_SHA.slice(0, 7)}...`)
    try {
        git(['fetch', 'origin', TARGET_SHA])
        git(['checkout', TARGET_SHA])
    } catch (err) {
        return fail(strict, `failed to pin: ${err.message}`)
    }

    if (shouldPin(git(['rev-parse', 'HEAD']))) {
        return fail(strict, `checkout did not land on ${TARGET_SHA}.`)
    }
    console.log('[pin-submodule] done.')
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
    try {
        pin(process.argv.includes('--strict'))
    } catch (err) {
        console.error(err.message)
        process.exit(1)
    }
}
