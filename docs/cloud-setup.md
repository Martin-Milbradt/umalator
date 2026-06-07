# Setting up Umalator in a Cloud / CI environment

This guide is for running Umalator in an **ephemeral, headless Linux
environment** — Claude Code on the web, a GitHub Action, a fresh container, etc.
— where the repository is cloned fresh, `node_modules` is absent, and there is no
display. For everyday local development on your own machine, the
[README](../README.md) "Getting Started" section is enough; this doc covers the
extra steps and gotchas that bite in automation.

> TL;DR — one command does all four steps (submodule init, pin, build):
>
> ```bash
> npm install      # postinstall pins uma-skill-tools if the submodule is present
> npm run setup    # init submodules + pin uma-skill-tools + build workers
> ```
>
> `npm run setup` wraps `scripts/pin-submodule.mjs`, the single source of truth
> for the pinned SHA. The equivalent manual steps (useful when something goes
> wrong) are below.

## Prerequisites: network access

The remote environment's network policy must allow outbound HTTPS to:

- **github.com** — to clone the `uma-tools` submodule and fetch the pinned
  `uma-skill-tools` commit.
- **the upstream uma-tools git remote** — only needed when building with
  `UPDATE_GAME_DATA=1` (the deploy workflow), which refreshes
  `skill_data.json` / `skill_meta.json` from upstream `master`. A plain
  `npm run build` uses the pinned submodule data and needs no extra network.
- **the npm registry** — for `npm install`.

If you are configuring a Claude Code on the web environment, pick a network
policy that permits these. See
<https://code.claude.com/docs/en/claude-code-on-the-web>.

## Step 1 — Install npm dependencies

A fresh container has no `node_modules`:

```bash
npm install      # or `npm ci` if package-lock.json is trusted/unchanged
```

## Step 2 — Initialise the submodules

```bash
git submodule update --init --recursive
```

This lands `uma-tools/uma-skill-tools` on the commit the parent `uma-tools`
records (`6ba5ca0` as of writing), which is **not** the commit we need. Do not
skip Step 3.

## Step 3 — Pin `uma-skill-tools` to `24f0a88` (the easy-to-miss step)

> `node scripts/pin-submodule.mjs` (run for you by `postinstall` and
> `npm run setup`) does exactly this step, idempotently. The manual commands
> below are the fallback when you need to do it by hand.

We depend on commit `24f0a88`, which is **one commit ahead of upstream
`uma-skill-tools` master**. It carries two changes our code relies on:

- the `otherHorse()` API used by `uma-tools/umalator/compare.ts`, and
- the move of `mood` / `popularity` from `RaceParameters` onto
  `HorseParameters`.

Because `24f0a88` is a loose commit that is not the tip of any branch, a plain
`git fetch` will **not** retrieve it, and `git checkout 24f0a88` fails with
`pathspec '24f0a88' did not match any file(s) known to git`. You must fetch the
**full 40-character SHA** explicitly:

```bash
cd uma-tools/uma-skill-tools
git fetch origin 24f0a8862106dd4aaeea55e90e975acc9ca5d019
git checkout 24f0a8862106dd4aaeea55e90e975acc9ca5d019
cd ../..

# Verify:
git -C uma-tools/uma-skill-tools rev-parse HEAD
# -> 24f0a8862106dd4aaeea55e90e975acc9ca5d019
```

This is exactly what `.github/workflows/deploy.yml` and `start_web.ps1` do after
submodule init. After this checkout, `git status` will show
`m uma-tools` ("modified content") forever — that is the **expected** state, not
something to commit. See [Cleanup](#cleanup-expected-git-noise) below.

### Symptom if you skip Step 3

With the submodule stuck on `6ba5ca0`, `npm run build` / `vite` still transpile
(esbuild and `tsx` do not type-check), but:

- `npx tsc --noEmit` reports type errors in our own files where `mood` /
  `popularity` flow through `HorseParameters` (the pre-`24f0a88` types differ),
  and
- running an actual simulation can fail at runtime because `otherHorse()` is
  missing.

## Step 4 — Build the workers and copy data

```bash
npm run build
```

`tsx build.ts` builds the Node worker (`simulation.worker.js`) and the browser
worker (`static/simulation.browser-worker.js`) and copies the pinned submodule's
JSON data files into `static/data/`. Run this **before** `npm test`, `npx vite`,
or the CLI (the worker integration tests spawn the built worker). To refresh the
game data from upstream (what the deploy workflow does), build with
`UPDATE_GAME_DATA=1 npm run build`.

## Running the tests

```bash
npm test                       # full suite (vitest run)
npx vitest run utils.test.ts   # a single file
```

`simulation-runner.test.ts` exercises the Node worker, so it needs Steps 3–4
done first. The pure-function tests (`utils.test.ts`, `public/*.test.ts`) do not.

## Type checking — caveat

The CLAUDE.md command is `npx tsc --noEmit`, but be aware the root `tsconfig.json`
enables `noUncheckedIndexedAccess` and currently surfaces a number of
`possibly 'undefined'` errors across our own files (an in-progress cleanup —
see issue #63). Type errors do **not** block `npm run build`/`vite`/`npm test`,
because none of those type-check. Treat `tsc` output as advisory and scope your
review to the files you changed rather than expecting a clean exit.

## Visual / UI verification in a headless environment

There is no browser or display, so to confirm a UI or layout change you drive the
Vite dev server with a headless browser (Playwright works well):

```bash
# 1. Install a headless browser once (chromium-headless-shell is enough):
npm i -D playwright
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright install chromium

# 2. Start the dev server in the background:
nohup npx vite > /tmp/vite.log 2>&1 &
#    (npx vite alone serves the already-built workers; `npm run dev` rebuilds first)

# 3. Drive it from a script (see example below) and screenshot.
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node shot.mjs
```

A minimal screenshot driver:

```js
import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.keyboard.press('Escape') // dismiss the first-visit onboarding tour
// To exercise layout with lots of rows without running a simulation, inject
// fake <tr>s into #results-tbody here, then screenshot.
await p.screenshot({ path: 'out.png' })
await b.close()
```

Notes:

- **Layout/CSS changes** can be verified by injecting placeholder rows into
  `#results-tbody` — you do not need a working simulation, so Step 3 is optional
  for pure layout work (but still recommended).
- **Simulation behaviour** must go through the real worker, which requires
  Steps 3–4.
- The onboarding tour (driver.js) auto-opens on first visit; press `Escape` (or
  clear `localStorage["umalator:tour-seen"]` expectations) so it doesn't cover
  the UI in screenshots.
- Remember to install `playwright` only as a throwaway dev tool; do not commit
  it to `package.json`. Revert `package.json` / `package-lock.json` before
  committing your actual change.

## Cleanup: expected git noise

After Step 3, `git status` shows:

```text
 m uma-tools
```

This is the nested `uma-skill-tools` sitting on `24f0a88` while the parent
`uma-tools` still records `6ba5ca0`. It is the **required** working state and
must **not** be committed. When committing your changes, stage files explicitly
(`git add <your files>`) rather than `git add -A`, so the submodule pointer and
any throwaway tooling are left out. To return to a fully clean tree (e.g. before
a Stop hook git check), restore the submodule:

```bash
git submodule update --init --recursive --force uma-tools
```

(Note: restoring like this puts `uma-skill-tools` back on `6ba5ca0`, so re-run
Step 3 before running simulations again.)
