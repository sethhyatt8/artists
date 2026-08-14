# Artists

Collage-and-guess party game. This first slice is the reusable room layer: create a room, share a code, each player joins on their own device.

Stack: React + Vite + TypeScript on GitHub Pages, with a PartyKit room server for live sync.

## Run locally

```bash
npm install
npm run dev
```

That starts the web app and the room server together.

- Web: http://localhost:5173
- Rooms: `localhost:1999`

Open the site on your laptop and on phones on the same Wi-Fi using your computer’s LAN address (Vite prints it). Each device can create or join with the room code. No player accounts.

To confirm devices can see each other: create a room, start a ready check, tap **I’m ready** on every phone.

## Play on the internet

Two deploys:

1. **Web app** — GitHub Pages (already wired in `.github/workflows/deploy-pages.yml`).
2. **Room server** — once, from this machine:

```bash
npx partykit login --provider github
npm run deploy:rooms
```

Only you log in. Everyone else just opens the site and types the room code.

The production room host is `artists.sethhyatt8.partykit.dev` (see `.env.production`). If your GitHub username for PartyKit is different, update that file and the Pages workflow env.

## Scripts

- `npm run dev` — web + rooms
- `npm run build` / `npm run lint`
- `npm run deploy` — GitHub Pages via `gh-pages`
- `npm run deploy:rooms` — PartyKit
