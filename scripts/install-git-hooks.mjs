#!/usr/bin/env node
// Point git at the tracked hooks in .githooks/ so `git pull` runs
// post-merge (which keeps the floating submodules on upstream master).
// No-ops outside a git checkout so a plain `npm install` never breaks.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

if (!existsSync(join(REPO_ROOT, '.git'))) {
    console.log('[install-git-hooks] not a git checkout; skipping.')
} else {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    })
    console.log('[install-git-hooks] core.hooksPath -> .githooks')
}
