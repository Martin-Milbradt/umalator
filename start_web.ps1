# Start the web UI server and open it in the browser
$ErrorActionPreference = "Stop"

# Change to script directory
Set-Location $PSScriptRoot

# uma-tools is an in-repo submodule (with a nested uma-skill-tools submodule).
$umaToolsPath = Join-Path $PSScriptRoot "uma-tools"
if (-not (Test-Path $umaToolsPath)) {
    Write-Host "uma-tools repository not found. Attempting to clone..."
    $parentDir = Split-Path $PSScriptRoot -Parent
    Push-Location $parentDir

    $repoUrl = "https://github.com/alpha123/uma-tools"
    Write-Host "Cloning from: $repoUrl (with submodules)..."
    git clone --recurse-submodules $repoUrl
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to clone uma-tools repository. Please clone it manually to: $umaToolsPath"
        Pop-Location
        exit 1
    }
    Pop-Location

    # Initial setup steps
    Write-Host "Initial setup, successive starts will be faster."

    # Install dependencies
    Write-Host "Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install dependencies!"
        exit 1
    }

    # Rebuild the project
    Write-Host "Rebuilding project..."
    npx tsx build.ts
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed!"
        exit 1
    }

    # Ensure default.json exists
    $defaultConfigPath = "configs\default.json"
    $exampleConfigPath = "configs\config.example.json"
    if (-not (Test-Path $defaultConfigPath)) {
        if (Test-Path $exampleConfigPath) {
            Write-Host "Creating default.json from config.example.json..."
            Copy-Item $exampleConfigPath $defaultConfigPath
        }
        else {
            Write-Warning "config.example.json not found, skipping default.json creation"
        }
    }
}

# Update submodules, then re-pin the nested uma-skill-tools to the loose commit
# we depend on. scripts/pin-submodule.mjs owns the SHA and the rationale; see it
# (and docs/cloud-setup.md) for why a plain submodule update lands on the wrong
# commit.
Write-Host "Updating submodules and pinning uma-skill-tools..."
git submodule update --init --recursive uma-tools
node scripts/pin-submodule.mjs --strict
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to pin uma-skill-tools, continuing anyway..."
}

# Build workers before starting servers
Write-Host "Building workers..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Worker build failed!"
    exit 1
}

# Start the Vite dev server in a new window using whichever PowerShell ran
# this script (so a pwsh launcher spawns pwsh, not the old Windows PowerShell,
# while still working for contributors without pwsh). Vite serves the data and
# syncs configs with the configs/ folder; simulations run in browser Web
# Workers, so the legacy Express server (server.ts, :3000) is not needed and
# would only add a second origin with its own, unshared IndexedDB.
$startCommand = "Set-Location '$PSScriptRoot'; npx vite"
$shellExe = (Get-Process -Id $PID).Path
Start-Process $shellExe -ArgumentList "-NoExit", "-Command", $startCommand

Start-Sleep 2

# Open the browser (Vite dev server)
Start-Process "http://localhost:5173"
