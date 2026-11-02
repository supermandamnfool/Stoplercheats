# Stolpercheats Midi Generator Converter

Create **Stolperbeats** pattern banks from MIDI or generate your own in the sequencer and export midi or stoplerbeats text files (Next.js) and as a desktop app (Electron).

## Quick Start (Web)
```bash
npm install
npm run dev
# http://localhost:3000
```

## Quick Start (Electron)
```bash
npm install
npm run dev:electron
```

## Build Desktop App (.app / .dmg)
```bash
npm run dist
# artifacts in dist/
```

## Deploy to Vercel
Use the Vercel Git integration or CLI. This repo is Vercel-ready.

## Scripts
- `dev` – Next.js dev server
- `dev:electron` – Electron + Next dev
- `build` – Next build (for Vercel)
- `build:renderer` – Next export (for Electron packaging)
- `dist` – Electron packaged app
- `pack` – Electron unpackaged dir
- `typecheck` – TypeScript noEmit check
- `lint` – ESLint

## GitHub Actions
- **CI**: typecheck, lint, build on pushes/PRs to `main`
- **Release**: tag `vX.Y.Z` to build macOS Electron artifacts and attach them to a GitHub Release

## License
See [LICENSE](./LICENSE).
