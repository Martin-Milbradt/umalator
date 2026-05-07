# Check Submodule Updates

Check whether the `uma-tools` and `uma-skill-tools` git submodules can be updated, whether updates would break existing functionality, and whether new upstream features could benefit umalator.

## Context

umalator depends on two nested git submodules:

- **`uma-tools/`** (remote: `https://github.com/alpha123/uma-tools.git`) contains the simulation engine, data files, and type definitions
- **`uma-tools/uma-skill-tools/`** (remote: `https://github.com/alpha123/uma-skill-tools`) contains the race simulation core. Pinned to commit `24f0a88`, one commit ahead of upstream `master`. The pin carries two unmerged changes we depend on: the `otherHorse()` API used by `uma-tools/umalator/compare.ts`, and the move of `mood`/`popularity` from `RaceParameters` onto `HorseParameters`. Note that the `uma-tools` parent records an older `uma-skill-tools` commit (`6ba5ca0`); `start_web.ps1` and CI re-checkout `24f0a88` after `submodule update`.

### What umalator imports from these submodules

**From `uma-tools/uma-skill-tools/`:**

- `Mood` type from `RaceParameters.ts`
- `RaceParameters` type from `RaceParameters.ts`
- `DistanceType`, `Orientation`, `Surface`, `ThresholdStat` from `CourseData.ts`

**From `uma-tools/`:**

- `runComparison` function from `umalator/compare.ts` (the core simulation API)
- `HorseState`, `SkillSet` from `components/HorseDefTypes.ts`
- JSON data files from `umalator-global/`: `skill_data.json`, `skill_meta.json`, `course_data.json`, `skillnames.json`, `tracknames.json`
- Skill icon PNGs from `umalator-global/icons/skill/`

### `runComparison` API signature

```
runComparison(nsamples, course, racedef, uma1, uma2, seed: [number, number], options)
```

The seed is a `[lo, hi]` tuple (6th argument). Options is the 7th argument. Breaking changes to this signature are critical.

## Procedure

### Step 1: Record current state

```bash
# Current uma-tools commit
git -C uma-tools rev-parse HEAD
# Current uma-skill-tools commit
git -C uma-tools/uma-skill-tools rev-parse HEAD
```

Save these so you can restore them if needed.

### Step 2: Fetch upstream changes (without modifying working tree)

```bash
git -C uma-tools fetch origin
git -C uma-tools/uma-skill-tools fetch origin
```

Then check how far behind each submodule is:

```bash
git -C uma-tools log --oneline HEAD..origin/master
git -C uma-tools/uma-skill-tools log --oneline HEAD..origin/master
```

If both are up to date, report that and stop.

### Step 3: Analyze changes for breaking risks

For each submodule that has new commits, examine the diffs in files that umalator depends on.

**For uma-skill-tools**, check these specific files:

```bash
git -C uma-tools/uma-skill-tools diff HEAD..origin/master -- RaceParameters.ts CourseData.ts
```

Look for:

- Renamed or removed exports (`Mood`, `RaceParameters`, `DistanceType`, `Orientation`, `Surface`, `ThresholdStat`)
- Changed type shapes (added required fields, changed field types)
- Changed function signatures

**For uma-tools**, check these specific files:

```bash
git -C uma-tools diff HEAD..origin/master -- umalator/compare.ts components/HorseDefTypes.ts
```

Look for:

- Changes to `runComparison` signature (argument order, types, required params)
- Changes to `HorseState` or `SkillSet` types
- Removed or renamed exports

Also check data file schema changes:

```bash
git -C uma-tools diff HEAD..origin/master -- umalator-global/skill_meta.json umalator-global/skillnames.json umalator-global/course_data.json umalator-global/skill_data.json umalator-global/tracknames.json
```

For large data diffs, focus on structural changes (new/removed top-level keys, changed value types) rather than data updates (new skills, updated stats).

### Step 4: Identify new features

Read through the commit messages and diffs for changes that aren't in the files umalator currently uses. Look for:

- New exported functions or modules in `uma-tools/umalator/` that could be useful
- New data files in `umalator-global/` that umalator doesn't use yet
- New simulation options or parameters added to `runComparison`
- New types or utilities in `components/`
- New or updated skill data (more skills available for simulation)
- Changes to `uma-tools/umalator-global/icons/` (new icons)

### Step 5: Try the update and run tests

Attempt the update in a safe way:

```bash
# Update uma-tools to latest
git -C uma-tools checkout origin/master

# If uma-skill-tools also has updates, update it too
# But be careful: uma-tools may pin a specific uma-skill-tools commit
# Check what commit uma-tools expects:
git -C uma-tools submodule status uma-skill-tools
# Compare with origin/master of uma-skill-tools
```

Then verify:

```bash
# Type check
npx tsc --noEmit 2>&1 | grep -v "uma-tools"

# Build
npm run build

# Run tests
npx vitest run
```

The `tsc` check filters out errors from within uma-tools (those are expected and irrelevant). Focus on errors in umalator's own files that stem from changed uma-tools APIs.

### Step 6: Restore original state

Whether the update succeeded or failed, restore the original pins:

```bash
git -C uma-tools checkout <original-uma-tools-commit>
git -C uma-tools/uma-skill-tools checkout <original-uma-skill-tools-commit>
```

Only leave the update in place if everything passed and you're asked to keep it.

### Step 7: Report

Structure your report as:

**Update Status**

- Current pins vs latest upstream for each submodule
- Number of new commits available

**Breaking Change Risk**

- List each changed API/type that umalator uses
- For each, describe the change and its impact
- Overall risk assessment: safe / minor adjustments needed / breaking

**New Features Available**

- New functions, data, or capabilities in upstream
- For each, briefly describe what it does and how umalator could use it
- Prioritize by usefulness

**Test Results** (if update was attempted)

- Type check: pass/fail (with relevant errors)
- Build: pass/fail
- Tests: pass/fail (with failures)

**Recommendation**

- Whether to update, and if adjustments are needed, what they are
