import './input.css'

interface Skill {
    discount: number | null
    default?: number | null
}

interface Track {
    trackName?: string
    surface?: string
    distance?: number | string | null
    groundCondition?: string
    weather?: string
    season?: string
    numUmas?: number | null
    courseId?: string
}

interface Uma {
    speed?: number | null
    stamina?: number | null
    power?: number | null
    guts?: number | null
    wisdom?: number | null
    strategy?: string
    distanceAptitude?: string
    surfaceAptitude?: string
    styleAptitude?: string
    mood?: number | null
    unique?: string
    skills?: string[]
}

interface Config {
    skills: Record<string, Skill>
    track?: Track
    uma?: Uma
}

type SkillNames = Record<string, string[]>
type SkillMeta = Record<string, { groupId?: string }>
type CourseData = Record<
    string,
    {
        surface?: number
        distance?: number
        raceTrackId?: number | string
    }
>

const tracknames: Record<string, [string, string]> = {
    10001: ['', 'Sapporo'],
    10002: ['', 'Hakodate'],
    10003: ['', 'Niigata'],
    10004: ['', 'Fukushima'],
    10005: ['', 'Nakayama'],
    10006: ['', 'Tokyo'],
    10007: ['', 'Chukyo'],
    10008: ['', 'Kyoto'],
    10009: ['', 'Hanshin'],
    10010: ['', 'Kokura'],
    10101: ['', 'Ooi'],
}

let currentConfig: Config | null = null
let currentConfigFile: string | null = null
let saveTimeout: ReturnType<typeof setTimeout> | null = null
let skillnames: SkillNames | null = null
let skillNameToId: Record<string, string> | null = null
let skillmeta: SkillMeta | null = null
let courseData: CourseData | null = null

// Cache for variant lookups (built once after skillnames loads)
let variantCache: Map<string, string[]> | null = null

// Case-insensitive skill name lookup map (built once after skillnames loads)
let skillNameLookup: Map<string, string> | null = null

function buildSkillNameLookup(): void {
    if (!skillnames) return
    skillNameLookup = new Map()
    for (const [, names] of Object.entries(skillnames)) {
        if (Array.isArray(names) && names[0]) {
            const canonicalName = names[0]
            skillNameLookup.set(canonicalName.toLowerCase(), canonicalName)
        }
    }
}

function buildVariantCache(): void {
    if (!skillnames) return
    variantCache = new Map()
    for (const [, names] of Object.entries(skillnames)) {
        if (!Array.isArray(names) || !names[0]) continue
        const name = names[0]
        // Match names ending with " ○" or " ◎"
        const match = name.match(/^(.+) ([○◎])$/)
        if (match) {
            const baseName = match[1]
            if (!variantCache.has(baseName)) {
                variantCache.set(baseName, [])
            }
            variantCache.get(baseName)?.push(name)
        }
    }
}

;(async function loadSkillnamesOnInit() {
    const response = await fetch('/api/skillnames')
    if (!response.ok) {
        throw new Error(
            `Failed to load skillnames: ${response.status} ${response.statusText}`,
        )
    }
    skillnames = (await response.json()) as SkillNames
    if (!skillnames || typeof skillnames !== 'object') {
        throw new Error('Invalid skillnames data received')
    }
    skillNameToId = Object.fromEntries(
        Object.entries(skillnames).map(([id, names]) => [names[0], id]),
    )
    buildVariantCache()
    buildSkillNameLookup()
})().catch((error) => {
    console.error('Failed to load skillnames:', error)
})

;(async function loadSkillmetaOnInit() {
    const response = await fetch('/api/skillmeta')
    if (!response.ok) {
        throw new Error(
            `Failed to load skillmeta: ${response.status} ${response.statusText}`,
        )
    }
    skillmeta = (await response.json()) as SkillMeta
    if (!skillmeta || typeof skillmeta !== 'object') {
        throw new Error('Invalid skillmeta data received')
    }
})().catch((error) => {
    console.error('Failed to load skillmeta:', error)
})

async function waitForCourseData(): Promise<void> {
    if (courseData) {
        return
    }
    await new Promise<void>((resolve) => {
        const checkCourseData = setInterval(() => {
            if (courseData) {
                clearInterval(checkCourseData)
                resolve()
            }
        }, 50)
        setTimeout(() => {
            clearInterval(checkCourseData)
            resolve()
        }, 5000)
    })
}

;(async function loadCourseDataOnInit() {
    const response = await fetch('/api/coursedata')
    if (!response.ok) {
        throw new Error(
            `Failed to load course data: ${response.status} ${response.statusText}`,
        )
    }
    courseData = (await response.json()) as CourseData
    if (!courseData || typeof courseData !== 'object') {
        throw new Error('Invalid course data received')
    }
    if (currentConfig) {
        renderTrack()
    }
})().catch((error) => {
    console.error('Failed to load course data:', error)
})

function normalizeSkillName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[◎○×]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function getCanonicalSkillName(inputName: string): string {
    if (!skillNameLookup) return inputName
    const canonical = skillNameLookup.get(inputName.toLowerCase().trim())
    return canonical || inputName
}

function getBaseSkillName(skillName: string): string {
    return skillName.replace(/[◎○]$/, '').trim()
}

function getVariantsForBaseName(baseName: string): string[] {
    if (!variantCache) return []
    return variantCache.get(baseName) || []
}

function getOtherVariant(skillName: string): string | string[] | null {
    if (!variantCache) return null
    const baseName = getBaseSkillName(skillName)
    const hasCircle = skillName.endsWith(' ○')
    const hasDoubleCircle = skillName.endsWith(' ◎')

    if (!hasCircle && !hasDoubleCircle) {
        const variants = getVariantsForBaseName(baseName)
        if (variants.length === 2) {
            return variants
        }
        return null
    }

    const otherVariantName = hasCircle ? `${baseName} ◎` : `${baseName} ○`
    const variants = variantCache.get(baseName) || []

    // Check if the other variant exists in the cache
    if (variants.includes(otherVariantName)) {
        return otherVariantName
    }

    return null
}

