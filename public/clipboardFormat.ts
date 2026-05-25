/**
 * Wire format for round-tripping a full umalator config through the
 * clipboard. The discriminator `format: "umalator-config"` lets the
 * importer tell our exports apart from foreign formats (moomulator etc.).
 */
import { validateConfigData } from './configStore'
import type { Config } from './types'

export const UMALATOR_FORMAT_ID = 'umalator-config'

export interface UmalatorEnvelope {
    format: typeof UMALATOR_FORMAT_ID
    name: string
    config: Config
}

export function wrapConfigForClipboard(name: string, config: Config): string {
    const envelope: UmalatorEnvelope = {
        format: UMALATOR_FORMAT_ID,
        name,
        config,
    }
    return JSON.stringify(envelope, null, 4)
}

export function isUmalatorEnvelope(data: unknown): boolean {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return false
    }
    return (data as Record<string, unknown>).format === UMALATOR_FORMAT_ID
}

/**
 * A bare umalator config — same shape `validateConfigData` accepts, no
 * envelope. Distinguishable from moomulator data (which carries `skills` as
 * an array of IDs) by `skills` being a plain object.
 */
export function isBareUmalatorConfig(data: unknown): boolean {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return false
    }
    if (isUmalatorEnvelope(data)) return false
    const skills = (data as Record<string, unknown>).skills
    return (
        typeof skills === 'object' &&
        skills !== null &&
        !Array.isArray(skills)
    )
}

export function unwrapBareUmalatorConfig(data: unknown): Config {
    if (!isBareUmalatorConfig(data)) {
        throw new Error('Not a bare umalator config')
    }
    return validateConfigData(data)
}

export function unwrapUmalatorEnvelope(data: unknown): {
    name: string
    config: Config
} {
    if (!isUmalatorEnvelope(data)) {
        throw new Error('Not a umalator-config envelope')
    }
    const obj = data as Record<string, unknown>
    if (typeof obj.name !== 'string' || !obj.name.trim()) {
        throw new Error('Envelope is missing a valid "name" field')
    }
    if (typeof obj.config !== 'object' || obj.config === null) {
        throw new Error('Envelope is missing a valid "config" field')
    }
    const config = validateConfigData(obj.config)
    return { name: obj.name, config }
}
