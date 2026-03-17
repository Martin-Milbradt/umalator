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

# Update uma-tools submodule to the commit pinned by umalator, then pull
# latest uma-skill-tools from upstream. We do NOT pull uma-tools master because
# upstream compare.ts uses an unreleased otherHorse() API that isn't in any
# published uma-skill-tools yet (alpha123 builds from a local copy).
Write-Host "Updating uma-tools submodule..."
git submodule update --init --recursive
if (Test-Path $umaToolsPath) {
    Push-Location (Join-Path $umaToolsPath "uma-skill-tools")
    git fetch origin
    git checkout origin/master
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed to update uma-skill-tools, continuing anyway..."
    }
    Pop-Location
}

# Build frontend before starting the server
Write-Host "Building frontend..."
npm run build:frontend
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed!"
    exit 1
}

# Start the server in a new window
$startCommand = "Set-Location '$PSScriptRoot'; npx tsx server.ts"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $startCommand

Start-Sleep 1

# Open the browser
Start-Process "http://localhost:3000"
