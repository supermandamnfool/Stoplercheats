
# Electron Wrapper (macOS)

## Dev (hot reload)
```bash
npm install
npm run dev:electron
```
- This runs `next dev` on port 3000 and launches Electron pointing to it.

## Production build (.app / .dmg)
```bash
npm run dist
```
- This runs `next build && next export` to `out/` and packages an Electron app via `electron-builder`.
- Output is in the `dist/` folder (a `.dmg` and zipped `.app`).

## Notes
- The app is fully static in production (uses `out/index.html`). No Node server is bundled.
- If your pages later require server-side rendering, switch to a `next start` approach in Electron and include node_modules. For this project, static export is fine.
- To run only the web version: `npm run dev` then open http://localhost:3000