function findSkillId(skillName: string): string | null {
    if (!skillNameToId || !skillnames) return null
    if (skillNameToId[skillName]) {
        return skillNameToId[skillName]
    }

    const normalizedSkillName = normalizeSkillName(skillName)
    for (const [id, names] of Object.entries(skillnames)) {
        if (Array.isArray(names)) {
            for (const name of names) {
                if (name) {
                    const normalizedName = normalizeSkillName(name)
                    if (
                        normalizedName === normalizedSkillName ||
                        normalizedName.includes(normalizedSkillName) ||
                        normalizedSkillName.includes(normalizedName)
                    ) {
                        return id
                    }
                }
            }
        }
    }

    return null
}

function getSkillGroupId(skillName: string): string | null {
    if (!skillmeta) return null
    const skillId = findSkillId(skillName)
    if (!skillId) return null
    return skillmeta[skillId]?.groupId || null
}

async function loadConfigFiles(): Promise<void> {
    const response = await fetch('/api/configs')
    const files = (await response.json()) as string[]
    const select = document.getElementById('config-select') as HTMLSelectElement
    if (!select) return
    select.innerHTML = ''
    files.forEach((file) => {
        const option = document.createElement('option')
        option.value = file
        option.textContent = file
        select.appendChild(option)
    })
    await waitForCourseData()
    if (files.length > 0) {
        await loadConfig(files[0])
    }
}

async function loadConfig(filename: string): Promise<void> {
    const response = await fetch(`/api/config/${filename}`)
    const config = (await response.json()) as Config
    currentConfig = config
    currentConfigFile = filename
    const select = document.getElementById('config-select') as HTMLSelectElement
    if (select) {
        select.value = filename
    }

    renderSkills()
    renderTrack()
    renderUma()
}

function deleteSkill(skillName: string): void {
    if (!currentConfig) return
    const baseName = getBaseSkillName(skillName)
    const skillsToDelete = [baseName, `${baseName} ○`, `${baseName} ◎`]
    skillsToDelete.forEach((skillToDelete) => {
        delete currentConfig.skills[skillToDelete]
    })
}

