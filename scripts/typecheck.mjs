// Type-check the project, ignoring the expected errors from the uma-tools
// submodule. Our own files must compile cleanly; uma-tools is upstream code we
// never modify and whose loose typings would otherwise drown out real errors
// (see CLAUDE.md: "Ignore type checking errors from ./uma-tools"). tsc still has
// to parse uma-tools because our code imports it, so we filter its errors out by
// path here rather than disabling the check.
import { spawnSync } from 'node:child_process'

// shell:true is needed so Windows resolves the `npx` shim; pass the whole
// command as one string (not args) to avoid Node's shell-args deprecation.
const result = spawnSync('npx tsc --noEmit --pretty false', {
    encoding: 'utf-8',
    shell: true,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
const ownErrors = output
    .split('\n')
    .filter((line) => /error TS\d+/.test(line))
    .filter((line) => !line.replace(/\\/g, '/').includes('uma-tools/'))

if (ownErrors.length > 0) {
    console.error(`Type errors outside uma-tools (${ownErrors.length}):`)
    console.error(ownErrors.join('\n'))
    process.exit(1)
}

console.log('Typecheck clean (uma-tools import errors ignored by design).')
