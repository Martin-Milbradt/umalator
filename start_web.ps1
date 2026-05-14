# Start the web UI server and open it in the browser
$ErrorActionPreference = "Stop"

# Change to script directory
Set-Location $PSScriptRoot

# Check if uma-tools exists, clone if it doesn't
$umaToolsPath = Join-Path $PSScriptRoot ".." "uma-tools"
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

# Update submodules to the commits pinned in the parent repo.
# uma-skill-tools needs a specific commit (24f0a88) which is one commit
# ahead of upstream master. We depend on two unmerged changes from it:
#   1. the otherHorse() API used by uma-tools/umalator/compare.ts
#   2. mood/popularity moved from RaceParameters onto HorseParameters
# The uma-tools submodule itself records an older uma-skill-tools
# commit, so we re-checkout 24f0a88 here (and in CI) after init.
Write-Host "Updating submodules..."
git submodule update --init uma-tools
if (Test-Path $umaToolsPath) {
    Push-Location (Join-Path $umaToolsPath "uma-skill-tools")
    git fetch origin 24f0a8862106dd4aaeea55e90e975acc9ca5d019
    git checkout 24f0a8862106dd4aaeea55e90e975acc9ca5d019
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed to update uma-skill-tools, continuing anyway..."
    }
    Pop-Location
}

# Build workers before starting servers
Write-Host "Building workers..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Worker build failed!"
    exit 1
}

# Start Express server + Vite dev server in a new window using whichever
# PowerShell ran this script (so a pwsh launcher spawns pwsh, not the old
# Windows PowerShell, while still working for contributors without pwsh).
$startCommand = "Set-Location '$PSScriptRoot'; npm run dev:server"
$shellExe = (Get-Process -Id $PID).Path
Start-Process $shellExe -ArgumentList "-NoExit", "-Command", $startCommand

Start-Sleep 2

# Open the browser (Vite dev server)
Start-Process "http://localhost:5173"
