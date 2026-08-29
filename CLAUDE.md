# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web interface for Uma Musume skill efficiency calculations. Calculates mean length gains for skills and outputs results sorted by efficiency (mean length / cost).

Fully client-side static site deployed to GitHub Pages. Simulations run in browser Web Workers, configs persist in IndexedDB.

## Environment Setup

Running in an ephemeral Cloud / CI container (Claude Code on the web, GitHub
Actions, fresh clone) has gotchas that the README "Getting Started" glosses over
— `node_modules` is absent, submodules need init, and both submodules must
then be updated to upstream master because the parent `uma-tools` records a
stale nested gitlink. See
**[docs/cloud-setup.md](docs/cloud-setup.md)** for the full step-by-step
(install → submodule init → update to master → build), plus how to drive a
headless browser for UI verification and which `git status` noise is expected.

## Commands

```bash
# Build workers (required before running)
npm run build

# Development mode (Vite dev server on port 5173)
npm run dev

# Full production build + preview
npm run preview

# Build frontend only
npm run build:frontend

# Type check
npx tsc --noEmit

# Run tests
npm test
# Run single test file
npx vitest run utils.test.ts

# CLI: run simulation with a config (outputs JSON)
npx tsx cli.ts Pisc_GS.json
# CLI: filter specific skills
npx tsx cli.ts Pisc_GS.json --skills "Skill Name,Another Skill"

# Race check: compare skills across races (uses race-check.default.json)
npx tsx race-check.ts
# Race check: one-off
npx tsx race-check.ts --track Kyoto --distance 3200 --skills "Straightaway Spurt:End Closer"
# Race check: custom races file, override sims count
npx tsx race-check.ts --races path/to/races.json --sims 200
```

## Architecture

**Static site** with vanilla TypeScript frontend (no framework). Simulations run in browser Web Workers.

### Core Files

- `simulation.worker.ts` - Simulation logic using uma-tools comparison engine (shared by Node and browser builds)
- `simulation.browser-worker.ts` - Thin Web Worker entry point for browser builds
- `shared/simulation-orchestrator.ts` - Runtime-neutral orchestration (config validation, course resolution, skill filtering, seeding, stats) shared by the Node and browser runners
- `cli.ts` - CLI entry point: loads data at runtime, runs `SimulationRunner`, outputs JSON; supports `--seed`
- `simulation-runner.ts` - Node worker transport over the shared orchestrator (used by `cli.ts`, `race-check.ts`, tests)
- `build.ts` - esbuild config: bundles Node worker + browser worker, copies data files from the checked-out submodule to `static/data/`
- `utils.ts` - Pure utility functions for parsing, formatting, statistics, and skill resolution
- `types.ts` - Shared type definitions (worker messages, simulation tasks, skill metadata)

### Frontend (`public/`)

- `app.ts` - Main entry point: data loading, event handlers, config management UI, Help dropdown wiring
- `simulationRunner.ts` - Browser Web Worker orchestration (parallel simulation via `navigator.hardwareConcurrency`)
- `configStore.ts` - IndexedDB CRUD for config persistence
- `configManager.ts` - Config loading, auto-save (500ms debounce), UI sync
- `devConfigSync.ts` - Dev-only bidirectional sync between `configs/` directory and IndexedDB
- `api.ts` - Creates `BrowserSimulationRunner`, handles progress callbacks
- `tour.ts` - Interactive onboarding tour (driver.js); `startTour()` is called from the Help dropdown, `maybeAutoStartTour()` runs once on first visit gated by `localStorage["umalator:tour-seen"]`
- `index.html` - Tailwind CSS dark theme UI; top bar includes Configs and Help dropdowns
- `help.html` - Standalone docs page; second Vite entry (configured in `vite.config.ts`), linked from Help → About / Documentation

### Configuration

- Configs stored in IndexedDB (per-browser, not synced across devices)
- In dev mode, configs sync bidirectionally with the `configs/` directory via a Vite plugin (`vite-plugin-config-sync.ts`)
- Export/import buttons for config portability (JSON files)
- Each config defines `skills`, `track`, and `uma` settings
- See `configs/config.example.json` for format reference
- Special values: `<Random>` for location/weather/season/condition, `<Sprint>/<Mile>/<Medium>/<Long>` for distance categories

### External Dependencies

