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

The `--recursive` flag is required to clone the [uma-tools](https://github.com/alpha123/uma-tools) submodule (and its nested `uma-skill-tools` submodule). If you already cloned without it:

```bash
git submodule update --init --recursive
```

## Commands

```bash
npm run dev              # Build worker + Vite dev server (port 5173)
npm run dev:server       # Express backend + Vite dev server (for server-side mode)
npm run build            # Build simulation workers
npm run build:frontend   # Build frontend only
npm run preview          # Full production build + preview
npm test                 # Run all tests
npx vitest run <file>    # Run single test file
```

## Architecture

Fully client-side static site. Simulations run in browser Web Workers, configs persist in IndexedDB. Deployed to GitHub Pages via GitHub Actions.

A legacy Express server (`server.ts`) is available for local server-side mode via `npm run dev:server`.

### Core Files

| File | Purpose |
| --- | --- |
| `simulation.worker.ts` | Simulation logic using uma-tools comparison engine |
| `simulation.browser-worker.ts` | Thin Web Worker entry point for browser builds |
| `simulation-runner.ts` | Server-side worker orchestration (legacy) |
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
| `index.html` | Tailwind CSS dark theme UI |

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

## Config File Format

See `configs/config.example.json` for the config file format.

### Simulation Settings

- `deterministic`: Boolean (default: `false`)
  - `true`: deterministic simulation (seed: 0, all optional features disabled)
  - `false`: randomized simulations with all optional features enabled
- `confidenceInterval`: Confidence interval percentage for statistics (default: `95`)

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
| CI | Confidence interval bounds (e.g., "95% CI") |

Results are sorted by Mean/Cost in descending order.

### Notes

- Undiscounted skill costs are read from `skill_meta.json`
- If a skill isn't in `skill_meta.json`, the default cost is 200 skillpoints
- Discounts are specified as percentages (e.g., `discount: 10` means 10% off)
- When `<Random>` conditions are enabled (mood, weather, season, ground condition), simulations are batched per unique combination using weighted probabilities
