# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web interface for Uma Musume skill efficiency calculations. Calculates mean length gains for skills and outputs results sorted by efficiency (mean length / cost).

Fully client-side static site deployed to GitHub Pages. Simulations run in browser Web Workers, configs persist in IndexedDB.

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

**Static site** with vanilla TypeScript frontend (no framework). Simulations run in browser Web Workers. A legacy Express server (`server.ts`) is available via `npm run dev:server`.

### Core Files

- `simulation.worker.ts` - Simulation logic using uma-tools comparison engine (shared by Node and browser builds)
- `simulation.browser-worker.ts` - Thin Web Worker entry point for browser builds
- `cli.ts` - CLI entry point: loads data at runtime, runs `SimulationRunner`, outputs JSON
- `simulation-runner.ts` - Node worker orchestration (used by `cli.ts` and `server.ts`)
- `build.ts` - esbuild config: bundles Node worker + browser worker, fetches latest game data from upstream uma-tools, copies data files to `static/data/`
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
- `uma-skill-tools` is pinned to commit `24f0a88`, which is one commit ahead of upstream `master` (`8b3f5e2` as of 2026-05). The pin carries two changes we depend on that haven't merged upstream: the `otherHorse()` API used by `uma-tools/umalator/compare.ts`, and the move of `mood`/`popularity` from `RaceParameters` onto `HorseParameters`. The parent `uma-tools` submodule still records an older `uma-skill-tools` commit (`6ba5ca0`), so a vanilla `git submodule update --recursive` lands ~9 commits before the pin — CI and `start_web.ps1` re-checkout `24f0a88` after init for that reason. Verify locally: `git -C uma-tools/uma-skill-tools rev-parse HEAD`
- Ignore type checking errors from `./uma-tools` package. Our own files type-check cleanly; `mood` and `popularity` flow through `baseUma` (HorseParameters) end-to-end, matching the post-24f0a88 API.
- `driver.js` (npm dependency) powers the onboarding tour in `public/tour.ts`. CSS is imported in the same file (`driver.js/dist/driver.css`).

### Build Pipeline

- `npm run build` runs `tsx build.ts` which:
  1. Fetches latest `skill_data.json` and `skill_meta.json` from upstream uma-tools (falls back to local files offline)
  2. Copies 5 JSON data files from `uma-tools/umalator-global/` to `static/data/`
  3. Builds Node worker (`simulation.worker.js` in repo root)
  4. Builds browser worker (`static/simulation.browser-worker.js`)
- `npm run build:frontend` runs `vite build` which bundles `public/` into `dist/`
- `static/` is Vite's publicDir (configured in `vite.config.ts`) - files are copied as-is to `dist/`
- GitHub Pages deploy sets `VITE_BASE=/umalator/` so asset paths resolve correctly

### Static vs Runtime Data

- **Browser** uses bundled data files in `static/data/` (copied at build time). `npm run build` fetches latest game data from upstream automatically.
- **CLI** loads data from `uma-tools/umalator-global/` at runtime, so it always reflects current skill data without rebuilding.

## Key Patterns

- **Browser Web Workers**: Simulations run in parallel via `simulationRunner.ts`, concurrency = `navigator.hardwareConcurrency`
- **Flat Simulation**: 500 simulations for all skills in a single pass
- **Skill Resolution**: Skills referenced by global English names; cost > 0 for regular skills, cost 0 for unique skills. Handles ○/◎ variants automatically.
- **Auto-save**: Web UI automatically persists config changes to IndexedDB (500ms debounce)
- **Per-Combination Batching**: When random conditions (mood, weather, etc.) are enabled, simulations are batched per unique combination to preserve internal variance from `runComparison`
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
