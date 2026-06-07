import './input.css'

// Import API module to register runSelectiveCalculations with resultsUI
import './api'

import { runCalculations } from './api'
import {
    deleteConfig,
    duplicateConfig,
    exportAllConfigs,
    exportConfig,
    importConfig,
    listConfigs,
    loadConfig as loadConfigFromStore,
    saveConfig,
    seedDefaultConfig,
} from './configStore'
import {
    isBareUmalatorConfig,
    isUmalatorEnvelope,
    unwrapBareUmalatorConfig,
    unwrapUmalatorEnvelope,
    wrapConfigForClipboard,
} from './clipboardFormat'
import { convertMoomulatorConfig } from './moomulatorImport'
import {
    deleteConfigFromFilesystem,
    syncConfigsFromFilesystem,
} from './devConfigSync'
import { autoSave, loadConfig, loadConfigFiles } from './configManager'
import { setupPaneResizer } from './paneResizer'
import {
    renderResultsTable,
    setupResultsTableSorting,
    setupSelectAllCheckbox,
} from './resultsUI'
import {
    buildSkillNameLookup,
    buildVariantCache,
    getCanonicalSkillName,
} from './skillHelpers'
import {
    renderSkills,
    setupSkillFilters,
    setupSkillsContainerDelegation,
    setupDiscountWidthObserver,
} from './skillsUI'
import {
    getCalculatedResultsCache,
    getCurrentConfig,
    getCurrentConfigFile,
    getResultsMap,
    getSelectedSkills,
    getSkillmeta,
    getSkillnames,
    setCourseData,
    setSkillData,
    setSkillmeta,
    setSkillNameToId,
    setSkillnames,
    setTrackNames,
} from './state'
import { showToast } from './toast'
import { maybeAutoStartTour, startTour } from './tour'
import { renderTrack } from './trackUI'
import type { Config, CourseData, SkillData, SkillMeta, SkillNames } from './types'
import { renderUma } from './umaUI'

const BASE_URL = import.meta.env.BASE_URL ?? '/'
const GITHUB_ISSUES_URL = 'https://github.com/Martin-Milbradt/umalator/issues/new'
const DISCORD_INVITE_URL = 'https://discord.gg/DvXMyg8J'

