import * as esbuild from 'esbuild'
import * as path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

const root = path.join(import.meta.dirname, '..', 'uma-tools')
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

try {
    await esbuild.build(workerBuildOptions)
} catch (error) {
    console.error('Build failed:', error)
    process.exit(1)
}
