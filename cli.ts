import { Command } from "commander";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Worker } from "worker_threads";
import { cpus } from "os";
import { CourseData } from "../uma-tools/uma-skill-tools/CourseData";
import {
    RaceParameters,
    GroundCondition,
    Grade,
    Mood,
    Time,
    Season,
} from "../uma-tools/uma-skill-tools/RaceParameters";
import { HorseState as HorseStateBase, SkillSet } from "../uma-tools/components/HorseDefTypes";

// HorseState extends immutable.js Record which TypeScript can't infer properly
interface HorseStateInstance {
    speed: number;
    stamina: number;
    power: number;
    guts: number;
    wisdom: number;
    strategy: string;
    distanceAptitude: string;
    surfaceAptitude: string;
    strategyAptitude: string;
    skills: { forEach(fn: (value: string) => void): void };
    toJS(): Record<string, unknown>;
}
const HorseState = HorseStateBase as unknown as new (props: Partial<HorseStateInstance>) => HorseStateInstance;

interface Config {
    skills?: Record<string, { discount?: number | null }>;
    track?: {
        courseId?: string;
        trackName?: string;
        distance?: number;
        surface?: string;
        groundCondition?: string;
        weather?: string;
        season?: string;
        numUmas?: number;
    };
    uma?: {
        speed?: number;
        stamina?: number;
        power?: number;
        guts?: number;
        wisdom?: number;
        strategy?: string;
        distanceAptitude?: string;
        surfaceAptitude?: string;
        styleAptitude?: string;
        mood?: number;
        skills?: string[];
        unique?: string;
    };
    deterministic?: boolean;
    confidenceInterval?: number;
}

interface SkillResult {
    skill: string;
    cost: number;
    discount: number;
    numSimulations: number;
    meanLength: number;
    medianLength: number;
    meanLengthPerCost: number;
    minLength: number;
    maxLength: number;
    ciLower: number;
    ciUpper: number;
}

function loadJson(filePath: string): any {
    const resolvedPath = resolve(process.cwd(), filePath);
    return JSON.parse(readFileSync(resolvedPath, "utf-8"));
}

function findAllSkillIdsByName(skillName: string, skillNames: Record<string, string[]>): string[] {
    const matches: string[] = [];
    for (const [id, names] of Object.entries(skillNames)) {
        if (names[0] === skillName) {
            matches.push(id);
        }
    }
    return matches;
}

function findSkillVariantsByName(
    baseSkillName: string,
    skillNames: Record<string, string[]>,
    skillMeta: Record<string, { baseCost: number }>
): Array<{ skillId: string; skillName: string }> {
    const variants: Array<{ skillId: string; skillName: string }> = [];
    const trimmedBaseName = baseSkillName.trim();

    // First try exact match, preferring skills with cost > 0
    const exactMatchId = findSkillIdByNameWithPreference(trimmedBaseName, skillNames, skillMeta, true);
    if (exactMatchId) {
        const baseCost = skillMeta[exactMatchId]?.baseCost ?? 200;
        // If exact match has cost 0, look for ○ and ◎ variants instead
        if (baseCost > 0) {
            variants.push({ skillId: exactMatchId, skillName: trimmedBaseName });
            return variants;
        }
    }

    // Look for ○ and ◎ variants (either no exact match, or exact match had cost 0)
    for (const [id, names] of Object.entries(skillNames)) {
        const name = names[0];
        if (name === trimmedBaseName + " ○" || name === trimmedBaseName + " ◎") {
            const baseCost = skillMeta[id]?.baseCost ?? 200;
            // Only include variants with cost > 0
            if (baseCost > 0) {
                variants.push({ skillId: id, skillName: name });
            }
        }
    }

    return variants;
}

function findSkillIdByNameWithPreference(
    skillName: string,
    skillNames: Record<string, string[]>,
    skillMeta: Record<string, { baseCost: number }>,
    preferCostGreaterThanZero: boolean
): string | null {
    const matches = findAllSkillIdsByName(skillName, skillNames);
    if (matches.length === 0) {
        return null;
    }
    if (matches.length === 1) {
        return matches[0];
    }

    // Multiple matches - prefer based on cost preference
    const preferred = matches.filter((id) => {
        const baseCost = skillMeta[id]?.baseCost ?? 200;
        return preferCostGreaterThanZero ? baseCost > 0 : baseCost === 0;
    });

    if (preferred.length > 0) {
        return preferred[0];
    }

    // Fallback to first match if no preferred found
    return matches[0];
}

function parseGroundCondition(name: string): GroundCondition {
    const normalized = name.toLowerCase();
    switch (normalized) {
        case "firm":
            return GroundCondition.Good;
        case "good":
            return GroundCondition.Yielding;
        case "soft":
            return GroundCondition.Soft;
        case "heavy":
            return GroundCondition.Heavy;
        default:
            throw new Error(`Invalid ground condition: ${name}`);
    }
}

