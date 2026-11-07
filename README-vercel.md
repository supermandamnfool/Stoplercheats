
# Deploy to Vercel

This project is a standard Next.js app and deploys natively on Vercel.

## Quick Deploy
1. Install the Vercel CLI:
   ```bash
   npm i -g vercel
   ```
2. From the project root:
   ```bash
   vercel
   ```
   Follow the prompts (link or create a project).

3. For subsequent deploys:
   ```bash
   vercel --prod
   ```

## Notes
- Build command: `npm run build` (Vercel runs this automatically).
- Output is served from `.next/` on Vercel. Do **not** use `next export` on Vercel.
- The Electron wrapper is ignored for deployment via `.vercelignore`.
- If you added environment variables later, set them in the Vercel dashboard under **Settings → Environment Variables**.
