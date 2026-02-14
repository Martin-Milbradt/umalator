# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web interface for Uma Musume skill efficiency calculations. Calculates mean length gains for skills and outputs results sorted by efficiency (mean length / cost).

## Commands

```bash
# Build worker (required before running)
npm run build

# Start web server (builds frontend first)
npm run web

# Development mode (Vite dev server + Express concurrently)
npm run dev

# Build frontend only
npm run build:frontend

# Run tests
npm test
# Run single test file
npx vitest run utils.test.ts
```

## Architecture

**Web application** with Express backend and vanilla TypeScript frontend sharing the same simulation engine.

### Core Files

- `utils.ts` - Pure utility functions for parsing, formatting, statistics, and skill resolution
- `server.ts` - Express server (port 3000) serving the web UI and REST API endpoints
- `simulation.worker.ts` - Worker thread that runs skill simulations using `uma-tools` comparison engine
- `simulation-runner.ts` - Orchestrates parallel simulations across worker threads
- `build.ts` - esbuild configuration for bundling the worker
- `types.ts` - Shared type definitions (worker messages, simulation tasks, skill metadata)

### Frontend (public/)

- `app.ts` - Vanilla TypeScript frontend (no framework), handles config editing and real-time output streaming
- `index.html` - Tailwind CSS dark theme UI
- Dev server runs on port 5173 with API proxy to Express backend

### Configuration

- Config files stored in `configs/` directory as JSON
- Each config defines `skills`, `track`, and `uma` settings
- See `configs/config.example.json` for format reference
- Special values: `<Random>` for location/weather/season/condition, `<Sprint>/<Mile>/<Medium>/<Long>` for distance categories

### External Dependencies

- Imports from `../uma-tools` package for simulation logic
- `../uma-tools/uma-skill-tools/` is derived from <https://github.com/alpha123/uma-skill-tools> - understanding this code helps when working on simulation logic, but **never modify it**; pull latest from upstream instead
- Ignore type checking errors from `../uma-tools` package

## Key Patterns

- **Worker Threads**: Simulations run in parallel via `simulation.worker.ts`, concurrency = min(skills, CPU cores)
- **Flat Simulation**: 500 simulations for all skills in a single pass
- **Skill Resolution**: Skills referenced by global English names; cost > 0 for regular skills, cost 0 for unique skills. Handles ○/◎ variants automatically.
- **Auto-save**: Web UI automatically persists config changes to disk (500ms debounce)
- **SSE Streaming**: Web UI receives simulation output via Server-Sent Events at `/api/simulate`
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

When calling `runComparison`, always use `nsamples > 1` to preserve internal variance. Calling with `nsamples=1` eliminates variance from trigger sampling and RNG.
