#!/bin/bash

# OpenTeleprompter Uninstall Script for macOS
# This script removes the application and all associated local configuration/data.

echo "🗑️  Starting OpenTeleprompter uninstallation..."

# 1. Quit the application if it's running
echo "🛑 Closing OpenTeleprompter..."
# Try to quit gracefully via AppleScript
osascript -e 'quit app "OpenTeleprompter"' 2>/dev/null
# Give it a second to close
sleep 1
# Force kill if still running
pkill -9 -x "OpenTeleprompter" 2>/dev/null
pkill -9 -x "open-teleprompter" 2>/dev/null

# 2. Remove the Application
if [ -d "/Applications/OpenTeleprompter.app" ]; then
    echo "📂 Removing application from /Applications..."
    sudo rm -rf "/Applications/OpenTeleprompter.app"
else
    echo "ℹ️  Application not found in /Applications."
fi

# 3. Remove Configuration Files (as identified in GEMINI.md)
echo "📝 Removing configuration files from home directory..."
rm -f "$HOME/.teleprompter-config.json"
rm -f "$HOME/.teleprompter-scripts.json"
rm -f "$HOME/.teleprompter-launched"

# 4. Remove Tauri/System data
echo "🧹 Cleaning up Application Support and Caches..."
rm -rf "$HOME/Library/Application Support/com.openteleprompter.teleprompter"
rm -rf "$HOME/Library/Caches/com.openteleprompter.teleprompter"
rm -rf "$HOME/Library/WebKit/com.openteleprompter.teleprompter"
rm -rf "$HOME/Library/Saved Application State/com.openteleprompter.teleprompter.savedState"

# 5. Remove any logs/temp files
echo "🗂️  Cleaning up logs..."
rm -rf "$HOME/Library/Logs/OpenTeleprompter"

echo "✅ Uninstallation complete. All app data has been removed."
