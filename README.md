# TeachMe

Say a topic, start listening. TeachMe turns anything you want to learn into a
spoken audio series you can play on the go — skip sections like songs, ask
questions or steer the direction mid-listen (typed or by voice), and pick up
where you left off.

## How it works

- **Outline first**: a topic becomes a 6–9 section series plan in one fast LLM
  call (Gemini Flash via OpenRouter), so the thread appears within seconds.
- **Lazy sections**: each section's ~3-minute script is written on demand and
  synthesized with Azure Speech; the next section is always prefetched, so
  pressing Next is instant in normal listening flow.
- **Steering**: an instruction (or question) replans the remaining sections
  from your current position; already-heard sections stay fixed.
- **Player**: Media Session API wired up — lock-screen and headphone
  next/prev/seek work like a podcast app. Position is saved continuously.
- **Storage**: single-user JSON store + mp3 files on a docker volume. One
  shared access code gates everything (the app fronts paid API keys).

## Stack

npm workspaces: `server/` (Express, tsx runtime, no build step) and `web/`
(Vite + React). Mobile-first UI, desktop-friendly; installable as a PWA.

## Run

```sh
cp .env.example .env   # fill in keys + access code
npm ci
npm run build          # builds web/dist
npm start              # serves app + API on 127.0.0.1:3200
```

## Deploy

```sh
docker compose up -d --build
```

The container joins the external `edge` docker network with no host ports;
the edge Caddy reverse-proxies `teachme.jdmnk.dev` → `teachme-app:3200`.

## Later

iOS app (the web app is designed mobile-first with that in mind), live web
search via an agent harness backend, per-section transcripts.
