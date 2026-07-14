#!/usr/bin/env node
// Check out the latest upstream master for both submodules.
//
// We always run upstream master (uma-tools for game data/UI, the nested
// uma-skill-tools for the simulation engine) instead of the recorded
// gitlinks: silently running an outdated version is worse than a loud
// failure when upstream changes something. Upstream breakage surfaces in CI
// (typecheck/tests) instead of going unnoticed.
//
// A vanilla `git submodule update --recursive` is never sufficient anyway:
// the parent uma-tools records a stale gitlink for uma-skill-tools, ~9
// commits behind its own code's requirements.
//
// Everything umalator needs beyond the engine itself (per-uma
// mood/popularity handling, the other-uma wisdom for skill activation,
// unique level scaling, over-1200 mechanics gating) lives in the vendored
// shared/compare.ts, so plain master is sufficient; no out-of-branch commit
// is required.
//
// Idempotent and safe to run from `postinstall`: it no-ops when a submodule
// is absent and keeps the current checkout when offline. Pass --strict
// (CI / `npm run setup`) to exit non-zero on failure; without it failures
// only warn so a plain `npm install` never breaks.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Updated in order: the parent first, so its checkout (which moves the
// recorded nested gitlink) cannot undo the nested update.
export const SUBMODULES = ['uma-tools', 'uma-tools/uma-skill-tools']

function git(cwd, args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function fail(strict, message) {
    if (strict) {
        throw new Error(`[update-submodules] ${message}`)
    }
    console.warn(`[update-submodules] WARNING: ${message}`)
    console.warn(
        '[update-submodules] Keeping the current checkout; run `npm run setup` to retry.',
    )
}

/**
 * Fetch and check out origin/master for one submodule. Does not initialise
 * it: that is the caller's job (`git submodule update --init --recursive`,
 * or cloning with --recursive). When the submodule is missing this is a
 * no-op so a plain `npm install` in a frontend-only checkout stays quiet.
 */
function updateSubmodule(relPath, strict) {
    const path = join(REPO_ROOT, ...relPath.split('/'))
    if (!existsSync(join(path, '.git'))) {
        console.log(
            `[update-submodules] ${relPath} not initialised; skipping. ` +
                'Run `npm run setup` (or clone with --recursive) to set it up.',
        )
        return
    }

    try {
        git(path, ['fetch', 'origin', 'master'])
    } catch (err) {
        return fail(strict, `could not fetch ${relPath} (offline?): ${err.message}`)
    }

    const target = git(path, ['rev-parse', 'FETCH_HEAD'])
    const current = git(path, ['rev-parse', 'HEAD'])
    if (current === target) {
        console.log(
            `[update-submodules] ${relPath} already on origin/master (${target.slice(0, 7)}).`,
        )
        return
    }

    try {
        git(path, ['checkout', '--detach', target])
    } catch (err) {
        return fail(
            strict,
            `could not check out ${relPath} ${target.slice(0, 7)} (dirty checkout?): ${err.message}`,
        )
    }
    console.log(
        `[update-submodules] ${relPath}: ${current.slice(0, 7)} -> ${target.slice(0, 7)} (origin/master).`,
    )
}

const isMain =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
    const strict = process.argv.includes('--strict')
    try {
        for (const submodule of SUBMODULES) {
            updateSubmodule(submodule, strict)
        }
    } catch (err) {
        console.error(err.message)
        process.exit(1)
    }
}
