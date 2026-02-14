import * as esbuild from 'esbuild'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import * as path from 'node:path'

const root = path.join(import.meta.dirname, 'uma-tools')
const nodeModulesPath = path.join(import.meta.dirname, 'node_modules')

const resolveNodeModules: esbuild.Plugin = {
    name: 'resolveNodeModules',
    setup(build) {
        build.onResolve({ filter: /^[^./]|^\.[^./]|^\.\.[^/]/ }, (args) => {
            if (args.path.startsWith('.') || path.isAbsolute(args.path)) {
                return null
            }
            const packageDir = path.join(nodeModulesPath, args.path)
            const packageJsonPath = path.join(packageDir, 'package.json')

            if (existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(
                        readFileSync(packageJsonPath, 'utf-8'),
                    )
                    const main =
                        packageJson.main || packageJson.module || 'index.js'
                    const mainPath = path.join(packageDir, main)
                    if (existsSync(mainPath)) {
                        return { path: mainPath }
                    }
                    const indexPath = path.join(packageDir, 'index.js')
                    if (existsSync(indexPath)) {
                        return { path: indexPath }
                    }
                } catch {
                    // Fall through
                }
            }

            const directPath = path.join(nodeModulesPath, `${args.path}.js`)
            if (existsSync(directPath)) {
                return { path: directPath }
            }

            return null
        })
    },
}

const redirectData: esbuild.Plugin = {
    name: 'redirectData',
    setup(build) {
        build.onResolve({ filter: /skill_data\.json$/ }, () => ({
            path: path.join(root, 'umalator-global', 'skill_data.json'),
        }))
        build.onResolve({ filter: /skill_meta\.json$/ }, () => ({
            path: path.join(root, 'umalator-global', 'skill_meta.json'),
        }))
        build.onResolve({ filter: /course_data\.json$/ }, () => ({
            path: path.join(root, 'umalator-global', 'course_data.json'),
        }))
        build.onResolve({ filter: /skillnames\.json$/ }, () => ({
            path: path.join(root, 'umalator-global', 'skillnames.json'),
        }))
    },
}

/** Mock node:assert for browser builds (same pattern as uma-tools/umalator-global/build.mjs) */
const mockAssert: esbuild.Plugin = {
    name: 'mockAssert',
    setup(build) {
        build.onResolve({ filter: /^node:assert$/ }, (args) => ({
            path: args.path,
            namespace: 'mockAssert-ns',
        }))
        build.onLoad({ filter: /.*/, namespace: 'mockAssert-ns' }, () => ({
            contents: 'module.exports={strict:function(){}};',
            loader: 'js',
        }))
    },
}

/** Mock node:worker_threads for browser builds (parentPort/workerData stay null so the Node entry guard is skipped) */
const mockNodeWorkerThreads: esbuild.Plugin = {
    name: 'mockNodeWorkerThreads',
    setup(build) {
        build.onResolve({ filter: /^node:worker_threads$/ }, (args) => ({
            path: args.path,
            namespace: 'mockWorkerThreads-ns',
        }))
        build.onLoad(
            { filter: /.*/, namespace: 'mockWorkerThreads-ns' },
            () => ({
                contents:
                    'module.exports={parentPort:null,workerData:null,Worker:function(){}};',
                loader: 'js',
            }),
        )
    },
}

const nodeBuiltins = [
    'assert',
    'async_hooks',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'constants',
    'crypto',
    'dgram',
    'dns',
    'domain',
    'events',
    'fs',
    'http',
    'http2',
    'https',
    'inspector',
    'module',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'punycode',
    'querystring',
    'readline',
    'repl',
    'stream',
    'string_decoder',
    'timers',
    'tls',
    'trace_events',
    'tty',
    'url',
    'util',
    'v8',
    'vm',
    'worker_threads',
    'zlib',
]

const markNodeBuiltinsExternal: esbuild.Plugin = {
    name: 'markNodeBuiltinsExternal',
    setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
            if (args.path.startsWith('node:')) {
                return { external: true }
            }
            if (nodeBuiltins.includes(args.path)) {
                return { external: true }
            }
            return null
        })
    },
}

const requirePolyfill = `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`

// --- Node worker build (existing) ---
const workerBuildOptions: esbuild.BuildOptions = {
    entryPoints: ['simulation.worker.ts'],
    bundle: true,
    platform: 'node',
    target: 'node25',
    format: 'esm',
    outfile: 'simulation.worker.js',
    define: { CC_GLOBAL: 'true' },
    external: [...nodeBuiltins],
    mainFields: ['module', 'main'],
    banner: {
        js: requirePolyfill,
    },
    plugins: [markNodeBuiltinsExternal, resolveNodeModules, redirectData],
}

// --- Browser worker build (new) ---
const browserWorkerBuildOptions: esbuild.BuildOptions = {
    entryPoints: ['simulation.browser-worker.ts'],
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    outfile: 'static/simulation.browser-worker.js',
    define: { CC_GLOBAL: 'true' },
    mainFields: ['module', 'main'],
    plugins: [mockAssert, mockNodeWorkerThreads, resolveNodeModules, redirectData],
}

// --- Copy uma-tools data files to static/data/ ---
function copyDataFiles(): void {
    const dataDir = path.join(import.meta.dirname, 'static', 'data')
    mkdirSync(dataDir, { recursive: true })

    const files = [
        'course_data.json',
        'skill_data.json',
        'skill_meta.json',
        'skillnames.json',
        'tracknames.json',
    ]
    const sourceDir = path.join(root, 'umalator-global')

    for (const file of files) {
        const src = path.join(sourceDir, file)
        const dest = path.join(dataDir, file)
        copyFileSync(src, dest)
    }

    // Copy example config for seeding IndexedDB on first visit
    const exampleSrc = path.join(import.meta.dirname, 'configs', 'config.example.json')
    if (existsSync(exampleSrc)) {
        copyFileSync(exampleSrc, path.join(dataDir, 'config.example.json'))
    }
}

try {
    copyDataFiles()
    await Promise.all([
        esbuild.build(workerBuildOptions),
        esbuild.build(browserWorkerBuildOptions),
    ])
} catch (error) {
    console.error('Build failed:', error)
    process.exit(1)
}