function renderSkills(): void {
    const squareClasses =
        'py-0.5 px-1 w-6 h-6 rounded text-[13px] cursor-pointer transition-colors'
    if (!currentConfig) return
    const container = document.getElementById('skills-container')
    if (!container) return
    container.innerHTML = ''
    const skills = currentConfig.skills
    const umaSkills = currentConfig.uma?.skills || []

    const skillNames = Object.keys(skills)
    const skillsToRender = new Set<string>()
    const skillsToHide = new Set<string>()

    skillNames.forEach((skillName) => {
        const baseName = getBaseSkillName(skillName)
        const variants = getVariantsForBaseName(baseName)

        if (variants.length === 2) {
            skillsToHide.add(baseName)
            variants.forEach((variantName) => {
                skillsToRender.add(variantName)
                if (!skills[variantName]) {
                    const baseSkill = skills[baseName] || skills[skillName]
                    skills[variantName] = {
                        discount:
                            baseSkill.discount !== null &&
                            baseSkill.discount !== undefined
                                ? baseSkill.discount
                                : null,
                    }
                } else {
                    const baseSkill = skills[baseName] || skills[skillName]
                    if (
                        baseSkill.discount !== null &&
                        baseSkill.discount !== undefined
                    ) {
                        skills[variantName].discount = baseSkill.discount
                    }
                }
            })
        } else {
            const otherVariant = getOtherVariant(skillName)
            if (otherVariant) {
                const variantsToAdd = Array.isArray(otherVariant)
                    ? otherVariant
                    : [otherVariant]
                variantsToAdd.forEach((variantName) => {
                    if (!skillsToRender.has(variantName)) {
                        skillsToRender.add(variantName)
                        if (!skills[variantName]) {
                            const baseSkill = skills[skillName]
                            skills[variantName] = {
                                discount:
                                    baseSkill.discount !== null &&
                                    baseSkill.discount !== undefined
                                        ? baseSkill.discount
                                        : null,
                            }
                        } else {
                            const baseSkill = skills[skillName]
                            if (
                                baseSkill.discount !== null &&
                                baseSkill.discount !== undefined
                            ) {
                                skills[variantName].discount =
                                    baseSkill.discount
                            }
                        }
                    }
                })
            }
            if (!skillsToHide.has(skillName)) {
                skillsToRender.add(skillName)
            }
        }
    })

    // Pre-compute skill IDs to avoid O(n²) lookups in sort comparator
    const skillIdCache = new Map<string, number>()
    for (const name of skillsToRender) {
        const idStr = findSkillId(name)
        skillIdCache.set(name, idStr ? parseInt(idStr, 10) : 0)
    }
    const sortedSkillNames = Array.from(skillsToRender).sort((a, b) => {
        return (skillIdCache.get(a) || 0) - (skillIdCache.get(b) || 0)
    })

    sortedSkillNames.forEach((skillName) => {
        const skill = skills[skillName]
        if (!skill) return

        if (skill.discount === undefined) {
            skill.discount = null
        }

        const div = document.createElement('div')
        div.className =
            'flex items-center gap-2 hover:bg-zinc-800 px-1 py-0.5 rounded'
        div.dataset.skill = skillName

        const currentDiscount = skill.discount
        const discountOptions: (number | null)[] = [null, 0, 10, 20, 30, 35, 40]
        const discountButtonGroup = document.createElement('div')
        discountButtonGroup.className = 'flex gap-1 items-center'
        discountButtonGroup.dataset.skill = skillName

        discountOptions.forEach((value) => {
            const button = document.createElement('button')
            button.className = `${squareClasses} bg-zinc-700 text-zinc-200 border border-zinc-600 hover:bg-zinc-600 hover:border-zinc-500`
            button.dataset.skill = skillName
            button.dataset.discount = value === null ? '-' : value.toString()
            button.textContent = value === null ? '-' : value.toString()
            if (
                currentDiscount === value ||
                (value === null &&
                    (currentDiscount === null || currentDiscount === undefined))
            ) {
                button.className = `${squareClasses} bg-sky-600 text-white border border-sky-600 hover:bg-sky-700 hover:border-sky-700`
            }
            discountButtonGroup.appendChild(button)
        })

        const lockButton = document.createElement('button')
        lockButton.className = `${squareClasses} bg-transparent text-zinc-500 border-none hover:text-zinc-200 hover:bg-zinc-700`
        lockButton.dataset.skill = skillName
        const skillDefault = skill.default
        const isDefaultActive =
            skillDefault !== undefined &&
            skillDefault !== null &&
            currentDiscount === skillDefault
        const isDefaultNull =
            (skillDefault === undefined || skillDefault === null) &&
            (currentDiscount === null || currentDiscount === undefined)
        const isLocked = isDefaultActive || isDefaultNull
        lockButton.textContent = isLocked ? '🔒' : '🔓'
        lockButton.title = isLocked
            ? 'Remove default'
            : 'Set current discount as default'
        lockButton.addEventListener('click', (e) => {
            e.stopPropagation()
            const target = e.target as HTMLElement
            const skillName = target.dataset.skill
            if (!skillName || !currentConfig) return
            const currentDiscount = currentConfig.skills[skillName]?.discount
            const skillDefault = currentConfig.skills[skillName]?.default
            const isCurrentlyDefault =
                (skillDefault !== undefined &&
                    skillDefault !== null &&
                    currentDiscount === skillDefault) ||
                ((skillDefault === undefined || skillDefault === null) &&
                    (currentDiscount === null || currentDiscount === undefined))
            if (isCurrentlyDefault) {
                delete currentConfig.skills[skillName].default
                const baseName = getBaseSkillName(skillName)
                const variants = getVariantsForBaseName(baseName)
                if (variants.length > 1) {
                    variants.forEach((variantName) => {
                        if (currentConfig.skills[variantName]) {
                            delete currentConfig.skills[variantName].default
                        }
                    })
                } else {
                    const otherVariant = getOtherVariant(skillName)
                    if (otherVariant) {
                        const variantsToUpdate = Array.isArray(otherVariant)
                            ? otherVariant
                            : [otherVariant]
                        variantsToUpdate.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                delete currentConfig.skills[variantName].default
                            }
                        })
                    }
                }
            } else {
                if (currentDiscount === null || currentDiscount === undefined) {
                    delete currentConfig.skills[skillName].default
                    const baseName = getBaseSkillName(skillName)
                    const variants = getVariantsForBaseName(baseName)
                    if (variants.length === 2) {
                        variants.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                delete currentConfig.skills[variantName].default
                            }
                        })
                    } else {
                        const otherVariant = getOtherVariant(skillName)
                        if (otherVariant) {
                            const variantsToUpdate = Array.isArray(otherVariant)
                                ? otherVariant
                                : [otherVariant]
                            variantsToUpdate.forEach((variantName) => {
                                if (currentConfig.skills[variantName]) {
                                    delete currentConfig.skills[variantName]
                                        .default
                                }
                            })
                        }
                    }
                } else {
                    currentConfig.skills[skillName].default = currentDiscount
                    const baseName = getBaseSkillName(skillName)
                    const variants = getVariantsForBaseName(baseName)
                    if (variants.length === 2) {
                        variants.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                currentConfig.skills[variantName].default =
                                    currentDiscount
                            }
                        })
                    } else {
                        const otherVariant = getOtherVariant(skillName)
                        if (otherVariant) {
                            const variantsToUpdate = Array.isArray(otherVariant)
                                ? otherVariant
                                : [otherVariant]
                            variantsToUpdate.forEach((variantName) => {
                                if (currentConfig.skills[variantName]) {
                                    currentConfig.skills[variantName].default =
                                        currentDiscount
                                }
                            })
                        }
                    }
                }
            }
            renderSkills()
            autoSave()
        })
        discountButtonGroup.appendChild(lockButton)

        const addToUmaButton = document.createElement('button')
        const isInUmaSkills = umaSkills.includes(skillName)
        const hasDiscount =
            skill.discount !== null && skill.discount !== undefined
        if (isInUmaSkills) {
            addToUmaButton.className = `${squareClasses} bg-red-600 text-white border-none hover:bg-red-700`
            addToUmaButton.textContent = '-'
            addToUmaButton.title = 'Remove from Uma skills'
        } else {
            if (hasDiscount) {
                addToUmaButton.className = `${squareClasses} bg-sky-600 text-white border-none hover:bg-sky-700`
            } else {
                addToUmaButton.className = `${squareClasses} opacity-40 bg-zinc-700 text-zinc-400 border border-zinc-600 hover:bg-zinc-600 hover:border-zinc-500`
            }
            addToUmaButton.textContent = '+'
            addToUmaButton.title = 'Add to Uma skills'
        }
        addToUmaButton.dataset.skill = skillName
        addToUmaButton.addEventListener('click', (e) => {
            e.stopPropagation()
            const target = e.target as HTMLElement
            const skillName = target.dataset.skill
            if (!skillName || !currentConfig) return
            if (!currentConfig.uma) {
                currentConfig.uma = {}
            }
            if (!currentConfig.uma.skills) {
                currentConfig.uma.skills = []
            }

            const currentlyInUmaSkills =
                currentConfig.uma.skills.includes(skillName)
            if (currentlyInUmaSkills) {
                const skillIndex = currentConfig.uma.skills.indexOf(skillName)
                if (skillIndex !== -1) {
                    currentConfig.uma.skills.splice(skillIndex, 1)
                }
            } else {
                const newSkillGroupId = getSkillGroupId(skillName)
                let replaced = false

                if (newSkillGroupId) {
                    for (let i = 0; i < currentConfig.uma.skills.length; i++) {
                        const existingSkill = currentConfig.uma.skills[i]
                        const existingGroupId = getSkillGroupId(existingSkill)
                        if (existingGroupId === newSkillGroupId) {
                            currentConfig.uma.skills[i] = skillName
                            replaced = true
                            break
                        }
                    }
                }

                if (
                    !replaced &&
                    !currentConfig.uma.skills.includes(skillName)
                ) {
                    currentConfig.uma.skills.push(skillName)
                }
            }
            renderUma()
            renderSkills()
            autoSave()
        })

        const skillNameSpan = document.createElement('span')
        skillNameSpan.className = 'flex-1 cursor-pointer hover:text-teal-400'
        skillNameSpan.textContent = skillName
        skillNameSpan.title = 'Click to edit skill name'
        skillNameSpan.dataset.skill = skillName
        skillNameSpan.addEventListener('click', (e) => {
            e.stopPropagation()
            const target = e.target as HTMLElement
            const skillName = target.dataset.skill
            if (!skillName || !currentConfig) return
            const originalName = skillName
            const skillNameInput = document.createElement('input')
            skillNameInput.type = 'text'
            skillNameInput.className =
                'py-0.5 px-1 border-sky-500 min-w-[100px] m-0 bg-zinc-700 text-zinc-200 border rounded text-[13px] focus:outline-none focus:border-sky-400 flex-1'
            skillNameInput.value = originalName
            const spanTarget = e.target as HTMLElement
            skillNameInput.style.width = `${spanTarget.offsetWidth}px`
            skillNameInput.style.minWidth = '100px'

            const restoreSpan = () => {
                renderSkills()
            }

            const handleBlur = () => {
                const inputName = skillNameInput.value.trim()
                if (!inputName) {
                    deleteSkill(originalName)
                    renderSkills()
                    renderUma()
                    autoSave()
                } else {
                    const canonicalName = getCanonicalSkillName(inputName)
                    if (
                        canonicalName !== originalName &&
                        !currentConfig.skills[canonicalName]
                    ) {
                        const skillData = currentConfig.skills[originalName]
                        deleteSkill(originalName)
                        currentConfig.skills[canonicalName] = skillData
                        renderSkills()
                        renderUma()
                        autoSave()
                    } else {
                        restoreSpan()
                    }
                }
            }

            skillNameInput.addEventListener('blur', handleBlur)
            skillNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    skillNameInput.blur()
                } else if (e.key === 'Escape') {
                    restoreSpan()
                }
            })

            const parent = spanTarget.parentNode
            if (parent) {
                parent.replaceChild(skillNameInput, spanTarget)
            }
            skillNameInput.focus()
            skillNameInput.select()
        })

        const label = document.createElement('label')
        label.className = 'flex-1 m-0 flex items-center gap-2'
        label.appendChild(skillNameSpan)

        div.appendChild(addToUmaButton)
        div.appendChild(label)
        div.appendChild(discountButtonGroup)

        container.appendChild(div)
    })

    // Event delegation is set up once via setupSkillsContainerDelegation()
}

