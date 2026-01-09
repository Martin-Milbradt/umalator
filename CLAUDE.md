# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
```

## Architecture

**Dual-stack application** with CLI and web interfaces sharing the same simulation engine.

### Core Files

- `cli.ts` - CLI entry point using Commander.js, spawns Worker threads for parallel simulations
- `server.ts` - Express server serving the web UI and REST API endpoints
- `simulation.worker.ts` - Worker thread that runs skill simulations using `uma-tools` comparison engine
- `build.ts` - esbuild configuration for bundling CLI and worker

### Frontend (public/)

- `app.ts` - Vanilla TypeScript frontend (no framework), handles config editing and real-time output streaming
- `index.html` - Tailwind CSS dark theme UI

### Configuration

- Config files stored in `configs/` directory as JSON
- Each config defines `skills`, `track`, and `uma` settings
- See `configs/config.example.json` for format reference

### External Dependencies

- Imports from parent directory's `uma-tools` package for simulation logic
- TypeScript config extends from `../uma-tools/tsconfig.json`

## Key Patterns

- **Worker Threads**: Simulations run in parallel via `simulation.worker.ts`
- **Tiered Simulation**: 100 sims for all skills, additional rounds for top performers
- **Skill Resolution**: Skills referenced by global English names; cost > 0 for regular skills, cost 0 for unique skills
- **Auto-save**: Web UI automatically persists config changes to disk

## Scope Guidance

Focus on files within this directory. Don't change any files in the `uma-tools` parent directory.
