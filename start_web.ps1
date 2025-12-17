# Start the web UI server and open it in the browser
$ErrorActionPreference = "Stop"

# Change to script directory
Set-Location $PSScriptRoot

# Clone or update uma-tools repository
$umaToolsPath = "..\uma-tools"

if (Test-Path $umaToolsPath) {
    Write-Host "Pulling latest changes from uma-tools..."
    Push-Location $umaToolsPath
    git pull
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed to pull uma-tools, continuing anyway..."
    }

    Write-Host "Updating submodules..."
    git submodule update --init --recursive
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed to update submodules, continuing anyway..."
    }
    Pop-Location
}
else {
    Write-Host "Initial setup, successive starts will be faster."
    Write-Host "Cloning uma-tools repository with submodules..."
    git clone --recurse-submodules https://github.com/alpha123/uma-tools $umaToolsPath
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to clone uma-tools!"
        exit 1
    }
}

# Install dependencies
Write-Host "Installing dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install dependencies!"
    exit 1
}

# Rebuild the project
Write-Host "Rebuilding project..."
node build.mjs
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

# Start the server in a new window
$startCommand = "Set-Location '$PSScriptRoot'; node server.cjs"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $startCommand

# Wait a moment for the server to start
Start-Sleep -Seconds 2

# Open the browser
Start-Process "http://localhost:3000"