function calculateDropdownWidth(options: string[]): number {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return 120
    context.font =
        "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    let maxWidth = 0
    options.forEach((opt) => {
        const width = context.measureText(opt).width
        if (width > maxWidth) {
            maxWidth = width
        }
    })
    return Math.max(maxWidth + 30, 60)
}

const DISTANCE_CATEGORIES = ['<Sprint>', '<Mile>', '<Medium>', '<Long>']
const RANDOM_LOCATION = '<Random>'

function isRandomLocation(trackName: string | undefined | null): boolean {
    return (
        trackName !== undefined &&
        trackName !== null &&
        trackName.toLowerCase().trim() === '<random>'
    )
}

function isDistanceCategory(
    distance: string | number | null | undefined,
): boolean {
    if (!distance) return false
    const normalized = distance.toString().toLowerCase().trim()
    return ['<sprint>', '<mile>', '<medium>', '<long>'].includes(normalized)
}

function getAvailableDistances(
    trackName: string | undefined,
    surface: string | undefined,
): string[] {
    if (!courseData || !surface) {
        return DISTANCE_CATEGORIES
    }

    const surfaceValue = surface.toLowerCase() === 'turf' ? 1 : 2
    if (surfaceValue === null) {
        return DISTANCE_CATEGORIES
    }

    const isRandom = isRandomLocation(trackName)

    if (isRandom) {
        const distances = new Set<number>()
        for (const [, rawCourse] of Object.entries(courseData)) {
            if (!rawCourse || typeof rawCourse !== 'object') {
                continue
            }
            if (rawCourse.surface === surfaceValue) {
                if (rawCourse.distance !== undefined) {
                    distances.add(rawCourse.distance)
                }
            }
        }
        const distanceList = Array.from(distances)
            .sort((a, b) => a - b)
            .map((d) => d.toString())
        return [...DISTANCE_CATEGORIES, ...distanceList]
    }

    if (!trackName) {
        return DISTANCE_CATEGORIES
    }

    const normalizedTrackName = trackName.toLowerCase()
    const trackId = Object.keys(tracknames).find(
        (id) => tracknames[id][1]?.toLowerCase() === normalizedTrackName,
    )
    if (!trackId) {
        return DISTANCE_CATEGORIES
    }

    const distances = new Set<number>()
    for (const [, rawCourse] of Object.entries(courseData)) {
        if (!rawCourse || typeof rawCourse !== 'object') {
            continue
        }
        const raceTrackId = rawCourse.raceTrackId
        if (raceTrackId == null) {
            continue
        }
        if (
            raceTrackId.toString() === trackId &&
            rawCourse.surface === surfaceValue
        ) {
            if (rawCourse.distance !== undefined) {
                distances.add(rawCourse.distance)
            }
        }
    }

    const distanceList = Array.from(distances)
        .sort((a, b) => a - b)
        .map((d) => d.toString())
    return [...DISTANCE_CATEGORIES, ...distanceList]
}