function parseWeather(name: string): number {
    const normalized = name.toLowerCase();
    switch (normalized) {
        case "sunny":
            return 1;
        case "cloudy":
            return 2;
        case "rainy":
            return 3;
        case "snowy":
            return 4;
        default:
            throw new Error(`Invalid weather: ${name}`);
    }
}

function parseSeason(name: string): Season {
    const normalized = name.toLowerCase();
    switch (normalized) {
        case "spring":
            return Season.Spring;
        case "summer":
            return Season.Summer;
        case "fall":
        case "autumn":
            return Season.Autumn;
        case "winter":
            return Season.Winter;
        case "sakura":
            return Season.Sakura;
        default:
            throw new Error(`Invalid season: ${name}`);
    }
}

function parseStrategyName(name: string): string {
    const normalized = name.toLowerCase();
    const strategyMap: Record<string, string> = {
        runaway: "Oonige",
        "front runner": "Nige",
        "pace chaser": "Senkou",
        "late surger": "Sasi",
        "end closer": "Oikomi",
    };

    for (const [key, value] of Object.entries(strategyMap)) {
        if (normalized === key || normalized === value.toLowerCase()) {
            return value;
        }
    }
    throw new Error(`Invalid strategy: ${name}`);
}

function formatStrategyName(japaneseName: string): string {
    const strategyMap: Record<string, string> = {
        Oonige: "Runaway",
        Nige: "Front Runner",
        Senkou: "Pace Chaser",
        Sasi: "Late Surger",
        Oikomi: "End Closer",
    };
    return strategyMap[japaneseName] ?? japaneseName;
}

function formatDistanceType(distanceType: number): string {
    switch (distanceType) {
        case 1:
            return "Sprint";
        case 2:
            return "Mile";
        case 3:
            return "Medium";
        case 4:
            return "Long";
        default:
            throw new Error(`Invalid distance type: ${distanceType}`);
    }
}

function formatSurface(surface: number): string {
    return surface === 1 ? "Turf" : "Dirt";
}

function formatTurn(turn: number): string {
    return turn === 1 ? "Right" : "Left";
}

function processCourseData(rawCourse: any): CourseData {
    const courseWidth = 11.25;
    const horseLane = courseWidth / 18.0;
    const laneChangeAcceleration = 0.02 * 1.5;
    const laneChangeAccelerationPerFrame = laneChangeAcceleration / 15.0;
    const maxLaneDistance = (courseWidth * rawCourse.laneMax) / 10000.0;
    const moveLanePoint = rawCourse.corners.length > 0 ? rawCourse.corners[0].start : 30.0;

    return {
        ...rawCourse,
        courseWidth,
        horseLane,
        laneChangeAcceleration,
        laneChangeAccelerationPerFrame,
        maxLaneDistance,
        moveLanePoint,
    } as CourseData;
}

function parseSurface(surface: string | undefined): number | null {
    if (!surface) return null;
    const normalized = surface.toLowerCase().trim();
    if (normalized === "turf") return 1;
    if (normalized === "dirt") return 2;
    return null;
}

function parseDistanceCategory(distance: string | number | undefined): number | null {
    if (typeof distance === "number") return null;
    if (!distance) return null;
    const normalized = distance.toLowerCase().trim();
    switch (normalized) {
        case "<sprint>":
            return 1;
        case "<mile>":
            return 2;
        case "<medium>":
            return 3;
        case "<long>":
            return 4;
        default:
            return null;
    }
}

function isRandomLocation(trackName: string | undefined): boolean {
    if (!trackName) return false;
    return trackName.toLowerCase().trim() === "<random>";
}

function isRandomValue(value: string | undefined): boolean {
    if (!value) return false;
    return value.toLowerCase().trim() === "<random>";
}

function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

// Create weighted arrays for random selection (100 items based on percentages), then shuffle
function createWeightedSeasonArray(): Season[] {
    // 40% spring, 22% summer, 12% fall, 26% winter
    const result: Season[] = [];
    for (let i = 0; i < 40; i++) result.push(Season.Spring);
    for (let i = 0; i < 22; i++) result.push(Season.Summer);
    for (let i = 0; i < 12; i++) result.push(Season.Autumn);
    for (let i = 0; i < 26; i++) result.push(Season.Winter);
    return shuffleArray(result);
}

