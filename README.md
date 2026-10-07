# BrownBook

BrownBook is a focused, gamified task system for one-time work, recurring routines, progress tracking, and user-defined rewards. It runs as an Electron app and as a static web app.

## Highlights

- One-time and recurring tasks, including interval schedules
- Focus pins, subtasks, expirations, suspensions, and a 6 AM task-day reset
- Coin rewards, a scaling daily shop, custom rewards, and reward timers
- History, consistency charts, streaks, vacation-day protection, and JSON backups
- A safe local preview mode with realistic sample data and no Firebase access

## Web app (BrownBook Studio)

The web app lives in `studio/` (React + Vite) and is what Vercel builds and serves at the site root. It reads and writes the same Firestore document as the original app, using the same device key in `localStorage`, so existing installs (including home-screen web apps) keep their data.

```bash
cd studio
npm install
npm run dev          # http://127.0.0.1:5173, add ?preview=1 for safe sample data
npm run build        # outputs studio/dist
```

The previous version of the web app is kept unchanged in `classic/` and is served at `/classic/` as a fallback.

## Requirements

- Node.js 22.12 or newer
- npm

## Run locally

Install dependencies, then start the production-connected app:

```bash
npm install
npm start
```

For design and development work, use preview mode:

```bash
npm run preview
```

Preview mode uses session-scoped sample data. It does not import Firebase, read the live account, or write cloud data.

## Validation

```bash
npm test
npm run pack
```

`npm run pack` creates an unpacked Electron build in `dist/` without publishing or deploying anything.

## Data model

Production data is stored in Cloud Firestore at:

```text
users/{secretSaveKey}
```

The document currently contains tasks, recurring tasks, completion history, rewards, shop state, settings, vacation days, and aggregate statistics. The renderer also keeps a per-key local cache so a temporary sync failure does not discard the latest local state.

The app exports timestamped JSON backups from the History view. Importing data creates a local pre-import backup before replacing the active document.

> The current cross-device scheme uses the Firestore document ID as a shared secret, not Firebase Authentication. `firestore.rules` blocks collection listing, but a future production hardening pass should migrate accounts to authenticated user IDs before treating BrownBook as a multi-user public service.

## Project layout

- `app.js` — application orchestration, rendering, interactions, and sync queue
- `data-model.js` — schema normalization, document sizing, and coin-accounting helpers
- `preview-data.js` — isolated local preview fixture
- `firebase-config.js` — pinned Firebase web SDK initialization
- `index.html` — application structure and accessibility metadata
- `styles.css` — BrownBook design system, themes, responsive layouts, and motion
- `main.cjs` — hardened Electron window configuration
- `plugins/brownbook-coast/` — read-only MCP plugin for BrownBook and Coast reviews

## Deployment safety

Local development commands do not deploy Firestore rules, publish a Vercel build, push Git commits, or modify the GitHub repository. Deploy those changes only after the design and data migration plan are approved.
