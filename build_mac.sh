#!/bin/bash

# OpenTeleprompter macOS Build Script
# Generates versioned .app and .dmg files in the dist/ folder

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Starting macOS Production Build..."

# 1. Check for prerequisites
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Rust/Cargo not found. Please install from https://rustup.rs/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ Error: Node/NPM not found. Please install Node.js."
    exit 1
fi

# 2. Extract version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "📦 Version: v$VERSION"

# 3. Clean up previous builds
echo "🧹 Cleaning previous build artifacts..."
rm -rf dist
rm -rf src-tauri/target/release/bundle

# 4. Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install

# 5. Run the build
echo "🏗️  Building Production Bundle (this may take a few minutes)..."
# We don't use set -e here specifically for the build command so we can catch the error and explain it
if ! npm run build; then
    echo ""
    echo "❌ Build failed during the Tauri/Rust compilation or bundling phase."
    echo "💡 Note: If you see 'error running bundle_dmg.sh', you may need to install 'create-dmg':"
    echo "   brew install create-dmg"
    exit 1
fi

# 6. Prepare dist folder and move/rename artifacts
echo "📂 Organizing artifacts into dist/..."
mkdir -p dist

SRC_APP="src-tauri/target/release/bundle/macos/OpenTeleprompter.app"
# Find the DMG using a wildcard to support both x64 and aarch64 architectures
SRC_DMG=$(find src-tauri/target/release/bundle/dmg -name "OpenTeleprompter_${VERSION}_*.dmg" | head -n 1)

DEST_APP="dist/OpenTeleprompter-v${VERSION}.app"
DEST_DMG="dist/OpenTeleprompter-v${VERSION}.dmg"

if [ -d "$SRC_APP" ]; then
    echo "🚚 Copying .app to dist/..."
    cp -R "$SRC_APP" "$DEST_APP"
    
    if [ -n "$SRC_DMG" ] && [ -f "$SRC_DMG" ]; then
        echo "🚚 Moving .dmg to dist/..."
        mv "$SRC_DMG" "$DEST_DMG"
    else
        echo "⚠️  Warning: .dmg file was not found in the expected location."
    fi
    
    echo "✅ Build Successful!"
    echo "--------------------------------------------------"
    echo "📦 APP: $DEST_APP"
    echo "💿 DMG: $DEST_DMG"
    echo "--------------------------------------------------"
    echo "💡 Note: To open the .app for the first time, Right-Click -> Open"
else
    echo "❌ Error: Build finished but the .app bundle was not found."
    exit 1
fi
