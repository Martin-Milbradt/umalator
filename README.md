# Umalator

Web interface for Uma Musume skill efficiency calculations. Calculates mean length gains for skills and outputs a table sorted by efficiency (mean length / cost).

Results differ from the browser version because all optional simulation options are enabled in `simOptions` (unless `deterministic` is set to `true`).

## Getting Started

```bash
# Install dependencies
npm install

# Build worker (required before running)
npm run build

# Start web server (builds frontend first)
npm run web
```

Then open `http://localhost:3000` in your browser.

For development with hot-reload:

```bash
npm run dev
```

This starts the Express backend and Vite dev server (port 5173) concurrently, with API requests proxied to the backend.

## Commands

```bash
npm run build            # Build simulation worker
npm run build:frontend   # Build frontend only
npm run web              # Build frontend + start server
npm run dev              # Development mode (Vite + Express)
npm test                 # Run all tests
npx vitest run <file>    # Run single test file
```

## Web Interface

The web interface provides:

- **Config File Management**: Select, switch, and duplicate config files
- **Skills Editor**: Edit skill availability and discounts with checkboxes and dropdowns
- **Track Editor**: Configure track parameters (location, surface, distance, ground condition, weather, season)
- **Uma Editor**: Configure uma stats, strategy, aptitudes, mood, unique skill, and active skills
- **Interactive Results**: View and sort skill results in a table with multi-select and skill points tracking
- **Auto-save**: Changes are automatically saved to the config file (500ms debounce)

## Config File Format

See `configs/config.example.json` for the config file format.

### Simulation Settings

- `deterministic`: Boolean (default: `false`)
  - `true`: deterministic simulation (seed: 0, all optional features disabled)
  - `false`: randomized simulations with all optional features enabled
- `confidenceInterval`: Confidence interval percentage for statistics (default: `95`)

All skills receive 500 simulations. Results stream to the browser in real time via Server-Sent Events.

### Skills

- Skills are specified by their **global English names** (e.g., "Right-Handed" instead of skill IDs)
- Each skill can have:
  - `discount`: Percentage discount (0-100) or `null` to exclude the skill from evaluation
  - `default`: Optional default discount value used by the web interface's reset function

### Track Settings

- `courseId`: Course ID string (can be empty string or null)
- `trackName`: Track location name (e.g., "Kyoto", "Tokyo", "Nakayama") or `<Random>` for all matching tracks
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

The results table contains the following columns:

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
