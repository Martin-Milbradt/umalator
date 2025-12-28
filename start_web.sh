#!/bin/bash
# Start the web UI server and open it in the browser
set -e

# Change to script directory
cd "$(dirname "$0")"

# Check if uma-tools exists, clone if it doesn't
UMA_TOOLS_PATH="$(cd .. && pwd)/uma-tools"
if [ ! -d "$UMA_TOOLS_PATH" ]; then
    echo "uma-tools repository not found. Attempting to clone..."
    PARENT_DIR="$(cd .. && pwd)"
    cd "$PARENT_DIR"

    REPO_URL="https://github.com/alpha123/uma-tools"
    echo "Cloning from: $REPO_URL (with submodules)..."
    git clone --recurse-submodules "$REPO_URL"
    if [ $? -ne 0 ]; then
        echo "Failed to clone uma-tools repository. Please clone it manually to: $UMA_TOOLS_PATH"
        exit 1
    fi
    cd "$(dirname "$0")"
fi

# Pull latest changes from uma-tools and all submodules
echo "Pulling latest changes from uma-tools and submodules..."
(cd "$UMA_TOOLS_PATH" && git pull --recurse-submodules) || echo "Warning: Failed to pull uma-tools, continuing anyway..."
# Ensure submodules are up to date with their remotes
(cd "$UMA_TOOLS_PATH" && git submodule update --remote --recursive) || echo "Warning: Failed to update submodules, continuing anyway..."

# Rebuild the project
echo "Rebuilding project..."
npm run build
if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

# Start the server in the background
echo "Starting web server..."
npm run web &
SERVER_PID=$!

# Wait a moment for the server to start
sleep 2

# Open the browser (try different commands based on OS)
if command -v xdg-open > /dev/null; then
    # Linux
    xdg-open "http://localhost:3000"
elif command -v open > /dev/null; then
    # macOS
    open "http://localhost:3000"
else
    echo "Please open http://localhost:3000 in your browser"
fi

echo "Server started with PID $SERVER_PID"
echo "To stop the server, run: kill $SERVER_PID"