function renderTrack(): void {
    if (!currentConfig) return
    const container = document.getElementById('track-container')
    if (!container) return
    container.innerHTML = ''
    const track = currentConfig.track || {}

    const trackLocations = Object.values(tracknames)
        .map((arr) => arr[1])
        .filter(Boolean)
        .sort() as string[]
    const locationOptions = [RANDOM_LOCATION, ...trackLocations]
    const locationWidth =
        locationOptions.length > 0
            ? calculateDropdownWidth(locationOptions)
            : 120

    const distanceOptions = getAvailableDistances(
        track.trackName,
        track.surface,
    )
    const distanceWidth =
        distanceOptions.length > 0
            ? calculateDropdownWidth(distanceOptions)
            : 60

    interface Field {
        key: keyof Track
        label: string
        type: 'select' | 'number' | 'text'
        options?: string[]
        width: number
        dynamic?: boolean
    }

    const fields: Field[] = [
        {
            key: 'trackName',
            label: 'Location',
            type: 'select',
            options: locationOptions,
            width: locationWidth,
        },
        {
            key: 'surface',
            label: 'Surface',
            type: 'select',
            options: ['Turf', 'Dirt'],
            width: calculateDropdownWidth(['Turf', 'Dirt']),
        },
        {
            key: 'distance',
            label: 'Distance',
            type: 'select',
            options: distanceOptions,
            width: distanceWidth,
            dynamic: true,
        },
        {
            key: 'groundCondition',
            label: 'Condition',
            type: 'select',
            options: ['<Random>', 'Firm', 'Good', 'Soft', 'Heavy'],
            width: calculateDropdownWidth([
                '<Random>',
                'Firm',
                'Good',
                'Soft',
                'Heavy',
            ]),
        },
        {
            key: 'weather',
            label: 'Weather',
            type: 'select',
            options: ['<Random>', 'Sunny', 'Cloudy', 'Rainy', 'Snowy'],
            width: calculateDropdownWidth([
                '<Random>',
                'Sunny',
                'Cloudy',
                'Rainy',
                'Snowy',
            ]),
        },
        {
            key: 'season',
            label: 'Season',
            type: 'select',
            options: [
                '<Random>',
                'Spring',
                'Summer',
                'Fall',
                'Winter',
                'Sakura',
            ],
            width: calculateDropdownWidth([
                '<Random>',
                'Spring',
                'Summer',
                'Fall',
                'Winter',
                'Sakura',
            ]),
        },
        { key: 'numUmas', label: 'Umas', type: 'number', width: 50 },
        { key: 'courseId', label: 'Course ID', type: 'text', width: 70 },
    ]

    const trackLine = document.createElement('div')
    trackLine.className = 'flex flex-wrap items-center gap-1'

    fields.forEach((field) => {
        const wrapper = document.createElement('span')
        wrapper.className = 'inline-flex items-center gap-1'

        const label = document.createElement('span')
        label.className = 'text-zinc-300 text-[13px] whitespace-nowrap'
        label.textContent = `${field.label}: `
        wrapper.appendChild(label)

        let input: HTMLInputElement | HTMLSelectElement
        if (field.type === 'select') {
            input = document.createElement('select')
            input.className =
                'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500'
            if (field.width) {
                input.style.width = `${field.width}px`
            }
            field.options?.forEach((opt) => {
                const option = document.createElement('option')
                option.value = opt
                option.textContent = opt
                const trackValue = track[field.key]
                const trackValueStr = trackValue?.toString()?.toLowerCase()
                const optLower = opt.toLowerCase()
                if (
                    trackValue === opt ||
                    trackValueStr === opt ||
                    trackValueStr === optLower
                ) {
                    option.selected = true
                }
                input.appendChild(option)
            })
        } else {
            input = document.createElement('input')
            input.type = field.type
            input.className =
                'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500'
            const fieldValue = track[field.key]
            input.value =
                fieldValue === null || fieldValue === undefined
                    ? ''
                    : String(fieldValue)
            if (field.width) {
                input.style.width = `${field.width}px`
            }
        }

        input.dataset.key = field.key
        input.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement | HTMLSelectElement
            let value: string | number | null
            if (field.type === 'number') {
                const parsed = parseInt(target.value, 10)
                value =
                    target.value === '' || Number.isNaN(parsed) ? null : parsed
            } else {
                value = target.value
            }
            if (!currentConfig) return
            if (!currentConfig.track) {
                currentConfig.track = {}
            }
            ;(currentConfig.track as Record<string, unknown>)[field.key] = value

            if (field.key === 'trackName' || field.key === 'surface') {
                await waitForCourseData()

                const newTrackName =
                    field.key === 'trackName'
                        ? (value as string)
                        : currentConfig.track.trackName
                const newSurface =
                    field.key === 'surface'
                        ? (value as string)
                        : currentConfig.track.surface
                const newDistanceOptions = getAvailableDistances(
                    newTrackName,
                    newSurface,
                )

                const distanceSelect = container.querySelector(
                    'select[data-key="distance"]',
                ) as HTMLSelectElement
                if (distanceSelect) {
                    const currentDistance = currentConfig.track.distance
                    const currentDistanceStr = currentDistance?.toString()
                    distanceSelect.innerHTML = ''
                    newDistanceOptions.forEach((dist) => {
                        const option = document.createElement('option')
                        option.value = dist
                        option.textContent = dist
                        if (
                            dist === currentDistanceStr ||
                            dist.toLowerCase() ===
                                currentDistanceStr?.toLowerCase()
                        ) {
                            option.selected = true
                        }
                        distanceSelect.appendChild(option)
                    })

                    const isCurrentDistanceValid = newDistanceOptions.some(
                        (opt) =>
                            opt === currentDistanceStr ||
                            opt.toLowerCase() ===
                                currentDistanceStr?.toLowerCase(),
                    )
                    if (
                        !isCurrentDistanceValid &&
                        newDistanceOptions.length > 0
                    ) {
                        distanceSelect.value = newDistanceOptions[0]
                        if (isDistanceCategory(newDistanceOptions[0])) {
                            currentConfig.track.distance = newDistanceOptions[0]
                        } else {
                            currentConfig.track.distance = parseInt(
                                newDistanceOptions[0],
                                10,
                            )
                        }
                    } else if (newDistanceOptions.length === 0) {
                        currentConfig.track.distance = null
                    }
                }
            } else if (field.key === 'distance') {
                if (isDistanceCategory(value as string)) {
                    currentConfig.track.distance = value as string
                } else {
                    currentConfig.track.distance = parseInt(value as string, 10)
                }
            }

            autoSave()
        })
        wrapper.appendChild(input)

        trackLine.appendChild(wrapper)
    })

    container.appendChild(trackLine)
}

