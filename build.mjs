import * as esbuild from "esbuild";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, "..", "uma-tools");
const nodeModulesPath = path.join(dirname, "node_modules");

const resolveNodeModules = {
    name: "resolveNodeModules",
    setup(build) {
        build.onResolve({ filter: /^[^./]|^\.[^./]|^\.\.[^/]/ }, (args) => {
            if (args.path.startsWith(".") || path.isAbsolute(args.path)) {
                return null;
            }
            const packageDir = path.join(nodeModulesPath, args.path);
            const packageJsonPath = path.join(packageDir, "package.json");

            if (existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
                    const main = packageJson.main || packageJson.module || "index.js";
                    const mainPath = path.join(packageDir, main);
                    if (existsSync(mainPath)) {
                        return { path: mainPath };
                    }
                    const indexPath = path.join(packageDir, "index.js");
                    if (existsSync(indexPath)) {
                        return { path: indexPath };
                    }
                } catch (e) {
                    // Fall through
                }
            }

            const directPath = path.join(nodeModulesPath, args.path + ".js");
            if (existsSync(directPath)) {
                return { path: directPath };
            }

            return null;
        });
    },
};

const redirectData = {
    name: "redirectData",
    setup(build) {
        build.onResolve({ filter: /skill_data\.json$/ }, (args) => ({
            path: path.join(root, "umalator-global", "skill_data.json"),
        }));
        build.onResolve({ filter: /skill_meta\.json$/ }, (args) => ({
            path: path.join(root, "umalator-global", "skill_meta.json"),
        }));
        build.onResolve({ filter: /course_data\.json$/ }, (args) => ({
            path: path.join(root, "umalator-global", "course_data.json"),
        }));
        build.onResolve({ filter: /skillnames\.json$/ }, (args) => ({
            path: path.join(root, "umalator-global", "skillnames.json"),
        }));
    },
};

const buildOptions = {
    entryPoints: ["cli.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: "cli.js",
    define: { CC_GLOBAL: "false" },
    plugins: [resolveNodeModules, redirectData],
};

const workerBuildOptions = {
    entryPoints: ["simulation.worker.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: "simulation.worker.js",
    define: { CC_GLOBAL: "false" },
    plugins: [resolveNodeModules, redirectData],
};

try {
    await Promise.all([esbuild.build(buildOptions), esbuild.build(workerBuildOptions)]);
} catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
}
