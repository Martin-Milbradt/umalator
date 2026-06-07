# Umalator

Web interface for Uma Musume skill efficiency calculations. Calculates mean length gains for skills and outputs a table sorted by efficiency (mean length / cost).

**Live version**: <https://martin-milbradt.github.io/umalator/>

## Getting Started

```bash
git clone --recursive https://github.com/Martin-Milbradt/umalator.git
cd umalator
npm install
npm run dev     # Build worker + start Vite dev server
```

Then open `http://localhost:5173` in your browser.

The `--recursive` flag is required to clone the [uma-tools](https://github.com/alpha123/uma-tools) submodule (and its nested `uma-skill-tools` submodule). `npm install` then runs a `postinstall` step that pins `uma-skill-tools` to the exact commit the app depends on (one commit ahead of upstream; the parent submodule records an older one, so a plain checkout gets it wrong).

If you cloned without `--recursive`, or are setting up in CI or a fresh container, run the one-shot bootstrap instead of the manual submodule dance:

```bash
npm run setup   # init submodules + pin uma-skill-tools + build workers
```

See [docs/cloud-setup.md](docs/cloud-setup.md) for the full Cloud/CI walkthrough (network requirements, headless UI verification, expected `git status` noise).

## Commands

```bash
npm run dev              # Build worker + Vite dev server (port 5173)
npm run build            # Build simulation workers
npm run build:frontend   # Build frontend only
npm run preview          # Full production build + preview
npm run typecheck        # Type-check (ignores expected uma-tools errors)
npm test                 # Run all tests
npm run test:coverage    # Run tests with coverage
npx vitest run <file>    # Run single test file
npm run race-check       # Compare skills across races (see Race Check below)
npx tsx cli.ts <config>.json [--skills "A,B"] [--seed N]  # CLI run
```

## Architecture

Fully client-side static site. Simulations run in browser Web Workers, configs persist in IndexedDB. Deployed to GitHub Pages via GitHub Actions.

The Node orchestration (`simulation-runner.ts`) and the browser orchestration (`public/simulationRunner.ts`) share one runtime-neutral core, `shared/simulation-orchestrator.ts`; each runner only supplies its worker transport.

### Core Files

| File | Purpose |
| --- | --- |
| `simulation.worker.ts` | Simulation logic using uma-tools comparison engine |
| `simulation.browser-worker.ts` | Thin Web Worker entry point for browser builds |
| `simulation-runner.ts` | Node worker transport for the CLI and tests |
| `shared/simulation-orchestrator.ts` | Shared simulation orchestration (Node + browser) |
| `build.ts` | esbuild config: bundles Node + browser workers, copies data files |
| `utils.ts` | Pure utility functions for parsing, formatting, statistics |
| `types.ts` | Shared type definitions |

### Frontend (`public/`)

| File | Purpose |
| --- | --- |
| `app.ts` | Main entry point, data loading, event handlers |
| `simulationRunner.ts` | Browser Web Worker orchestration |
| `configStore.ts` | IndexedDB CRUD for configs |
| `configManager.ts` | Config loading, auto-save, UI sync |
| `api.ts` | Simulation API (creates runner, handles progress) |
| `tour.ts` | Interactive onboarding tour (driver.js) |
| `index.html` | Tailwind CSS dark theme UI |
| `help.html` | Standalone help/docs page (second Vite entry) |

### Data Files

Static JSON files from uma-tools, copied to `static/data/` at build time and served by Vite:

- `skill_meta.json` - Skill metadata (cost, group ID)
- `skillnames.json` - Skill name mappings (ID to names)
- `skill_data.json` - Skill conditions and effects
- `course_data.json` - Course definitions
- `tracknames.json` - Track name mappings

## Web Interface

- **Config Management**: Create, duplicate, export, and import config files (stored in IndexedDB)
- **Skills Editor**: Edit skill availability and discounts
- **Track Editor**: Configure track parameters (location, surface, distance, ground condition, weather, season)
- **Uma Editor**: Configure uma stats, strategy, aptitudes, mood, and active skills
- **Interactive Results**: Sort, multi-select, and track skill points in the results table
- **Auto-save**: Changes persist automatically (500ms debounce)
- **Help dropdown**: Opens an in-app docs page (`/help.html`), runs an interactive tour over the live UI (auto-launches once on first visit), links to GitHub Issues for bug reports, and to the [Discord server](https://discord.gg/DvXMyg8J) for questions

## Race Check

CLI tool to compare skill effectiveness across multiple races. Runs simulations for each race and outputs a markdown table of mean length gains.

```bash
# Default run (uses race-check.default.json for skills, uma stats, and races file)
npx tsx race-check.ts

# Override skills (format: "SkillName:Strategy", strategy defaults to End Closer)
npx tsx race-check.ts --skills "Straightaway Spurt:End Closer,Angling and Scheming:Front Runner"

# Custom races file
npx tsx race-check.ts --races path/to/races.json

# One-off check for a single race
npx tsx race-check.ts --track Kyoto --distance 3200 --surface Turf --skills "Straightaway Spurt:End Closer"

# Override uma stats from an existing config
npx tsx race-check.ts --config Pisc_GS.json

# Control simulation count (default: 100)
npx tsx race-check.ts --sims 200

# JSON output
npx tsx race-check.ts --json
```

The races file uses the MML format: an array of objects with `raceName`, `turn` (MM_HH), `location` (with ⇐/⇒ prefix), `type` (Turf/Dirt), and `lengthM` (e.g. "1600 m"). Season is derived from the turn's month. Ground condition defaults to Firm, weather to Sunny.

Results are written to `race-check-results.md` on each run.

## Config File Format

See `configs/config.example.json` for the config file format.

### Simulation Settings

- `seed`: Fixed RNG seed for reproducible runs. Omit or `null` for a fresh
  random seed each run (the default). Set a number and the same config produces
  identical results every run. Also settable in the web UI (the seed box) and on
  the CLI (`--seed N`).
- `deterministic`: Boolean (default: `false`). Legacy flag; equivalent to
  `seed: 0`. Prefer `seed`.
- `confidenceInterval`: Confidence level percentage for the statistics
  intervals (default: `95`).

All skills receive 500 simulations.

### Skills

- Skills are specified by their **global English names** (e.g., "Right-Handed" instead of skill IDs)
- Each skill can have:
  - `discount`: Percentage discount (0-100) or `null` to exclude the skill from evaluation
  - `default`: Optional default discount value used by the reset function

### Track Settings

- `courseId`: Course ID string (can be empty string or null)
- `trackName`: Track location name (e.g., "Kyoto", "Tokyo") or `<Random>` for all matching tracks
- `distance`: Race distance in meters (e.g., 3000) or a distance category (`<Sprint>`, `<Mile>`, `<Medium>`, `<Long>`)
- `surface`: "Turf" or "Dirt"
- `groundCondition`: "Firm", "Good", "Soft", "Heavy", or `<Random>`
- `weather`: "Sunny", "Cloudy", "Rainy", "Snowy", or `<Random>`
- `season`: "Spring", "Summer", "Fall", "Winter", "Sakura", or `<Random>`
- `numUmas`: Number of uma in the race

### Uma Configuration

- `speed`, `stamina`, `power`, `guts`, `wisdom`: Stat values (numbers)
- `strategy`: "Runaway", "Front Runner", "Pace Chaser", "Late Surger", or "End Closer"
- `distanceAptitude`, `surfaceAptitude`, `styleAptitude`: Aptitude grades ("S", "A", "B", "C", "D", "E", "F", "G")
- `mood`: Mood value (number), or `null` for random mood
- `skills`: Array of skill names active during simulations
  - When multiple skills share the same name, the one with cost > 0 (skillpoints) is preferred
- `unique`: Single unique skill name (exactly one skill)
  - Must be a skill with cost 0 (unique skills)
  - When multiple skills share the same name, the one with cost 0 is preferred

### Output

| Column | Description |
| --- | --- |
| Skill | Skill name |
| Cost | Skill cost (with discounts applied) |
| Discount | Discount percentage applied (or "-" if none) |
| Mean | Mean length gain from simulations |
| Median | Median length gain from simulations |
| Mean/Cost | Efficiency ratio (mean length / cost, x1000) |
| Min-Max | Minimum and maximum length gains |
| Range (`ciLower`/`ciUpper`) | Outcome spread: the central percentile band of per-race gains (e.g. 2.5–97.5% at 95%). How much the result swings race to race. |
| Mean CI (`ciMeanLower`/`ciMeanUpper`) | Bootstrap (non-parametric) confidence interval of the mean gain: how precisely the average is estimated. Distribution-free, so it suits the zero-inflated, bimodal gain distributions these skills produce. |

Results are sorted by Mean/Cost in descending order.

### Notes

- Undiscounted skill costs are read from `skill_meta.json`
- If a skill isn't in `skill_meta.json`, the default cost is 200 skillpoints
- Discounts are specified as percentages (e.g., `discount: 10` means 10% off)
- When `<Random>` conditions are enabled (mood, weather, season, ground condition), simulations are batched per unique combination using weighted probabilities