function createWeightedWeatherArray(): number[] {
    // 58% sunny, 30% cloudy, 11% rain, 1% snow
    const result: number[] = [];
    for (let i = 0; i < 58; i++) result.push(1); // sunny
    for (let i = 0; i < 30; i++) result.push(2); // cloudy
    for (let i = 0; i < 11; i++) result.push(3); // rain
    for (let i = 0; i < 1; i++) result.push(4); // snow
    return shuffleArray(result);
}

function createWeightedConditionArray(): GroundCondition[] {
    // 77% firm, 11% good, 7% soft, 5% heavy
    const result: GroundCondition[] = [];
    for (let i = 0; i < 77; i++) result.push(GroundCondition.Good); // firm
    for (let i = 0; i < 11; i++) result.push(GroundCondition.Yielding); // good
    for (let i = 0; i < 7; i++) result.push(GroundCondition.Soft); // soft
    for (let i = 0; i < 5; i++) result.push(GroundCondition.Heavy); // heavy
    return shuffleArray(result);
}

function findMatchingCoursesWithFilters(
    courseData: Record<string, any>,
    trackNames: Record<string, string[]>,
    trackName: string | undefined,
    distance: number | string | undefined,
    surface?: string
): Array<{ courseId: string; course: CourseData }> {
    const matches: Array<{ courseId: string; course: CourseData }> = [];
    const surfaceValue = parseSurface(surface);
    const distanceCategory = parseDistanceCategory(distance);
    const exactDistance = typeof distance === "number" ? distance : parseInt(distance as string);
    const randomLocation = isRandomLocation(trackName);
    const normalizedTrackName = trackName?.toLowerCase().trim();

    for (const [courseId, rawCourse] of Object.entries(courseData)) {
        // Skip tracks without a known name
        const courseTrackName = trackNames[rawCourse.raceTrackId.toString()]?.[1];
        if (!courseTrackName) {
            continue;
        }

        // Filter by surface
        if (surfaceValue !== null && rawCourse.surface !== surfaceValue) {
            continue;
        }

        // Filter by track name (unless <Random>)
        if (!randomLocation && normalizedTrackName) {
            if (courseTrackName.toLowerCase() !== normalizedTrackName) {
                continue;
            }
        }

        // Filter by distance category or exact distance
        if (distanceCategory !== null) {
            if (rawCourse.distanceType !== distanceCategory) {
                continue;
            }
        } else if (!isNaN(exactDistance)) {
            if (rawCourse.distance !== exactDistance) {
                continue;
            }
        }

        const processedCourse = processCourseData(rawCourse);
        matches.push({ courseId, course: processedCourse });
    }

    return matches;
}

function formatTrackDetails(
    course: CourseData,
    trackNames: Record<string, string[]>,
    groundCondition: string,
    weather: string,
    season: string,
    courseId?: string,
    numUmas?: number
): string {
    const trackName = trackNames[course.raceTrackId.toString()][1];
    const distanceType = formatDistanceType(course.distanceType);
    const surface = formatSurface(course.surface);
    const turn = formatTurn(course.turn);
    const ground = groundCondition.charAt(0).toUpperCase() + groundCondition.slice(1).toLowerCase();
    const weatherFormatted = weather.charAt(0).toUpperCase() + weather.slice(1).toLowerCase();
    const seasonFormatted = season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();
    const numUmasPart = numUmas ? `, ${numUmas} Umas` : "";
    const courseIdPart = courseId ? `, ID: ${courseId}` : "";
    return `${trackName}, ${course.distance}m (${distanceType}), ${surface}, ${turn}, ${seasonFormatted}, ${ground}, ${weatherFormatted}${numUmasPart}${courseIdPart}`;
}

