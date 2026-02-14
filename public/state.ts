import type {
    Config,
    CourseData,
    SkillData,
    SkillMeta,
    SkillNames,
    SkillResult,
    SkillResultWithStatus,
} from './types'

// Config state
let currentConfig: Config | null = null
let currentConfigFile: string | null = null
let saveTimeout: ReturnType<typeof setTimeout> | null = null
let pendingSavePromise: Promise<void> | null = null

// Skill data state
let skillnames: SkillNames | null = null
let skillNameToId: Record<string, string> | null = null
let skillmeta: SkillMeta | null = null
let courseData: CourseData | null = null
let skillData: SkillData | null = null
let trackNames: Record<string, string[]> | null = null

// Cache for variant lookups (built once after skillnames loads)
let variantCache: Map<string, string[]> | null = null

// Case-insensitive skill name lookup map (built once after skillnames loads)
let skillNameLookup: Map<string, string> | null = null

// Results state
const resultsMap = new Map<string, SkillResultWithStatus>()
const selectedSkills = new Set<string>()
let sortColumn: keyof SkillResult = 'meanLengthPerCost'
let sortDirection: 'asc' | 'desc' = 'desc'
let lastCalculationTime: Date | null = null

// Frontend cache for calculated results (persists when skills are removed from table)
// Key: skillName, Value: result without status (raw calculation data)
const calculatedResultsCache = new Map<string, SkillResult>()

// Auto-calculation state
let autoCalculationTimeout: ReturnType<typeof setTimeout> | null = null
let autoCalculationInProgress = false

// Getters
export function getCurrentConfig(): Config | null {
    return currentConfig
}

export function getCurrentConfigFile(): string | null {
    return currentConfigFile
}

export function getSaveTimeout(): ReturnType<typeof setTimeout> | null {
    return saveTimeout
}

export function getPendingSavePromise(): Promise<void> | null {
    return pendingSavePromise
}

export function getSkillnames(): SkillNames | null {
    return skillnames
}

export function getSkillNameToId(): Record<string, string> | null {
    return skillNameToId
}

export function getSkillmeta(): SkillMeta | null {
    return skillmeta
}

export function getCourseData(): CourseData | null {
    return courseData
}

export function getSkillData(): SkillData | null {
    return skillData
}

export function getTrackNames(): Record<string, string[]> | null {
    return trackNames
}

export function getVariantCache(): Map<string, string[]> | null {
    return variantCache
}

export function getSkillNameLookup(): Map<string, string> | null {
    return skillNameLookup
}

export function getResultsMap(): Map<string, SkillResultWithStatus> {
    return resultsMap
}

export function getSelectedSkills(): Set<string> {
    return selectedSkills
}

export function getSortColumn(): keyof SkillResult {
    return sortColumn
}

export function getSortDirection(): 'asc' | 'desc' {
    return sortDirection
}

export function getLastCalculationTime(): Date | null {
    return lastCalculationTime
}

export function getCalculatedResultsCache(): Map<string, SkillResult> {
    return calculatedResultsCache
}

export function getAutoCalculationTimeout(): ReturnType<
    typeof setTimeout
> | null {
    return autoCalculationTimeout
}

export function isAutoCalculationInProgress(): boolean {
    return autoCalculationInProgress
}

// Setters
export function setCurrentConfig(config: Config | null): void {
    currentConfig = config
}

export function setCurrentConfigFile(file: string | null): void {
    currentConfigFile = file
}

export function setSaveTimeout(
    timeout: ReturnType<typeof setTimeout> | null,
): void {
    saveTimeout = timeout
}

export function setPendingSavePromise(promise: Promise<void> | null): void {
    pendingSavePromise = promise
}

export function setSkillnames(names: SkillNames | null): void {
    skillnames = names
}

export function setSkillNameToId(mapping: Record<string, string> | null): void {
    skillNameToId = mapping
}

export function setSkillmeta(meta: SkillMeta | null): void {
    skillmeta = meta
}

export function setCourseData(data: CourseData | null): void {
    courseData = data
}

export function setSkillData(data: SkillData | null): void {
    skillData = data
}

export function setTrackNames(data: Record<string, string[]> | null): void {
    trackNames = data
}

export function setVariantCache(cache: Map<string, string[]> | null): void {
    variantCache = cache
}

export function setSkillNameLookup(lookup: Map<string, string> | null): void {
    skillNameLookup = lookup
}

export function setSortColumn(column: keyof SkillResult): void {
    sortColumn = column
}

export function setSortDirection(direction: 'asc' | 'desc'): void {
    sortDirection = direction
}

export function setLastCalculationTime(time: Date | null): void {
    lastCalculationTime = time
}

export function setAutoCalculationTimeout(
    timeout: ReturnType<typeof setTimeout> | null,
): void {
    autoCalculationTimeout = timeout
}

export function setAutoCalculationInProgress(inProgress: boolean): void {
    autoCalculationInProgress = inProgress
}

// Utility functions for clearing timeouts safely
export function clearSaveTimeout(): void {
    if (saveTimeout) {
        clearTimeout(saveTimeout)
        saveTimeout = null
    }
}

export function clearAutoCalculationTimeout(): void {
    if (autoCalculationTimeout) {
        clearTimeout(autoCalculationTimeout)
        autoCalculationTimeout = null
    }
}