function renderUma(): void {
    if (!currentConfig) return
    const container = document.getElementById('uma-container')
    if (!container) return
    container.innerHTML = ''
    const uma = currentConfig.uma || {}

    const strategyOptions = [
        'Runaway',
        'Front Runner',
        'Pace Chaser',
        'Late Surger',
        'End Closer',
    ]
    const aptitudeOptions = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G']

    interface UmaField {
        key: keyof Uma
        label: string
        type: 'select' | 'number' | 'text'
        options?: string[]
        width: number
    }

    const fields: UmaField[] = [
        { key: 'speed', label: 'SPD', type: 'number', width: 65 },
        { key: 'stamina', label: 'STA', type: 'number', width: 65 },
        { key: 'power', label: 'PWR', type: 'number', width: 65 },
        { key: 'guts', label: 'GUT', type: 'number', width: 65 },
        { key: 'wisdom', label: 'WIT', type: 'number', width: 65 },
        {
            key: 'strategy',
            label: 'Strategy',
            type: 'select',
            options: strategyOptions,
            width: calculateDropdownWidth(strategyOptions),
        },
        {
            key: 'distanceAptitude',
            label: 'Distance',
            type: 'select',
            options: aptitudeOptions,
            width: 35,
        },
        {
            key: 'surfaceAptitude',
            label: 'Surface',
            type: 'select',
            options: aptitudeOptions,
            width: 35,
        },
        {
            key: 'styleAptitude',
            label: 'Style',
            type: 'select',
            options: aptitudeOptions,
            width: 35,
        },
        { key: 'mood', label: 'Mood', type: 'number', width: 45 },
        { key: 'unique', label: 'Unique', type: 'text', width: 280 },
    ]

    const createUmaField = (field: UmaField): HTMLElement => {
        const wrapper = document.createElement('span')
        wrapper.className = 'inline-flex items-center gap-1'

        const label = document.createElement('span')
        label.className = 'text-zinc-300 text-[13px] whitespace-nowrap'
        label.textContent = `${field.label}: `
        wrapper.appendChild(label)

        let input: HTMLInputElement | HTMLSelectElement
        if (field.type === 'select') {
            input = document.createElement('select')
            input.className =
                'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500'
            if (field.width) {
                input.style.width = `${field.width}px`
            }
            field.options?.forEach((opt) => {
                const option = document.createElement('option')
                option.value = opt
                option.textContent = opt
                if (uma[field.key] === opt) {
                    option.selected = true
                }
                input.appendChild(option)
            })
        } else {
            input = document.createElement('input')
            input.type = field.type
            input.className =
                'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500'
            const fieldValue = uma[field.key]
            input.value =
                fieldValue === null || fieldValue === undefined
                    ? ''
                    : String(fieldValue)
            if (field.width) {
                input.style.width = `${field.width}px`
            }
        }

        input.dataset.key = field.key
        input.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement | HTMLSelectElement
            let value: string | number | null
            if (field.type === 'number') {
                const parsed = parseInt(target.value, 10)
                value =
                    target.value === '' || Number.isNaN(parsed) ? null : parsed
            } else {
                value = target.value
            }
            if (!currentConfig) return
            if (!currentConfig.uma) {
                currentConfig.uma = {}
            }
            ;(currentConfig.uma as Record<string, unknown>)[field.key] = value
            autoSave()
        })
        wrapper.appendChild(input)

        return wrapper
    }

    const line = document.createElement('div')
    line.className = 'flex flex-wrap items-center gap-1 mb-2'
    fields.forEach((field) => {
        line.appendChild(createUmaField(field))
    })
    container.appendChild(line)

    const skillsDiv = document.createElement('div')
    skillsDiv.className = 'flex flex-wrap items-center gap-1'
    const skillsWrapper = document.createElement('span')
    skillsWrapper.className = 'inline-flex items-center gap-1 flex-1 min-w-0'
    const skillsLabel = document.createElement('span')
    skillsLabel.className = 'text-zinc-300 text-[13px] whitespace-nowrap mb-2'
    skillsLabel.textContent = 'Skills: '
    skillsWrapper.appendChild(skillsLabel)
    const skillsInput = document.createElement('input')
    skillsInput.type = 'text'
    skillsInput.className =
        'py-1 px-1.5 bg-zinc-700 text-zinc-200 border border-zinc-600 rounded text-[13px] focus:outline-none focus:border-sky-500 flex-1 min-w-0 mb-2'
    skillsInput.value = (uma.skills || []).join(', ')
    skillsInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement
        if (!currentConfig) return
        if (!currentConfig.uma) {
            currentConfig.uma = {}
        }
        currentConfig.uma.skills = target.value
            .split(',')
            .map((s) => getCanonicalSkillName(s.trim()))
            .filter((s) => s.length > 0)
        renderUma()
        autoSave()
    })
    skillsWrapper.appendChild(skillsInput)
    skillsDiv.appendChild(skillsWrapper)
    container.appendChild(skillsDiv)
}

