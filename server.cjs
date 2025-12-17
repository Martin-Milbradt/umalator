const express = require("express");
const { readFileSync, writeFileSync, readdirSync, statSync, watch, existsSync } = require("fs");
const { resolve, join } = require("path");
const { spawn } = require("child_process");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

const configDir = join(__dirname, "configs");

const configWatchers = new Map();
let fileChangeListeners = [];

function getConfigFiles() {
    const files = readdirSync(configDir);
    return files.map((file) => ({
        name: file,
        path: join(configDir, file),
    }));
}

app.get("/api/configs", (req, res) => {
    try {
        const configs = getConfigFiles();
        res.json(configs.map((c) => c.name).filter((name) => name !== "config.example.json"));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/skillnames", (req, res) => {
    const skillnamesPath = resolve(__dirname, "..", "uma-tools", "umalator-global", "skillnames.json");
    const content = readFileSync(skillnamesPath, "utf-8");
    const skillnames = JSON.parse(content);
    res.json(skillnames);
});

app.get("/api/skillmeta", (req, res) => {
    const skillmetaPath = resolve(__dirname, "..", "uma-tools", "umalator-global", "skill_meta.json");
    const content = readFileSync(skillmetaPath, "utf-8");
    const skillmeta = JSON.parse(content);
    res.json(skillmeta);
});

app.get("/api/coursedata", (req, res) => {
    try {
        const courseDataPath = resolve(__dirname, "..", "uma-tools", "umalator-global", "course_data.json");
        const content = readFileSync(courseDataPath, "utf-8");
        const courseData = JSON.parse(content);
        res.json(courseData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/config/:filename", (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = join(configDir, filename);
        const content = readFileSync(filePath, "utf-8");
        const config = JSON.parse(content);
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/config/:filename", (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = join(configDir, filename);
        writeFileSync(filePath, JSON.stringify(req.body, null, 2), "utf-8");
        notifyFileChange(filename);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/config/:filename/duplicate", (req, res) => {
    try {
        const filename = req.params.filename;
        const { newName } = req.body;

        if (!newName || typeof newName !== "string" || !newName.trim()) {
            res.status(400).json({ error: "newName is required and must be a non-empty string" });
            return;
        }

        const sourcePath = join(configDir, filename);
        const targetPath = join(configDir, newName.trim());

        if (!existsSync(sourcePath)) {
            res.status(404).json({ error: `Source config file "${filename}" not found` });
            return;
        }

        if (existsSync(targetPath)) {
            res.status(409).json({ error: `Config file "${newName.trim()}" already exists` });
            return;
        }

        const content = readFileSync(sourcePath, "utf-8");
        writeFileSync(targetPath, content, "utf-8");
        notifyFileChange(newName.trim());
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function notifyFileChange(filename) {
    fileChangeListeners.forEach((listener) => {
        try {
            listener.write(`data: ${JSON.stringify({ type: "fileChanged", filename })}\n\n`);
        } catch (error) {
            console.error("Error notifying file change:", error);
        }
    });
}

function watchConfigFile(filename) {
    if (configWatchers.has(filename)) {
        return;
    }

    try {
        const filePath = join(configDir, filename);
        const watcher = watch(filePath, (eventType, changedFilename) => {
            if (eventType === "change") {
                setTimeout(() => {
                    notifyFileChange(filename);
                }, 100);
            }
        });

        watcher.on("error", (error) => {
            console.error(`Error watching file ${filename}:`, error);
            configWatchers.delete(filename);
        });

        configWatchers.set(filename, watcher);
    } catch (error) {
        console.error(`Error setting up watcher for ${filename}:`, error);
    }
}

app.get("/api/run", (req, res) => {
    const configFile = req.query.configFile;

    if (!configFile) {
        res.status(400).json({ error: "configFile parameter required" });
        return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const cliPath = resolve(__dirname, "cli.js");

    if (!existsSync(cliPath)) {
        res.write(
            `data: ${JSON.stringify({ type: "error", error: "CLI not built. Please run 'npm run build' first." })}\n\n`
        );
        res.end();
        return;
    }

    res.write(`data: ${JSON.stringify({ type: "started" })}\n\n`);
    if (res.flushHeaders) {
        res.flushHeaders();
    }

    const keepAlive = setInterval(() => {
        if (!requestClosed) {
            try {
                res.write(`: keepalive\n\n`);
            } catch (error) {
                console.error("Error sending keepalive:", error);
                requestClosed = true;
                clearInterval(keepAlive);
            }
        } else {
            clearInterval(keepAlive);
        }
    }, 30000);

    let child = null;
    let processStarted = false;
    let requestClosed = false;

    try {
        child = spawn("node", [cliPath, configFile], {
            cwd: __dirname,
            stdio: ["ignore", "pipe", "pipe"],
            shell: false,
            env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
        });
        processStarted = true;
        console.log(`Process spawned with PID: ${child.pid}`);
    } catch (error) {
        console.error("Error spawning process:", error);
        res.write(`data: ${JSON.stringify({ type: "error", error: `Failed to spawn process: ${error.message}` })}\n\n`);
        res.end();
        return;
    }

    let output = "";
    let hasOutput = false;
    let stderrOutput = "";

    const sendData = (data) => {
        if (requestClosed) {
            console.log("Skipping output write - request already closed");
            return;
        }
        const dataStr = data.toString();
        output += dataStr;
        hasOutput = true;
        try {
            res.write(`data: ${JSON.stringify({ type: "output", data: dataStr })}\n\n`);
        } catch (error) {
            console.error("Error writing to response:", error);
            requestClosed = true;
        }
    };

    const sendStderr = (data) => {
        const dataStr = data.toString();
        stderrOutput += dataStr;
        console.error(`CLI stderr:`, dataStr);
        sendData(dataStr);
    };

    child.stdout.on("data", sendData);
    child.stderr.on("data", sendStderr);

    child.stdout.on("error", (error) => {
        console.error("stdout error:", error);
    });

    child.stderr.on("error", (error) => {
        console.error("stderr error:", error);
    });

    child.on("close", (code, signal) => {
        if (stderrOutput) {
            console.error("Stderr content:", stderrOutput);
        }

        if (requestClosed) {
            console.log("Response already closed, skipping final write");
            return;
        }

        try {
            if (!hasOutput && !output && !stderrOutput) {
                res.write(
                    `data: ${JSON.stringify({
                        type: "error",
                        error: `Process exited without producing output. Exit code: ${code}, Signal: ${signal}. Make sure cli.js is built and dependencies are available.`,
                    })}\n\n`
                );
            } else if (code !== null) {
                res.write(`data: ${JSON.stringify({ type: "done", code, output })}\n\n`);
            } else if (signal) {
                res.write(`data: ${JSON.stringify({ type: "done", code: null, signal, output })}\n\n`);
            } else {
                res.write(`data: ${JSON.stringify({ type: "done", code: null, output })}\n\n`);
            }
            res.end();
        } catch (error) {
            console.error("Error writing final response:", error);
        }
    });

    child.on("error", (error) => {
        const errorMsg = `Failed to start process: ${error.message}`;
        console.error("CLI spawn error:", error);
        res.write(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`);
        res.end();
    });

    const timeout = setTimeout(() => {
        if (!child.killed) {
            console.log("Process timeout, killing child process");
            child.kill("SIGTERM");
            res.write(
                `data: ${JSON.stringify({
                    type: "error",
                    error: "Process timed out after 5 minutes",
                })}\n\n`
            );
            res.end();
        }
    }, 5 * 60 * 1000);

    child.on("close", () => {
        clearTimeout(timeout);
    });

    req.on("close", () => {
        requestClosed = true;
        clearInterval(keepAlive);
        clearTimeout(timeout);
        if (child && !child.killed && processStarted) {
            child.kill("SIGTERM");
        }
    });

    req.on("aborted", () => {
        console.log("Request aborted by client");
        requestClosed = true;
        clearInterval(keepAlive);
        clearTimeout(timeout);
        if (child && !child.killed && processStarted) {
            console.log("Killing child process due to request abort");
            child.kill("SIGTERM");
        }
    });

    child.on("close", () => {
        clearInterval(keepAlive);
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
