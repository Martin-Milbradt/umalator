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

# Take the latest upstream master for uma-tools (game data/UI) and the nested
# uma-skill-tools (simulation engine) on every start; the script keeps the
# current checkout when offline. See scripts/update-submodules.mjs (and
# docs/cloud-setup.md) for why a plain submodule update lands on the wrong
# commit.
if (-not (Test-Path (Join-Path $umaToolsPath ".git"))) {
    Write-Host "Initialising submodules..."
    git submodule update --init --recursive uma-tools
}
Write-Host "Updating submodules to upstream master..."
node scripts/update-submodules.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to update submodules, continuing with the current checkout..."
}

# CI and the deploy update to upstream master themselves, so the committed
# gitlink is only a recorded baseline; commit it occasionally so fresh clones
# start close to current.
$recorded = (git ls-tree HEAD uma-tools) -split '\s+' | Select-Object -Index 2
$actual = git -C uma-tools rev-parse HEAD
if ($recorded -and $actual -and $recorded -ne $actual) {
    Write-Host "uma-tools is on $($actual.Substring(0,7)) but the last commit records $($recorded.Substring(0,7))." -ForegroundColor Yellow
    Write-Host "To record the baseline, commit the submodule pointer: git add uma-tools" -ForegroundColor Yellow
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
