#!/bin/bash
set -e

echo "=== Stolperbeats Pattern Generator Build Script ==="

# Ensure Node version is printed for sanity check
echo "Node version: $(node -v)"

# Step 1: Install dependencies
echo "Installing dependencies..."
npm install

# Step 2: Build the renderer (Next.js export)
echo "Building Next.js static files..."
npm run build:renderer

# Step 3: Package with Electron Builder
echo "Packaging Electron app..."
npm run dist

echo "=== Build complete! ==="
echo "Check the dist/ folder:"
echo "  - dist/mac/Stolperbeats Pattern Generator.app"
echo "  - dist/Stolperbeats Pattern Generator-*.dmg"