function calculateSkillCost(
    skillId: string,
    skillMeta: Record<string, { baseCost: number; groupId?: number; order?: number }>,
    skillConfig: { discount?: number | null },
    baseUma?: HorseStateInstance,
    skillNames?: Record<string, string[]>,
    allConfigSkills?: Record<string, { discount?: number | null }>,
    skillIdToName?: Record<string, string>,
    skillNameToConfigKey?: Record<string, string>
): number {
    const currentSkill = skillMeta[skillId];
    const baseCost = currentSkill?.baseCost ?? 200;
    const discount = skillConfig.discount ?? 0;
    let totalCost = Math.ceil(baseCost * (1 - discount / 100));

    const skillsToIgnore = [
        "99 Problems",
        "G1 Averseness",
        "Gatekept",
        "Inner Post Averseness",
        "Outer Post Averseness",
        "Paddock Fright",
        "Wallflower",
        "You're Not the Boss of Me!",
        "♡ 3D Nail Art",
    ];

    // If there are higher-order skills with the same groupId, add their costs
    if (currentSkill?.groupId && baseUma && skillNames) {
        const currentGroupId = currentSkill.groupId;
        const currentOrder = currentSkill.order ?? 0;
        const umaSkillIds: string[] = [];
        baseUma.skills.forEach((skillId) => {
            umaSkillIds.push(skillId);
        });

        // Find all skills with the same groupId and higher order
        for (const [otherSkillId, otherSkillMeta] of Object.entries(skillMeta)) {
            if (
                otherSkillMeta.groupId === currentGroupId &&
                (otherSkillMeta.order ?? 0) > currentOrder &&
                !umaSkillIds.includes(otherSkillId)
            ) {
                const otherSkillNames = skillNames[otherSkillId];
                if (otherSkillNames) {
                    const primaryName = otherSkillNames[0];
                    // negative skills
                    if (primaryName.endsWith(" ×") || skillsToIgnore.includes(primaryName)) {
                        continue;
                    }
                }

                // Use direct lookup via skillIdToName instead of searching through skillNameToId
                let otherDiscount = 0;
                if (allConfigSkills && skillIdToName && skillNameToConfigKey) {
                    const skillName = skillIdToName[otherSkillId];
                    if (skillName) {
                        const configKey = skillNameToConfigKey[skillName] || skillName;
                        otherDiscount = allConfigSkills[configKey]?.discount ?? 0;
                    }
                }

                const otherBaseCost = otherSkillMeta.baseCost ?? 200;
                totalCost += Math.round(otherBaseCost * (1 - otherDiscount / 100));
            }
        }
    }

    return totalCost;
}

function formatTable(results: SkillResult[], confidenceInterval: number): string {
    const maxSkillLen = Math.max(...results.map((r) => r.skill.length), "Skill".length);
    const maxCostLen = Math.max(...results.map((r) => r.cost.toString().length), "Cost".length);
    const maxDiscountLen = Math.max(
        ...results.map((r) => (r.discount > 0 ? `${r.discount}%` : "-").length),
        "Discount".length
    );
    const maxSimulationsLen = Math.max(...results.map((r) => r.numSimulations.toString().length), "Sims".length);
    const maxMeanLen = Math.max(...results.map((r) => r.meanLength.toFixed(2).length), "Mean".length);
    const maxMedianLen = Math.max(...results.map((r) => r.medianLength.toFixed(2).length), "Median".length);
    const maxRatioLen = Math.max(
        ...results.map((r) => (r.meanLengthPerCost * 1000).toFixed(2).length),
        "Mean/Cost".length
    );
    const maxMinMaxLen = Math.max(
        ...results.map((r) => `${r.minLength.toFixed(2)}-${r.maxLength.toFixed(2)}`.length),
        "Min-Max".length
    );
    const ciLabel = `${confidenceInterval}% CI`;
    const maxCILen = Math.max(
        ...results.map((r) => `${r.ciLower.toFixed(2)}-${r.ciUpper.toFixed(2)}`.length),
        ciLabel.length
    );

    const header = `Skill${" ".repeat(maxSkillLen - "Skill".length + 2)}Cost${" ".repeat(
        maxCostLen - "Cost".length + 2
    )}Discount${" ".repeat(maxDiscountLen - "Discount".length + 2)}Sims${" ".repeat(
        maxSimulationsLen - "Sims".length + 2
    )}Mean${" ".repeat(maxMeanLen - "Mean".length + 2)}Median${" ".repeat(
        maxMedianLen - "Median".length + 2
    )}Mean/Cost${" ".repeat(maxRatioLen - "Mean/Cost".length + 2)}Min-Max${" ".repeat(
        maxMinMaxLen - "Min-Max".length + 2
    )}${ciLabel}`;
    const separator = "-".repeat(header.length);

    const rows = results.map((r) => {
        const skillPad = " ".repeat(maxSkillLen - r.skill.length + 2);
        const costPad = " ".repeat(maxCostLen - r.cost.toString().length + 2);
        const discountStr = r.discount > 0 ? `${r.discount}%` : "-";
        const discountPad = " ".repeat(maxDiscountLen - discountStr.length + 2);
        const simulationsPad = " ".repeat(maxSimulationsLen - r.numSimulations.toString().length + 2);
        const meanPad = " ".repeat(maxMeanLen - r.meanLength.toFixed(2).length + 2);
        const medianPad = " ".repeat(maxMedianLen - r.medianLength.toFixed(2).length + 2);
        const ratioPad = " ".repeat(maxRatioLen - (r.meanLengthPerCost * 1000).toFixed(2).length + 2);
        const minMaxStr = `${r.minLength.toFixed(2)}-${r.maxLength.toFixed(2)}`;
        const minMaxPad = " ".repeat(maxMinMaxLen - minMaxStr.length + 2);
        const ciStr = `${r.ciLower.toFixed(2)}-${r.ciUpper.toFixed(2)}`;
        const ciPad = " ".repeat(maxCILen - ciStr.length);
        return `${r.skill}${skillPad}${r.cost}${costPad}${discountStr}${discountPad}${
            r.numSimulations
        }${simulationsPad}${r.meanLength.toFixed(2)}${meanPad}${r.medianLength.toFixed(2)}${medianPad}${(
            r.meanLengthPerCost * 1000
        ).toFixed(2)}${ratioPad}${minMaxStr}${minMaxPad}${ciStr}${ciPad}`;
    });

    return [header, separator, ...rows].join("\n");
}