async function saveConfig(): Promise<void> {
    if (!currentConfigFile || !currentConfig) return

    try {
        await fetch(`/api/config/${currentConfigFile}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentConfig),
        })
    } catch (error) {
        console.error('Error saving config:', error)
    }
}

function autoSave(): void {
    if (saveTimeout) {
        clearTimeout(saveTimeout)
    }
    saveTimeout = setTimeout(() => {
        saveConfig()
    }, 500)
}

async function runCalculations(): Promise<void> {
    if (!currentConfigFile) return
    const button = document.getElementById('run-button') as HTMLButtonElement
    const output = document.getElementById('terminal-output') as HTMLPreElement
    if (!button || !output) return
    button.disabled = true
    output.textContent = 'Running calculations...\n'

    if (saveTimeout) {
        clearTimeout(saveTimeout)
    }
    await saveConfig()

    try {
        const response = await fetch(
            `/api/run?configFile=${encodeURIComponent(currentConfigFile)}`,
            {
                method: 'GET',
            },
        )

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        if (!response.body) {
            throw new Error('Response body is null')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
            let result: ReadableStreamReadResult<Uint8Array>
            try {
                result = await reader.read()
            } catch (readError) {
                const err = readError as Error
                console.error('Error reading stream:', readError)
                button.disabled = false
                output.textContent += `\n\nError reading stream: ${err.message}`
                break
            }

            const { done, value } = result
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6)) as {
                            type: string
                            data?: string
                            code?: number | null
                            signal?: string
                            output?: string
                            error?: string
                        }
                        if (data.type === 'started') {
                        } else if (data.type === 'output') {
                            output.textContent += data.data || ''
                            output.scrollTop = output.scrollHeight
                        } else if (data.type === 'done') {
                            button.disabled = false
                            if (
                                data.code !== null &&
                                data.code !== undefined &&
                                data.code !== 0
                            ) {
                                output.textContent += `\n\nProcess exited with code ${data.code}`
                            } else if (data.code === null) {
                                if (data.signal) {
                                    output.textContent += `\n\nProcess terminated by signal: ${data.signal}`
                                } else if (
                                    !data.output ||
                                    data.output.trim().length === 0
                                ) {
                                    output.textContent += `\n\nProcess exited without output. Make sure cli.js is built (run 'npm run build') and all dependencies are available.`
                                }
                            }
                        } else if (data.type === 'error') {
                            button.disabled = false
                            output.textContent += `\n\nError: ${data.error || 'Unknown error'}`
                        }
                    } catch (parseError) {
                        console.error(
                            'Error parsing SSE data:',
                            parseError,
                            line,
                        )
                    }
                }
            }
        }
    } catch (error) {
        const err = error as Error
        button.disabled = false
        output.textContent += `\n\nError: ${err.message}`
    }
}

function resetUmaSkills(): void {
    if (!currentConfig) return
    if (!currentConfig.uma) {
        currentConfig.uma = {}
    }
    currentConfig.uma.skills = []

    if (currentConfig.skills) {
        const skills = currentConfig.skills
        Object.keys(skills).forEach((skillName) => {
            const skill = skills[skillName]
            if (skill.default !== undefined && skill.default !== null) {
                skills[skillName].discount = skill.default
            } else {
                skills[skillName].discount = null
            }
        })
    }

    renderUma()
    renderSkills()
    autoSave()
}

const configSelect = document.getElementById(
    'config-select',
) as HTMLSelectElement
if (configSelect) {
    configSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement
        loadConfig(target.value)
    })
}

const duplicateButton = document.getElementById('duplicate-config-button')
if (duplicateButton) {
    duplicateButton.addEventListener('click', async () => {
        if (!currentConfigFile) {
            alert('No config file selected')
            return
        }

        const newName = prompt('Enter name for duplicated config file:')
        if (!newName || !newName.trim()) {
            return
        }

        let trimmedName = newName.trim()
        if (!trimmedName.toLowerCase().endsWith('.json')) {
            trimmedName += '.json'
        }

        try {
            const response = await fetch(
                `/api/config/${encodeURIComponent(currentConfigFile)}/duplicate`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ newName: trimmedName }),
                },
            )

            if (!response.ok) {
                let errorMessage = 'Failed to duplicate config file'
                try {
                    const error = (await response.json()) as { error?: string }
                    errorMessage = error.error || errorMessage
                } catch {
                    const text = await response.text()
                    errorMessage = text || errorMessage
                }
                alert(`Error: ${errorMessage}`)
                return
            }

            await loadConfigFiles()
            await loadConfig(trimmedName)
        } catch (error) {
            const err = error as Error
            alert(`Error: ${err.message}`)
        }
    })
}

const runButton = document.getElementById('run-button')
if (runButton) {
    runButton.addEventListener('click', runCalculations)
}

const resetButton = document.getElementById('reset-button')
if (resetButton) {
    resetButton.addEventListener('click', resetUmaSkills)
}

const addSkillButton = document.getElementById('add-skill-button')
if (addSkillButton) {
    addSkillButton.addEventListener('click', () => {
        if (!currentConfig) return
        if (!currentConfig.skills) {
            currentConfig.skills = {}
        }
        const newSkillName = 'New Skill'
        let counter = 1
        let finalName = newSkillName
        while (currentConfig.skills[finalName]) {
            finalName = `${newSkillName} ${counter}`
            counter++
        }
        currentConfig.skills[finalName] = {
            discount: 0,
        }
        renderSkills()

        setTimeout(() => {
            const skillItem = document.querySelector(
                `[data-skill="${finalName}"]`,
            )
            if (skillItem) {
                const editButton = skillItem.querySelector('.edit-skill-button')
                if (editButton) {
                    ;(editButton as HTMLElement).click()
                }
            }
        }, 100)

        autoSave()
    })
}

// Set up event delegation for discount buttons (single listener instead of per-button)
function setupSkillsContainerDelegation(): void {
    const container = document.getElementById('skills-container')
    if (!container) return

    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        // Only handle discount button clicks
        if (target.dataset.discount === undefined) return

        const skillName = target.dataset.skill
        const discountValue = target.dataset.discount
        if (!skillName || !discountValue || !currentConfig) return
        const discount = discountValue === '-' ? null : parseInt(discountValue, 10)
        if (!currentConfig.skills[skillName]) {
            currentConfig.skills[skillName] = { discount: null }
        }

        const currentDiscount = currentConfig.skills[skillName].discount
        const isCurrentlyActive =
            (discount === null &&
                (currentDiscount === null || currentDiscount === undefined)) ||
            (discount !== null && currentDiscount === discount)

        if (isCurrentlyActive) {
            const skillDefault = currentConfig.skills[skillName]?.default
            const isCurrentlyDefault =
                (skillDefault !== undefined &&
                    skillDefault !== null &&
                    currentDiscount === skillDefault) ||
                ((skillDefault === undefined || skillDefault === null) &&
                    (currentDiscount === null || currentDiscount === undefined))

            if (isCurrentlyDefault) {
                delete currentConfig.skills[skillName].default
                const baseName = getBaseSkillName(skillName)
                const variants = getVariantsForBaseName(baseName)
                if (variants.length === 2) {
                    variants.forEach((variantName) => {
                        if (currentConfig.skills[variantName]) {
                            delete currentConfig.skills[variantName].default
                        }
                    })
                } else {
                    const otherVariant = getOtherVariant(skillName)
                    if (otherVariant) {
                        const variantsToUpdate = Array.isArray(otherVariant)
                            ? otherVariant
                            : [otherVariant]
                        variantsToUpdate.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                delete currentConfig.skills[variantName].default
                            }
                        })
                    }
                }
            } else {
                if (currentDiscount === null || currentDiscount === undefined) {
                    delete currentConfig.skills[skillName].default
                    const baseName = getBaseSkillName(skillName)
                    const variants = getVariantsForBaseName(baseName)
                    if (variants.length === 2) {
                        variants.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                delete currentConfig.skills[variantName].default
                            }
                        })
                    } else {
                        const otherVariant = getOtherVariant(skillName)
                        if (otherVariant) {
                            const variantsToUpdate = Array.isArray(otherVariant)
                                ? otherVariant
                                : [otherVariant]
                            variantsToUpdate.forEach((variantName) => {
                                if (currentConfig.skills[variantName]) {
                                    delete currentConfig.skills[variantName]
                                        .default
                                }
                            })
                        }
                    }
                } else {
                    currentConfig.skills[skillName].default = currentDiscount
                    const baseName = getBaseSkillName(skillName)
                    const variants = getVariantsForBaseName(baseName)
                    if (variants.length === 2) {
                        variants.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                currentConfig.skills[variantName].default =
                                    currentDiscount
                            }
                        })
                    } else {
                        const otherVariant = getOtherVariant(skillName)
                        if (otherVariant) {
                            const variantsToUpdate = Array.isArray(otherVariant)
                                ? otherVariant
                                : [otherVariant]
                            variantsToUpdate.forEach((variantName) => {
                                if (currentConfig.skills[variantName]) {
                                    currentConfig.skills[variantName].default =
                                        currentDiscount
                                }
                            })
                        }
                    }
                }
            }
        } else {
            currentConfig.skills[skillName].discount =
                discount === null ? null : discount

            const baseName = getBaseSkillName(skillName)
            const variants = getVariantsForBaseName(baseName)
            if (variants.length === 2) {
                if (currentConfig.skills[baseName]) {
                    currentConfig.skills[baseName].discount = discount
                }
                variants.forEach((variantName) => {
                    if (currentConfig.skills[variantName]) {
                        currentConfig.skills[variantName].discount = discount
                    }
                })
            } else {
                const otherVariant = getOtherVariant(skillName)
                if (otherVariant) {
                    const variantsToUpdate = Array.isArray(otherVariant)
                        ? otherVariant
                        : [otherVariant]
                    variantsToUpdate.forEach((variantName) => {
                        if (currentConfig.skills[variantName]) {
                            currentConfig.skills[variantName].discount =
                                discount
                        }
                    })
                    if (
                        currentConfig.skills[baseName] &&
                        !skillName.endsWith(' ○') &&
                        !skillName.endsWith(' ◎')
                    ) {
                        currentConfig.skills[baseName].discount = discount
                    }
                }
            }
        }

        renderSkills()
        autoSave()
    })
}

setupSkillsContainerDelegation()
loadConfigFiles()