async function loadJsonResource<T>(
    filename: string,
    label: string,
    setter: (data: T) => void,
    onSuccess?: () => void,
): Promise<void> {
    try {
        const response = await fetch(`${BASE_URL}data/${filename}`)
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`)
        }
        const data = (await response.json()) as T
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid data received')
        }
        setter(data)
        onSuccess?.()
    } catch {
        showToast({ type: 'error', message: `Failed to load ${label}` })
    }
}

loadJsonResource<SkillNames>('skillnames.json', 'skill names', (skillnames) => {
    setSkillnames(skillnames)
    setSkillNameToId(
        Object.fromEntries(
            Object.entries(skillnames).map(([id, names]) => [names[0], id]),
        ),
    )
    buildVariantCache()
    buildSkillNameLookup()
})

loadJsonResource<SkillMeta>('skill_meta.json', 'skill metadata', setSkillmeta)
loadJsonResource<SkillData>('skill_data.json', 'skill data', setSkillData)
loadJsonResource<CourseData>('course_data.json', 'course data', setCourseData, () => {
    if (getCurrentConfig()) renderTrack()
})
loadJsonResource<Record<string, string[]>>(
    'tracknames.json',
    'track names',
    setTrackNames,
)

function resetUmaSkills(): void {
    const currentConfig = getCurrentConfig()
    const resultsMap = getResultsMap()
    const selectedSkills = getSelectedSkills()
    const calculatedResultsCache = getCalculatedResultsCache()

    if (!currentConfig) return
    if (!currentConfig.uma) {
        currentConfig.uma = {}
    }
    currentConfig.uma.skills = []
    delete currentConfig.uma.skillPoints

    if (currentConfig.skills) {
        const skills = currentConfig.skills
        Object.keys(skills).forEach((skillName) => {
            const skill = skills[skillName]!
            if (skill.default !== undefined && skill.default !== null) {
                skill.discount = skill.default
            } else {
                skill.discount = null
            }
        })
    }

    // Clear results and cache since all discounts changed
    resultsMap.clear()
    selectedSkills.clear()
    calculatedResultsCache.clear()
    renderResultsTable()

    renderUma()
    renderSkills()
    autoSave()
}

// Set up config select handler
const configSelect = document.getElementById(
    'config-select',
) as HTMLSelectElement
if (configSelect) {
    configSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement
        loadConfig(target.value)
    })
}

// Set up run button
const runButton = document.getElementById('run-button')
if (runButton) {
    runButton.addEventListener('click', () => runCalculations())
}

// Set up reset button
const resetButton = document.getElementById('reset-button')
if (resetButton) {
    resetButton.addEventListener('click', resetUmaSkills)
}

// Optional reproducibility seed: blank = fresh random seed each run, a number =
// identical results across runs. Persisted on the config like other settings.
const seedInput = document.getElementById(
    'seed-input',
) as HTMLInputElement | null
if (seedInput) {
    seedInput.addEventListener('change', () => {
        const currentConfig = getCurrentConfig()
        if (!currentConfig) return
        const raw = seedInput.value.trim()
        if (raw === '') {
            currentConfig.seed = null
        } else {
            const parsed = Number(raw)
            if (!Number.isFinite(parsed)) {
                showToast({ type: 'error', message: 'Seed must be a number' })
                seedInput.value =
                    currentConfig.seed != null
                        ? String(currentConfig.seed)
                        : ''
                return
            }
            currentConfig.seed = parsed
        }
        autoSave()
    })
}

// Set up add skill button
const addSkillButton = document.getElementById(
    'add-skill-button',
) as HTMLButtonElement | null

// Pressing "+" anywhere outside an input/select triggers the add-skill button.
// Matches the button's label so it's mnemonic. Inputs/selects keep "+" for
// typing.
document.addEventListener('keydown', (e) => {
    if (e.key !== '+' || e.ctrlKey || e.altKey || e.metaKey) return
    const active = document.activeElement as HTMLElement | null
    if (
        active &&
        (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.tagName === 'SELECT' ||
            active.isContentEditable)
    ) {
        return
    }
    e.preventDefault()
    addSkillButton?.click()
})

if (addSkillButton) {
    addSkillButton.addEventListener('click', () => {
        const currentConfig = getCurrentConfig()
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

        // Open the rename input immediately so the user can type the real name.
        // The name-span click handler creates an <input>, selects its text, and
        // focuses it — typing replaces the "New Skill" placeholder.
        const skillRow = document.querySelector(`[data-skill="${finalName}"]`)
        const nameSpan = skillRow?.querySelector(
            '.skill-name-span',
        ) as HTMLElement | null
        nameSpan?.click()

        autoSave()
    })
}

// Set up event delegation for skills container
setupSkillsContainerDelegation()
setupSkillFilters()

// Make the skills/results split draggable (width on desktop, height on mobile).
setupPaneResizer()

// The discount control swaps between a button row (wide pane) and a dropdown
// (narrow pane), so re-render the skills list whenever the skills pane crosses
// the width threshold (window resize, pane divider drag, etc.).
setupDiscountWidthObserver()

// Set up results table sorting and select-all checkbox
setupResultsTableSorting()
setupSelectAllCheckbox()

// Configs and Help are native action <select>s: picking an option fires the
// corresponding action, then the select resets to its placeholder.
const configMenu = document.getElementById('config-menu') as HTMLSelectElement | null
const helpMenu = document.getElementById('help-menu') as HTMLSelectElement | null
const importInput = document.getElementById(
    'import-config-input',
) as HTMLInputElement

interface ImportDialogResult {
    filename: string
    templateName: string | null
}

interface ImportDialogOptions {
    /** Pre-fill the name input. */
    prefillName?: string
    /**
     * Initial template selection. `null` (and undefined) leaves the dropdown
     * on "(None)"; a string selects that filename if it exists in the list.
     * If neither prefill is provided, defaults to the currently open config.
     */
    defaultTemplate?: string | null
}

function showImportClipboardDialog(
    existingConfigs: string[],
    options: ImportDialogOptions = {},
): Promise<ImportDialogResult | null> {
    const modal = document.getElementById('import-clipboard-modal')
    const nameInput = document.getElementById(
        'import-clipboard-name',
    ) as HTMLInputElement | null
    const templateSelect = document.getElementById(
        'import-clipboard-template',
    ) as HTMLSelectElement | null
    const confirmButton = document.getElementById(
        'import-clipboard-confirm',
    ) as HTMLButtonElement | null
    const cancelButton = document.getElementById(
        'import-clipboard-cancel',
    ) as HTMLButtonElement | null

    if (
        !modal ||
        !nameInput ||
        !templateSelect ||
        !confirmButton ||
        !cancelButton
    ) {
        return Promise.resolve(null)
    }

    nameInput.value = options.prefillName ?? ''
    templateSelect.innerHTML = ''
    const noneOption = document.createElement('option')
    noneOption.value = ''
    noneOption.textContent = '(None — empty skills & track)'
    templateSelect.appendChild(noneOption)
    for (const name of existingConfigs) {
        const opt = document.createElement('option')
        opt.value = name
        opt.textContent = name
        templateSelect.appendChild(opt)
    }
    if (options.defaultTemplate === null) {
        templateSelect.value = ''
    } else if (
        typeof options.defaultTemplate === 'string' &&
        existingConfigs.includes(options.defaultTemplate)
    ) {
        templateSelect.value = options.defaultTemplate
    } else {
        // No explicit default: fall back to the currently open config.
        const currentFile = getCurrentConfigFile()
        if (currentFile && existingConfigs.includes(currentFile)) {
            templateSelect.value = currentFile
        }
    }

    modal.classList.remove('hidden')
    setTimeout(() => nameInput.focus(), 0)

    return new Promise((resolve) => {
        function cleanup(): void {
            modal?.classList.add('hidden')
            confirmButton?.removeEventListener('click', onConfirm)
            cancelButton?.removeEventListener('click', onCancel)
            nameInput?.removeEventListener('keydown', onKey)
            modal?.removeEventListener('click', onBackdrop)
        }
        function onConfirm(): void {
            const rawName = nameInput?.value.trim() ?? ''
            const templateName = templateSelect?.value || null

            let filename: string
            if (rawName) {
                filename = rawName.toLowerCase().endsWith('.json')
                    ? rawName
                    : `${rawName}.json`
            } else if (templateName) {
                // Empty name: target is the template itself.
                filename = templateName
            } else {
                showToast({
                    type: 'error',
                    message: 'Enter a name or pick a template to overwrite',
                })
                nameInput?.focus()
                return
            }

            if (existingConfigs.includes(filename)) {
                const ok = confirm(
                    `Overwrite existing config "${filename}"?`,
                )
                if (!ok) return
            }

            cleanup()
            resolve({ filename, templateName })
        }
        function onCancel(): void {
            cleanup()
            resolve(null)
        }
        function onKey(e: KeyboardEvent): void {
            if (e.key === 'Enter') {
                e.preventDefault()
                onConfirm()
            } else if (e.key === 'Escape') {
                e.preventDefault()
                onCancel()
            }
        }
        function onBackdrop(e: MouseEvent): void {
            if (e.target === modal) onCancel()
        }
        confirmButton.addEventListener('click', onConfirm)
        cancelButton.addEventListener('click', onCancel)
        nameInput.addEventListener('keydown', onKey)
        modal.addEventListener('click', onBackdrop)
    })
}

async function exportCurrentToClipboard(): Promise<void> {
    const currentConfigFile = getCurrentConfigFile()
    const currentConfig = getCurrentConfig()
    if (!currentConfigFile || !currentConfig) {
        showToast({ type: 'error', message: 'No config to export' })
        return
    }
    if (!navigator.clipboard?.writeText) {
        showToast({
            type: 'error',
            message: 'Clipboard write not supported in this browser',
        })
        return
    }
    const payload = wrapConfigForClipboard(currentConfigFile, currentConfig)
    try {
        await navigator.clipboard.writeText(payload)
    } catch (error) {
        showToast({
            type: 'error',
            message: `Clipboard write failed: ${(error as Error).message}`,
        })
        return
    }
    showToast({
        type: 'info',
        message: `Copied ${currentConfigFile} to clipboard`,
    })
}

async function saveImportedConfig(
    filename: string,
    config: Config,
    summary: string,
): Promise<void> {
    try {
        await saveConfig(filename, config)
    } catch (error) {
        showToast({
            type: 'error',
            message: `Save failed: ${(error as Error).message}`,
        })
        return
    }
    await loadConfigFiles()
    await loadConfig(filename)
    showToast({ type: 'info', message: summary })
}

async function importFromClipboard(): Promise<void> {
    if (!navigator.clipboard?.readText) {
        showToast({
            type: 'error',
            message: 'Clipboard read not supported in this browser',
        })
        return
    }

    let text: string
    try {
        text = await navigator.clipboard.readText()
    } catch (error) {
        showToast({
            type: 'error',
            message: `Clipboard read failed: ${(error as Error).message}`,
        })
        return
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        showToast({
            type: 'error',
            message: 'Clipboard does not contain valid JSON',
        })
        return
    }

    const existing = await listConfigs()

    // Native umalator envelope: round-trip the config as-is. Template
    // selection is irrelevant for a complete config; we pre-fill the name
    // from the envelope and default the template dropdown to "(None)".
    if (isUmalatorEnvelope(parsed)) {
        let envelope: { name: string; config: Config }
        try {
            envelope = unwrapUmalatorEnvelope(parsed)
        } catch (error) {
            showToast({
                type: 'error',
                message: `Import failed: ${(error as Error).message}`,
            })
            return
        }
        const choice = await showImportClipboardDialog(existing, {
            prefillName: envelope.name,
            defaultTemplate: null,
        })
        if (!choice) return
        await saveImportedConfig(
            choice.filename,
            envelope.config,
            `Imported ${choice.filename}`,
        )
        return
    }

    // Bare umalator config (no envelope): same save-as-is behaviour, but
    // we have no name to pre-fill.
    if (isBareUmalatorConfig(parsed)) {
        let config: Config
        try {
            config = unwrapBareUmalatorConfig(parsed)
        } catch (error) {
            showToast({
                type: 'error',
                message: `Import failed: ${(error as Error).message}`,
            })
            return
        }
        const choice = await showImportClipboardDialog(existing, {
            defaultTemplate: null,
        })
        if (!choice) return
        await saveImportedConfig(
            choice.filename,
            config,
            `Imported ${choice.filename}`,
        )
        return
    }

    // Otherwise treat as moomulator-shaped data.
    const skillnames = getSkillnames()
    const skillmeta = getSkillmeta()
    if (!skillnames || !skillmeta) {
        showToast({
            type: 'error',
            message: 'Skill data not loaded yet — try again in a moment',
        })
        return
    }

    const choice = await showImportClipboardDialog(existing)
    if (!choice) return

    let template: Config | null = null
    if (choice.templateName) {
        try {
            template = await loadConfigFromStore(choice.templateName)
        } catch (error) {
            showToast({
                type: 'error',
                message: `Template load failed: ${(error as Error).message}`,
            })
            return
        }
    }

    let result: ReturnType<typeof convertMoomulatorConfig>
    try {
        result = convertMoomulatorConfig(
            parsed,
            skillnames,
            skillmeta,
            template,
        )
    } catch (error) {
        showToast({
            type: 'error',
            message: `Import failed: ${(error as Error).message}`,
        })
        return
    }

    const unknownCount = result.unknownSkillIds.length
    const summary =
        unknownCount > 0
            ? `Imported ${choice.filename} (${unknownCount} unknown skill${unknownCount === 1 ? '' : 's'} skipped)`
            : `Imported ${choice.filename}`
    await saveImportedConfig(choice.filename, result.config, summary)
}

async function handleConfigMenuAction(action: string): Promise<void> {
    if (action === 'duplicate-current') {
        const currentConfigFile = getCurrentConfigFile()
        if (!currentConfigFile) {
            showToast({ type: 'info', message: 'No config file selected' })
            return
        }
        const newName = prompt('Enter name for duplicated config file:')
        if (!newName || !newName.trim()) return
        let trimmedName = newName.trim()
        if (!trimmedName.toLowerCase().endsWith('.json')) {
            trimmedName += '.json'
        }
        try {
            await duplicateConfig(currentConfigFile, trimmedName)
            await loadConfigFiles()
            await loadConfig(trimmedName)
        } catch (error) {
            showToast({
                type: 'error',
                message: `Duplicate failed: ${(error as Error).message}`,
            })
        }
        return
    }
    if (action === 'export-current') {
        const currentConfigFile = getCurrentConfigFile()
        const currentConfig = getCurrentConfig()
        if (!currentConfigFile || !currentConfig) return
        exportConfig(currentConfigFile, currentConfig)
        return
    }
    if (action === 'export-all') {
        try {
            const count = await exportAllConfigs()
            if (count === 0) {
                showToast({ type: 'info', message: 'No configs to export' })
            } else {
                showToast({
                    type: 'info',
                    message: `Exported ${count} config${count === 1 ? '' : 's'}`,
                })
            }
        } catch (error) {
            showToast({
                type: 'error',
                message: `Export failed: ${(error as Error).message}`,
            })
        }
        return
    }
    if (action === 'export-clipboard') {
        await exportCurrentToClipboard()
        return
    }
    if (action === 'import') {
        importInput?.click()
        return
    }
    if (action === 'import-clipboard') {
        await importFromClipboard()
        return
    }
    if (action === 'delete-current') {
        const currentConfigFile = getCurrentConfigFile()
        if (!currentConfigFile) return
        if (!confirm(`Delete config "${currentConfigFile}"? This cannot be undone.`)) {
            return
        }
        try {
            await deleteConfig(currentConfigFile)
            deleteConfigFromFilesystem(currentConfigFile)
            showToast({ type: 'info', message: `Deleted ${currentConfigFile}` })
            await loadConfigFiles()
        } catch (error) {
            showToast({
                type: 'error',
                message: `Delete failed: ${(error as Error).message}`,
            })
        }
    }
}

if (configMenu) {
    configMenu.addEventListener('change', async () => {
        const action = configMenu.value
        configMenu.value = ''
        if (action) await handleConfigMenuAction(action)
    })
}

if (importInput) {
    importInput.addEventListener('change', async () => {
        const files = Array.from(importInput.files ?? [])
        if (files.length === 0) return

        const imported: string[] = []
        const failed: Array<{ name: string; message: string }> = []
        for (const file of files) {
            try {
                const { name } = await importConfig(file)
                imported.push(name)
            } catch (error) {
                failed.push({
                    name: file.name,
                    message: (error as Error).message,
                })
            }
        }

        if (imported.length > 0) {
            await loadConfigFiles()
            await loadConfig(imported[imported.length - 1]!)
        }

        if (imported.length > 0) {
            showToast({
                type: 'info',
                message:
                    imported.length === 1
                        ? `Imported ${imported[0]}`
                        : `Imported ${imported.length} configs`,
            })
        }
        for (const f of failed) {
            showToast({
                type: 'error',
                message: `Import failed (${f.name}): ${f.message}`,
            })
        }

        importInput.value = ''
    })
}

function handleHelpMenuAction(action: string): void {
    if (action === 'about') {
        window.location.href = `${BASE_URL}help.html`
    } else if (action === 'tour') {
        startTour()
    } else if (action === 'issue') {
        window.open(GITHUB_ISSUES_URL, '_blank', 'noopener')
    } else if (action === 'contact') {
        window.open(DISCORD_INVITE_URL, '_blank', 'noopener')
    }
}

if (helpMenu) {
    helpMenu.addEventListener('change', () => {
        const action = helpMenu.value
        helpMenu.value = ''
        if (action) handleHelpMenuAction(action)
    })
}

// In dev: sync configs from filesystem; in prod: seed default config
const initConfigs = import.meta.env.DEV
    ? syncConfigsFromFilesystem()
    : seedDefaultConfig()
initConfigs
    .then(() => loadConfigFiles())
    .catch(() => loadConfigFiles())
    .finally(() => maybeAutoStartTour())
