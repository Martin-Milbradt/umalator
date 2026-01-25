# GitHub Copilot Instructions

This file provides guidance to GitHub Copilot when working with code in this repository.

## Project Overview

CLI tool and web interface for evaluating skills in umalator-global. Calculates mean length gains for skills and outputs results sorted by efficiency (mean length / cost).

## Commands

```bash
# Build CLI (required before running)
npm run build

# Run CLI with default config
npm start
# Run CLI with specific config
node cli.js myconfig.json

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

**Dual-stack application** with CLI and web interfaces sharing the same simulation engine.

### Core Files

- `cli.ts` - CLI entry point using Commander.js, spawns Worker threads for parallel simulations
- `utils.ts` - Pure utility functions for parsing, formatting, statistics, and skill resolution
- `server.ts` - Express server (port 3000) serving the web UI and REST API endpoints
- `simulation.worker.ts` - Worker thread that runs skill simulations using `uma-tools` comparison engine
- `build.ts` - esbuild configuration for bundling CLI and worker

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
- **Tiered Simulation**: 100 sims for all skills → 100 more for top half → 100 for top 10 → 100 for top 25% → 100 for top 5
- **Skill Resolution**: Skills referenced by global English names; cost > 0 for regular skills, cost 0 for unique skills. Handles ○/◎ variants automatically.
- **Auto-save**: Web UI automatically persists config changes to disk (500ms debounce)
- **SSE Streaming**: Web UI receives simulation output via Server-Sent Events at `/api/run`

## Implementation Guidance

When fixing an issue or writing a new feature that doesn't have any tests yet, implement at least one.

### Testing

Tests in `utils.test.ts` cover pure functions from `utils.ts`.
