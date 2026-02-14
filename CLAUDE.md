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

# Run tests
npm test
# Run single test file
npx vitest run utils.test.ts
```

## Architecture

**Static site** with vanilla TypeScript frontend (no framework). Simulations run in browser Web Workers. A legacy Express server (`server.ts`) is available via `npm run dev:server`.

### Core Files

- `simulation.worker.ts` - Simulation logic using uma-tools comparison engine (shared by Node and browser builds)
- `simulation.browser-worker.ts` - Thin Web Worker entry point for browser builds
- `simulation-runner.ts` - Server-side worker orchestration (legacy, used by `server.ts`)
- `build.ts` - esbuild config: bundles Node worker + browser worker, copies data files to `static/data/`
- `utils.ts` - Pure utility functions for parsing, formatting, statistics, and skill resolution
- `types.ts` - Shared type definitions (worker messages, simulation tasks, skill metadata)

### Frontend (`public/`)

- `app.ts` - Main entry point: data loading, event handlers, config management UI
- `simulationRunner.ts` - Browser Web Worker orchestration (parallel simulation via `navigator.hardwareConcurrency`)
- `configStore.ts` - IndexedDB CRUD for config persistence
- `configManager.ts` - Config loading, auto-save (500ms debounce), UI sync
- `api.ts` - Creates `BrowserSimulationRunner`, handles progress callbacks
- `index.html` - Tailwind CSS dark theme UI

### Configuration

- Configs stored in IndexedDB (per-browser, not synced across devices)
- Export/import buttons for config portability (JSON files)
- Each config defines `skills`, `track`, and `uma` settings
- See `configs/config.example.json` for format reference
- Special values: `<Random>` for location/weather/season/condition, `<Sprint>/<Mile>/<Medium>/<Long>` for distance categories

### External Dependencies

- `./uma-tools` is a git submodule (clone with `--recursive`)
- `./uma-tools/uma-skill-tools/` is derived from <https://github.com/alpha123/uma-skill-tools> - understanding this code helps when working on simulation logic, but **never modify it**; pull latest from upstream instead
- Ignore type checking errors from `./uma-tools` package

### Build Pipeline

- `npm run build` runs `tsx build.ts` which:
  1. Copies 5 JSON data files from `uma-tools/umalator-global/` to `static/data/`
  2. Builds Node worker (`simulation.worker.js` in repo root)
  3. Builds browser worker (`static/simulation.browser-worker.js`)
- `npm run build:frontend` runs `vite build` which bundles `public/` into `dist/`
- `static/` is Vite's publicDir - files are copied as-is to `dist/`
- GitHub Pages deploy sets `VITE_BASE=/umalator/` so asset paths resolve correctly

## Key Patterns

- **Browser Web Workers**: Simulations run in parallel via `simulationRunner.ts`, concurrency = `navigator.hardwareConcurrency`
- **Flat Simulation**: 500 simulations for all skills in a single pass
- **Skill Resolution**: Skills referenced by global English names; cost > 0 for regular skills, cost 0 for unique skills. Handles ○/◎ variants automatically.
- **Auto-save**: Web UI automatically persists config changes to IndexedDB (500ms debounce)
- **Per-Combination Batching**: When random conditions (mood, weather, etc.) are enabled, simulations are batched per unique combination to preserve internal variance from `runComparison`

## Implementation Guidance

When fixing an issue or writing a new feature that doesn't have any tests yet, implement at least one.

### Testing

- `utils.test.ts` - Unit tests for pure functions from `utils.ts`
- `simulation-runner.test.ts` - Integration tests for worker thread simulations

Run a single test file: `npx vitest run <filename>`

### Simulation Variance

The `runComparison` function from uma-tools generates variance through:

1. **Skill trigger position sampling** - Pre-generates N different trigger positions
2. **RNG state advancement** - Each simulation advances internal RNG
3. **Wisdom checks** - Random activation probability

`runComparison` signature: `(nsamples, course, racedef, uma1, uma2, seed: [number, number], options)`. The seed is a `[lo, hi]` tuple passed as the 6th argument. Always use `nsamples > 1` to preserve internal variance.