- `./uma-tools` is a git submodule (clone with `--recursive`)
- `./uma-tools/uma-skill-tools/` is derived from <https://github.com/alpha123/uma-skill-tools> - understanding this code helps when working on simulation logic, but **never modify it**; pull latest from upstream instead
- Both submodules always run upstream `master`; nothing is pinned (silently running an outdated version is worse than a loud failure from an upstream change). `scripts/update-submodules.mjs` fetches and checks out `origin/master` for `uma-tools` and the nested `uma-skill-tools` — run by `postinstall`, CI, the deploy, `start_web.ps1`, and the `post-merge` hook in `.githooks/` (wired via `scripts/install-git-hooks.mjs` on `postinstall`), so a plain `git pull` also refreshes the checkout. The nightly deploy pushes a `chore(data)` gitlink bump whenever upstream advanced and the gates pass, so the committed baseline stays current without manual bumps. A vanilla `git submodule update --recursive` is never sufficient: the parent `uma-tools` records a stale `uma-skill-tools` gitlink. Full setup walkthrough in [docs/cloud-setup.md](docs/cloud-setup.md).
- `shared/compare.ts` is our vendored, master-API adaptation of `uma-tools/umalator/compare.ts` (which requires unpublished engine changes and cannot run against any public `uma-skill-tools` commit). It carries the per-uma mood/popularity handling, the other-uma wisdom for skill activation, unique-skill level scaling, and the over-1200 mechanics gating (Asiwotameru on everywhere, StaminaSyoubu JP-only). When pulling a newer `uma-tools`, diff its `umalator/compare.ts` against ours and port behavior changes.
- Ignore type checking errors from `./uma-tools` package. Our own files (including `shared/compare.ts`) type-check cleanly; mood and popularity are per-uma and applied per-builder in `shared/compare.ts`.
- `driver.js` (npm dependency) powers the onboarding tour in `public/tour.ts`. CSS is imported in the same file (`driver.js/dist/driver.css`).

### Build Pipeline

- `npm run build` runs `tsx build.ts` which:
  1. Copies 5 JSON data files from `uma-tools/umalator-global/` to `static/data/`
  2. Builds Node worker (`simulation.worker.js` in repo root)
  3. Builds browser worker (`static/simulation.browser-worker.js`)
  - Game data comes from the checked-out submodule, which local dev (`start_web.ps1`), CI, and the deploy all update to upstream master first (`scripts/update-submodules.mjs`), so every deploy ships the latest data. The committed gitlink is only a recorded baseline.
- `npm run build:frontend` runs `vite build` which bundles `public/` into `dist/`
- `static/` is Vite's publicDir (configured in `vite.config.ts`) - files are copied as-is to `dist/`
- GitHub Pages deploy sets `VITE_BASE=/umalator/` so asset paths resolve correctly
- CI: `.github/workflows/ci.yml` runs `typecheck` + `build` + `test` on pushes/PRs; `deploy.yml` runs the same gates before publishing to Pages
- `deploy.yml` also runs nightly (04:17 UTC) and on `workflow_dispatch`. Since the build checks out upstream master, that timer is what keeps the site's game data current between pushes

### Static vs Runtime Data

- **Browser** uses bundled data files in `static/data/` (copied from the submodule at build time).
- **CLI** loads data from `uma-tools/umalator-global/` at runtime, so it reflects whatever the submodule currently has.

## Key Patterns

- **Browser Web Workers**: Simulations run in parallel via `simulationRunner.ts`, concurrency = `navigator.hardwareConcurrency`
- **Flat Simulation**: 500 simulations for all skills in a single pass
- **Skill Resolution**: Skills referenced by global English names; cost > 0 for regular skills, cost 0 for unique skills. Handles ○/◎ variants automatically.
- **Auto-save**: Web UI automatically persists config changes to IndexedDB (500ms debounce)
- **Per-Combination Batching**: When random conditions (mood, weather, etc.) are enabled, simulations are batched per unique combination to preserve internal variance from `runComparison`
- **Owned rows** (`SkillResult.owned`, gated by `filters.calcOwned`, default on): skills already on the uma are simulated as uma-without vs uma-with and reported negated — mean = the loss from removing, cost = the refunded SP — so mean/cost stays positive and sorts against buy rows. Each owned skill gets a removal row plus downgrade rows per lower tier; the unique gets a disable/re-enable row (`uma.uniqueDisabled`) without cost columns.
- **Limit changes to uma-tools**: Use the already-implemented tools in this repository. Avoid modifying the uma-tools submodule or its nested uma-skill-tools.

## Implementation Guidance

When fixing an issue or writing a new feature that doesn't have any tests yet, implement at least one.

### Testing and Verification

- `utils.test.ts` - Unit tests for pure functions from `utils.ts`
- `simulation-runner.test.ts` - Integration tests for worker thread simulations
- Run a single test file: `npx vitest run <filename>`
- Use the CLI to verify simulation changes work end-to-end: `npx tsx cli.ts <config>.json`
- The CLI loads data from `uma-tools/umalator-global/` at runtime (no bundled data), so it always uses current skill data

### Simulation Variance

The `runComparison` function from uma-tools generates variance through:

1. **Skill trigger position sampling** - Pre-generates N different trigger positions
2. **RNG state advancement** - Each simulation advances internal RNG
3. **Wisdom checks** - Random activation probability

`runComparison` signature: `(nsamples, course, racedef, uma1, uma2, seed: [number, number], options)`. The seed is a `[lo, hi]` tuple passed as the 6th argument. Always use `nsamples > 1` to preserve internal variance.
