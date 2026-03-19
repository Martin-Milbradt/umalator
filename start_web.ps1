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

# Update submodules. uma-skill-tools needs a specific commit (24f0a88) that
# has the otherHorse() API required by upstream uma-tools compare.ts.
# This commit is not yet on uma-skill-tools master, so we fetch it by SHA.
Write-Host "Updating uma-tools submodule..."
git submodule update --init --remote uma-tools
if (Test-Path $umaToolsPath) {
    Push-Location (Join-Path $umaToolsPath "uma-skill-tools")
    git fetch origin 24f0a8862106dd4aaeea55e90e975acc9ca5d019
    git checkout 24f0a8862106dd4aaeea55e90e975acc9ca5d019
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
