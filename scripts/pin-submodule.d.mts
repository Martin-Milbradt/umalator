/** The uma-skill-tools commit the app depends on (full 40-char SHA). */
export declare const TARGET_SHA: string

/** Whether the submodule HEAD differs from the commit we depend on. */
export declare function shouldPin(currentSha: string | undefined | null): boolean
