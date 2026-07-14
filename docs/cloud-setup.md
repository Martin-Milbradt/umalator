# Setting up Umalator in a Cloud / CI environment

This guide is for running Umalator in an **ephemeral, headless Linux
environment** — Claude Code on the web, a GitHub Action, a fresh container, etc.
— where the repository is cloned fresh, `node_modules` is absent, and there is no
display. For everyday local development on your own machine, the
[README](../README.md) "Getting Started" section is enough; this doc covers the
extra steps and gotchas that bite in automation.

> TL;DR — one command does all four steps (submodule init, update, build):
>
> ```bash
> npm install      # postinstall updates the submodules if they are present
> npm run setup    # init submodules + update to upstream master + build workers
> ```
>
> `npm run setup` wraps `scripts/update-submodules.mjs`, which brings both
> submodules to upstream master. The equivalent manual steps (useful when
> something goes wrong) are below.

## Prerequisites: network access

The remote environment's network policy must allow outbound HTTPS to:

- **github.com** — to clone the `uma-tools` submodule and fetch upstream
  master for both submodules.
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

This lands the submodules on the commits the gitlinks record, which for the
nested `uma-tools/uma-skill-tools` is **not** a commit we can run (the parent
`uma-tools` records a stale gitlink, behind its own code's requirements). Do
not skip Step 3.

## Step 3 — Update both submodules to upstream master (the easy-to-miss step)

> `node scripts/update-submodules.mjs` (run for you by `postinstall` and
> `npm run setup`) does exactly this step, idempotently. The manual commands
> below are the fallback when you need to do it by hand.

We always run the tip of **upstream master** for both `uma-tools` (game data,
UI components) and the nested `uma-skill-tools` (simulation engine). Nothing
is pinned: silently running an outdated version is worse than a loud failure
from an upstream change, so CI and the deploy float to master too and
breakage surfaces in their typecheck/test gates. Everything umalator needs
beyond the engine itself (per-uma mood/popularity handling, the other-uma
wisdom for skill activation, unique level scaling, over-1200 mechanics
gating) lives in our vendored `shared/compare.ts`, so plain master is
sufficient:

```bash
git -C uma-tools fetch origin master
git -C uma-tools checkout --detach FETCH_HEAD
git -C uma-tools/uma-skill-tools fetch origin master
git -C uma-tools/uma-skill-tools checkout --detach FETCH_HEAD
```

This is exactly what CI, `.github/workflows/deploy.yml` and `start_web.ps1`
do after submodule init. See [Cleanup](#cleanup-expected-git-noise) below for
the `git status` noise this leaves.

### Symptom if you skip Step 3

With the nested submodule stuck on the recorded gitlink, `npm run build` /
`vite` still transpile (esbuild and `tsx` do not type-check), but
`npx tsc --noEmit` reports type errors where `shared/compare.ts` uses newer
builder APIs (e.g. `otherRawWisdom`), and simulations can fail at runtime for
the same reason.

## Step 4 — Build the workers and copy data

```bash
npm run build
```

`tsx build.ts` builds the Node worker (`simulation.worker.js`) and the browser
worker (`static/simulation.browser-worker.js`) and copies the checked-out
submodule's JSON data files into `static/data/`. Run this **before**
`npm test`, `npx vite`, or the CLI (the worker integration tests spawn the
built worker). To refresh the game data, re-run
`node scripts/update-submodules.mjs` and rebuild. Deploys update to upstream
master themselves, so no gitlink commit is needed to ship new data;
committing the pointer just keeps the recorded baseline current.

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

After Step 3, `git status` may show:

```text
 M uma-tools
```

This is the `uma-tools` checkout sitting ahead of the gitlink the last commit
records. (The nested `uma-skill-tools` sitting ahead of *its* recorded
gitlink is hidden by `ignore = dirty` in `.gitmodules`.) Committing the
pointer bump (`git add uma-tools`) is fine and keeps the recorded baseline
current, but it ships nothing by itself: CI and deploys update to upstream
master on their own. When committing unrelated changes, stage files
explicitly (`git add <your files>`) rather than `git add -A`, so the pointer
bump stays a deliberate act. To return to the recorded state:

```bash
git submodule update --init --recursive --force uma-tools
```

(Note: this puts the nested `uma-skill-tools` back on the stale recorded
gitlink, so re-run Step 3 before running simulations again.)
