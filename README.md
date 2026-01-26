# umalator-global-cli

Web interface for evaluating skills in umalator-global. It calculates mean length gains for skills and outputs a table sorted by efficiency (mean length / cost).

Note: The results are different from the browser version, as all optional options are turned on in `simOptions` (unless `deterministic` is set to `true`).

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

## Usage

### Web Interface

```bash
# Build the worker first
npm run build

# Start the web server
npm run web
```

Then open your browser and navigate to `http://localhost:3000`.

The web interface provides:

- **Config File Management**: Select and switch between config files (excluding `config.example.json`)
- **Skills Editor**: Edit skill availability and discounts with checkboxes and dropdowns
- **Track Editor**: Configure all track parameters (location, surface, distance, ground condition, weather, season, etc.)
- **Uma Editor**: Configure uma stats, strategy, aptitudes, mood, unique skill, and active skills
- **Interactive Results**: View and sort skill results in a table with multi-select and skill points tracking
- **Auto-save**: Changes are automatically saved to the config file

### Config File Format

See `configs/config.example.json` for the config file format.

#### Simulation Settings

- `deterministic`: Boolean (default: `false`)
  - When `true`, uses deterministic simulation options (seed: 0, all optional features disabled)
  - When `false`, uses randomized simulations with all optional features enabled
- `confidenceInterval`: Confidence interval percentage for statistics (default: `95`)

The tool uses a tiered simulation approach:

1. 100 simulations for all skills
2. 100 additional simulations for the top half (by Mean/Cost)
3. 100 additional simulations for the top 10
4. 100 additional simulations for the top 25%
5. 100 additional simulations for the top 5

This ensures more accurate results for the most promising skills while still evaluating all skills.

#### Skills

- Skills are specified by their **global English names** (e.g., "Right-Handed ◎" instead of skill IDs)
- Each skill can have:
  - `discount`: Percentage discount (0-100) or `null` to exclude the skill from evaluation
  - `default`: Optional default discount value used by the web interface's reset function

#### Track Settings

- `courseId`: Course ID string (can be empty string or null)
- `trackName`: Track location name (e.g., "Kyoto", "Tokyo", "Nakayama")
- `distance`: Race distance in meters (e.g., 3000)
- `surface`: "Turf" or "Dirt"
- `groundCondition`: "Firm", "Good", "Soft", or "Heavy"
- `weather`: "Sunny", "Cloudy", "Rainy", or "Snowy"
- `season`: "Spring", "Summer", "Fall", "Winter", or "Sakura"
- `numUmas`: Number of uma in the race

#### Uma Configuration

- `speed`, `stamina`, `power`, `guts`, `wisdom`: Stat values (numbers)
- `strategy`: "Runaway", "Front Runner", "Pace Chaser", "Late Surger", or "End Closer"
- `distanceAptitude`, `surfaceAptitude`, `styleAptitude`: Aptitude grades ("S", "A", "B", "C", "D", "E", "F", "G")
- `mood`: Mood value (number, can be `null`)
- `skills`: Array of skill names (not IDs) that are active during simulations
  - When multiple skills share the same name, the one with a cost > 0 (skillpoints) is preferred
- `unique`: Single unique skill name (exactly one skill)
  - Must be a skill with cost 0 (unique skills)
  - When multiple skills share the same name, the one with cost 0 is preferred

#### Skill Name Resolution

- All skill references use **global English names** (e.g., "Right-Handed ◎")
- When multiple skills share the same name:
  - For `skills` array and top-level `skills` config: prefer skills with cost > 0 (skillpoints)
  - For `uma.unique`: prefer skills with cost 0 (unique skills)

### Output

The tool outputs a table with the following columns:

- **Skill**: Skill name
- **Cost**: Skill cost (with discounts applied)
- **Discount**: Discount percentage applied (or "-" if no discount)
- **Sims**: Number of simulations run for this skill
- **Mean**: Mean length gain from simulations
- **Median**: Median length gain from simulations
- **Mean/Cost**: Efficiency ratio (mean length / cost, multiplied by 1000 for display)
- **Min-Max**: Minimum and maximum length gains
- **CI Lower-Upper**: Confidence interval bounds (e.g., "95% CI")

Results are sorted by Mean/Cost in descending order.

### Notes

- Undiscounted skill costs are read from `skill_meta.json`
- If a skill isn't specified in `skill_meta.json`, the default cost is 200 skillpoints
- Discounts are specified as percentages (e.g., `discount: 10` means 10% off)
- Simulations use a tiered approach: all skills get 100 simulations, then top performers get additional simulations for more accurate results
- When `deterministic` is `false`, simulations use randomized seeds and all optional simulation features are enabled
- When `deterministic` is `true`, simulations use a fixed seed (0) and all optional features are disabled for reproducible results