async function main() {
    const program = new Command();
    program
        .name("umalator-global-cli")
        .description("CLI tool for evaluating skills in umalator-global")
        .argument("[config]", "Path to config file", "default.json")
        .parse(process.argv);

    const args = program.args;
    const configPath = "configs/" + (args[0] || "default.json");

    const config: Config = loadJson(configPath);
    const skillMeta = loadJson("../uma-tools/umalator-global/skill_meta.json");
    const courseData = loadJson("../uma-tools/umalator-global/course_data.json");
    const skillNames = loadJson("../uma-tools/umalator-global/skillnames.json");
    const trackNames = loadJson("../uma-tools/umalator-global/tracknames.json");

    if (!config.track) {
        console.error("Error: config must specify track");
        process.exit(1);
    }

    if (!config.uma) {
        console.error("Error: config must specify uma");
        process.exit(1);
    }

    let courses: Array<{ courseId: string; course: CourseData }> = [];
    let useMultipleCourses = false;
    const trackNameValue = config.track.trackName;
    const distanceValue = config.track.distance;

    // Check if we're using random location or distance category
    const isRandomTrack = isRandomLocation(trackNameValue);
    const distanceCategory = parseDistanceCategory(distanceValue);
    useMultipleCourses = isRandomTrack || distanceCategory !== null;

    if (config.track.courseId) {
        const selectedCourseId = config.track.courseId;
        const rawCourse = courseData[selectedCourseId];
        if (!rawCourse) {
            console.error(`Error: Course ${selectedCourseId} not found`);
            process.exit(1);
        }
        const course = processCourseData(rawCourse);

        if (course.turn === undefined || course.turn === null) {
            console.error(`Error: Course ${selectedCourseId} is missing turn field`);
            process.exit(1);
        }
        courses.push({ courseId: selectedCourseId, course });
    } else if (trackNameValue && distanceValue !== undefined) {
        const matches = findMatchingCoursesWithFilters(
            courseData,
            trackNames,
            trackNameValue,
            distanceValue,
            config.track.surface
        );

        if (matches.length === 0) {
            const locationDesc = isRandomTrack ? "<Random>" : trackNameValue;
            const distanceDesc = distanceCategory !== null ? distanceValue : `${distanceValue}m`;
            const surfaceFilter = config.track.surface ? ` and surface ${config.track.surface}` : "";
            console.error(
                `Error: No courses found matching track "${locationDesc}" with distance ${distanceDesc}${surfaceFilter}`
            );
            process.exit(1);
        }

        // Sort courses by courseId for consistent ordering
        matches.sort((a, b) => a.courseId.localeCompare(b.courseId));

        if (useMultipleCourses) {
            courses = matches;
            console.log(`Found ${matches.length} matching course(s) for random selection:`);
            for (const { courseId, course: matchCourse } of matches) {
                const trackName = trackNames[matchCourse.raceTrackId.toString()][1];
                const distanceType = formatDistanceType(matchCourse.distanceType);
                const surface = formatSurface(matchCourse.surface);
                const turn = formatTurn(matchCourse.turn);
                console.log(
                    `  courseId: ${courseId} - ${trackName}, ${matchCourse.distance}m (${distanceType}), ${surface}, ${turn}`
                );
            }
            console.log("");
        } else {
            if (matches.length > 1) {
                console.log(`Found ${matches.length} matching course(s):`);
                for (const { courseId, course: matchCourse } of matches) {
                    const trackName = trackNames[matchCourse.raceTrackId.toString()][1];
                    const distanceType = formatDistanceType(matchCourse.distanceType);
                    const surface = formatSurface(matchCourse.surface);
                    const turn = formatTurn(matchCourse.turn);
                    console.log(
                        `  courseId: ${courseId} - ${trackName}, ${matchCourse.distance}m (${distanceType}), ${surface}, ${turn}`
                    );
                }
                console.log("");
            }
            courses.push(matches[0]);
        }

        // Validate all courses have turn field
        for (const { courseId, course } of courses) {
            if (course.turn === undefined || course.turn === null) {
                console.error(`Error: Course ${courseId} is missing turn field`);
                process.exit(1);
            }
        }
    } else {
        console.error("Error: config must specify either track.courseId or both track.trackName and track.distance");
        process.exit(1);
    }

    const primaryCourse = courses[0].course;
    const primaryCourseId = courses[0].courseId;

    const umaConfig = config.uma;
    const useRandomMood = umaConfig.mood === undefined;
    const moodValue: Mood | null = umaConfig.mood !== undefined ? (umaConfig.mood as Mood) : null;
    const numUmas = config.track.numUmas ?? 18;

    // Check for random season/weather/condition
    const useRandomSeason = isRandomValue(config.track.season);
    const useRandomWeather = isRandomValue(config.track.weather);
    const useRandomCondition = isRandomValue(config.track.groundCondition);
    const weightedSeasons = useRandomSeason ? createWeightedSeasonArray() : null;
    const weightedWeathers = useRandomWeather ? createWeightedWeatherArray() : null;
    const weightedConditions = useRandomCondition ? createWeightedConditionArray() : null;

    const racedef: RaceParameters = {
        mood: moodValue ?? 2,
        groundCondition: useRandomCondition
            ? GroundCondition.Good
            : config.track.groundCondition
            ? parseGroundCondition(config.track.groundCondition)
            : GroundCondition.Good,
        weather: useRandomWeather ? 1 : config.track.weather ? parseWeather(config.track.weather) : 1,
        season: useRandomSeason
            ? Season.Spring
            : config.track.season
            ? parseSeason(config.track.season)
            : Season.Spring,
        time: Time.NoTime,
        grade: Grade.G1,
        popularity: 1,
        skillId: "",
        orderRange: numUmas ? [1, numUmas] : undefined,
        numUmas: numUmas,
    };
    const strategyName = umaConfig.strategy ? parseStrategyName(umaConfig.strategy) : "Senkou";

    // Resolve skill names to IDs for uma.skills (prefer skills with cost > 0)
    const umaSkillIds: string[] = [];
    if (umaConfig.skills) {
        for (const skillName of umaConfig.skills) {
            const skillId = findSkillIdByNameWithPreference(skillName, skillNames, skillMeta, true);
            if (!skillId) {
                console.error(`Warning: Skill "${skillName}" not found in uma.skills, skipping`);
                continue;
            }
            umaSkillIds.push(skillId);
        }
    }

    // Resolve unique skill name to ID (prefer skill with cost === 0)
    let resolvedUniqueSkillName: string | null = null;
    if (umaConfig.unique) {
        const uniqueSkillId = findSkillIdByNameWithPreference(umaConfig.unique, skillNames, skillMeta, false);
        if (!uniqueSkillId) {
            console.error(`Warning: Unique skill "${umaConfig.unique}" not found, skipping`);
        } else {
            const baseCost = skillMeta[uniqueSkillId]?.baseCost ?? 200;
            if (baseCost !== 0) {
                console.error(`Warning: Unique skill "${umaConfig.unique}" has cost ${baseCost}, expected 0`);
            }
            umaSkillIds.push(uniqueSkillId);
            resolvedUniqueSkillName = skillNames[uniqueSkillId]?.[0] ?? umaConfig.unique;
        }
    }

    const baseUma = new HorseState({
        speed: umaConfig.speed ?? 1200,
        stamina: umaConfig.stamina ?? 1200,
        power: umaConfig.power ?? 800,
        guts: umaConfig.guts ?? 400,
        wisdom: umaConfig.wisdom ?? 400,
        strategy: strategyName,
        distanceAptitude: umaConfig.distanceAptitude ?? "A",
        surfaceAptitude: umaConfig.surfaceAptitude ?? "A",
        strategyAptitude: umaConfig.styleAptitude ?? "A",
        skills: SkillSet(umaSkillIds),
    });

    const deterministic = config.deterministic ?? false;
    const simOptions = {
        seed: deterministic ? 0 : Math.floor(Math.random() * 1000000000),
        useEnhancedSpurt: deterministic ? false : true,
        accuracyMode: deterministic ? false : true,
        pacemakerCount: 1,
        allowRushedUma1: deterministic ? false : true,
        allowRushedUma2: deterministic ? false : true,
        allowDownhillUma1: deterministic ? false : true,
        allowDownhillUma2: deterministic ? false : true,
        allowSectionModifierUma1: deterministic ? false : true,
        allowSectionModifierUma2: deterministic ? false : true,
        skillCheckChanceUma1: false, // Set to false to reduce dependency of other skills
        skillCheckChanceUma2: false, // Set to false to reduce dependency of other skills
    };

    const configSkills = config.skills ?? {};
    const skillNameToId: Record<string, string> = {};
    const skillIdToName: Record<string, string> = {};
    const skillNameToConfigKey: Record<string, string> = {};

    for (const [skillName, skillConfig] of Object.entries(configSkills)) {
        if (
            skillConfig.discount === null ||
            skillConfig.discount === undefined ||
            typeof skillConfig.discount !== "number"
        ) {
            continue;
        }

        const variants = findSkillVariantsByName(skillName, skillNames, skillMeta);
        if (variants.length === 0) {
            console.error(`Warning: Skill "${skillName}" not found or all variants have cost 0, skipping`);
            continue;
        }

        for (const variant of variants) {
            const skillId = variant.skillId;
            const variantSkillName = variant.skillName;

            // Skip if skill is already in uma's skill list
            if (umaSkillIds.includes(skillId)) {
                continue;
            }

            // Skip if uma already has a skill with lower order and same groupId
            const currentSkillMeta = skillMeta[skillId];
            if (currentSkillMeta?.groupId) {
                const currentGroupId = currentSkillMeta.groupId;
                const currentOrder = currentSkillMeta.order ?? 0;
                let shouldSkip = false;
                for (const umaSkillId of umaSkillIds) {
                    const umaSkillMeta = skillMeta[umaSkillId];
                    if (umaSkillMeta?.groupId === currentGroupId && (umaSkillMeta.order ?? 0) < currentOrder) {
                        shouldSkip = true;
                        break;
                    }
                }
                if (shouldSkip) {
                    continue;
                }
            }

            skillNameToId[variantSkillName] = skillId;
            skillIdToName[skillId] = variantSkillName;
            skillNameToConfigKey[variantSkillName] = skillName;
        }
    }

    const availableSkillNames = Object.keys(skillNameToId);
    if (availableSkillNames.length === 0) {
        console.error("Error: No available skills specified in config");
        process.exit(1);
    }
    const seasonDesc = useRandomSeason ? "<Random>" : config.track.season ?? "Spring";
    const weatherDesc = useRandomWeather ? "<Random>" : config.track.weather ?? "Sunny";
    const conditionDesc = useRandomCondition ? "<Random>" : config.track.groundCondition ?? "Good";

    if (useMultipleCourses) {
        const locationDesc = isRandomTrack ? "<Random>" : trackNameValue;
        const distanceDesc = distanceCategory !== null ? distanceValue : `${distanceValue}m`;
        console.log(
            `Running on ${courses.length} tracks matching: ${locationDesc}, ${
                config.track.surface ?? "Any"
            }, ${distanceDesc}`
        );
        console.log(`Season: ${seasonDesc}, Condition: ${conditionDesc}, Weather: ${weatherDesc}`);
    } else {
        const trackDetails = formatTrackDetails(
            primaryCourse,
            trackNames,
            conditionDesc,
            weatherDesc,
            seasonDesc,
            primaryCourseId,
            config.track.numUmas ?? 18
        );
        console.log(trackDetails);
    }
    console.log(
        `SPD: ${baseUma.speed}, STA: ${baseUma.stamina}, PWR: ${baseUma.power}, GUTS: ${baseUma.guts}, WIT: ${
            baseUma.wisdom
        }, ${formatStrategyName(baseUma.strategy)}, APT: ${
            baseUma.distanceAptitude
        }, Unique: ${resolvedUniqueSkillName}`
    );
    console.log("");

    const confidenceInterval = config.confidenceInterval ?? 95;

    interface SkillRawResults {
        skillName: string;
        rawResults: number[];
        cost: number;
        discount: number;
    }

    function calculateStatsFromRawResults(
        rawResults: number[],
        cost: number,
        discount: number,
        skillName: string,
        ciPercent: number
    ): SkillResult {
        const sorted = [...rawResults].sort((a, b) => a - b);
        const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
        const lowerPercentile = (100 - ciPercent) / 2;
        const upperPercentile = 100 - lowerPercentile;
        const lower_Index = Math.floor(sorted.length * (lowerPercentile / 100));
        const upper_Index = Math.floor(sorted.length * (upperPercentile / 100));
        const ciLower = sorted[lower_Index];
        const ciUpper = sorted[upper_Index];
        const meanLengthPerCost = mean / cost;

        return {
            skill: skillName,
            cost,
            discount,
            numSimulations: rawResults.length,
            meanLength: mean,
            medianLength: median,
            meanLengthPerCost,
            minLength: min,
            maxLength: max,
            ciLower,
            ciUpper,
        };
    }

    const concurrency = Math.min(availableSkillNames.length, cpus().length);

    const runSimulationInWorker = (
        skillName: string,
        numSimulations: number,
        returnRawResults: boolean
    ): Promise<{ skillName: string; rawResults?: number[]; result?: SkillResult }> => {
        return new Promise((resolve, reject) => {
            const skillId = skillNameToId[skillName];

            const worker = new Worker(new URL("./simulation.worker.js", import.meta.url), {
                workerData: {
                    skillId,
                    skillName,
                    courses: courses.map((c) => c.course),
                    racedef,
                    baseUma: baseUma.toJS(),
                    simOptions,
                    numSimulations,
                    useRandomMood,
                    useRandomSeason,
                    useRandomWeather,
                    useRandomCondition,
                    weightedSeasons,
                    weightedWeathers,
                    weightedConditions,
                    confidenceInterval,
                    returnRawResults,
                },
            });

            worker.on("message", (message: { success: boolean; result?: any; error?: string }) => {
                if (message.success && message.result) {
                    resolve(message.result);
                } else {
                    reject(new Error(message.error || "Unknown error"));
                }
                worker.terminate();
            });

            worker.on("error", (error) => {
                reject(error);
                worker.terminate();
            });
        });
    };

    const processWithConcurrency = async <T>(items: (() => Promise<T>)[], limit: number): Promise<T[]> => {
        const results: T[] = [];
        const executing: Promise<void>[] = [];

        for (const itemFactory of items) {
            const promise = itemFactory().then((result) => {
                results.push(result);
                executing.splice(executing.indexOf(promise), 1);
            });
            executing.push(promise);

            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }

        await Promise.all(executing);
        return results;
    };

    const skillRawResultsMap: Map<string, SkillRawResults> = new Map();

    for (const skillName of availableSkillNames) {
        const skillId = skillNameToId[skillName];
        const configKey = skillNameToConfigKey[skillName] || skillName;
        const skillConfig = configSkills[configKey];
        const cost = calculateSkillCost(
            skillId,
            skillMeta,
            skillConfig,
            baseUma,
            skillNames,
            configSkills,
            skillIdToName,
            skillNameToConfigKey
        );
        skillRawResultsMap.set(skillName, {
            skillName,
            rawResults: [],
            cost,
            discount: skillConfig.discount ?? 0,
        });
    }

    console.log(`Running 100 simulations for all ${availableSkillNames.length} skills...`);
    const firstPassFactories = availableSkillNames.map(
        (skillName) => () => runSimulationInWorker(skillName, 100, true)
    );
    const firstPassResults = await processWithConcurrency(firstPassFactories, concurrency);
    for (const result of firstPassResults) {
        if (result.rawResults) {
            const skillData = skillRawResultsMap.get(result.skillName);
            if (skillData) {
                skillData.rawResults.push(...result.rawResults);
            }
        }
    }

    const calculateCurrentResults = (): SkillResult[] => {
        const results: SkillResult[] = [];
        for (const skillData of skillRawResultsMap.values()) {
            if (skillData.rawResults.length > 0) {
                results.push(
                    calculateStatsFromRawResults(
                        skillData.rawResults,
                        skillData.cost,
                        skillData.discount,
                        skillData.skillName,
                        confidenceInterval
                    )
                );
            }
        }
        results.sort((a, b) => b.meanLengthPerCost - a.meanLengthPerCost);
        return results;
    };

    let currentResults = calculateCurrentResults();

    const runAdditionalSimulations = async (skillNames: string[], passName: string) => {
        if (skillNames.length === 0) return;
        console.log(`Running 100 simulations for ${passName} (${skillNames.length} skills)...`);
        const factories = skillNames.map((skillName) => () => runSimulationInWorker(skillName, 100, true));
        const passResults = await processWithConcurrency(factories, concurrency);
        for (const result of passResults) {
            if (result.rawResults) {
                const skillData = skillRawResultsMap.get(result.skillName);
                if (skillData) {
                    skillData.rawResults.push(...result.rawResults);
                }
            }
        }
        currentResults = calculateCurrentResults();
    };

    const topHalfCount = Math.ceil(currentResults.length / 2);
    const topHalfSkills = currentResults.slice(0, topHalfCount).map((r) => r.skill);
    await runAdditionalSimulations(topHalfSkills, "top half");

    const top10Skills = currentResults.slice(0, Math.min(10, currentResults.length)).map((r) => r.skill);
    await runAdditionalSimulations(top10Skills, "top 10");

    const top25PercentCount = Math.ceil(currentResults.length * 0.25);
    const top25PercentSkills = currentResults.slice(0, top25PercentCount).map((r) => r.skill);
    await runAdditionalSimulations(top25PercentSkills, "top 25%");

    const top5Skills = currentResults.slice(0, Math.min(5, currentResults.length)).map((r) => r.skill);
    await runAdditionalSimulations(top5Skills, "top 5");

    const finalResults = calculateCurrentResults();

    console.log("");
    console.log(formatTable(finalResults, confidenceInterval));
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
