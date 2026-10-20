# OPT Systems

Greenfield rebuild of the OPT workshop time-tracking / clock-in platform.
This repository is the **Phase 0 foundation**: a runnable npm-workspaces monorepo
with the shared design system and the two hero screens (Login + Kiosk) ported to
real React, plus a typed Fastify + multi-tenant Postgres API skeleton.

## Stack

- **apps/web** — React 18 + TypeScript + Vite, installable **PWA** (`vite-plugin-pwa`), `react-router-dom`.
- **apps/api** — Node + TypeScript + **Fastify** 5, `@fastify/jwt`, `@fastify/cors`, multi-tenant Postgres schema.
- **packages/ui** — shared design system: design tokens (CSS variables) + React components (`Logo`, `Button`, `Tile`, `Field`, `Pill`).

Environment: **Node 22, npm 10** (npm workspaces — no pnpm/yarn/docker). TypeScript strict mode throughout.

## Getting started

```bash
npm install            # installs all workspaces
```

### Web app (runs standalone — no database needed)

```bash
npm run dev -w apps/web       # dev server on http://localhost:5173
npm run build -w apps/web     # production build
```

Routes: `/login` (Login), `/kiosk` (Kiosk), `/` redirects to `/login`.

### API

The API **requires Postgres** to run against a live database, but compiles and
serves `/health` without one.

```bash
cp apps/api/.env.example apps/api/.env   # then edit values
npm run build -w apps/api                # tsc -> dist/
npm run dev -w apps/api                  # tsx watch, listens on PORT (default 4000)
```

Environment variables (`apps/api/.env`): `DATABASE_URL`, `JWT_SECRET`,
`CORS_ORIGIN` (single origin, not wildcard; default `http://localhost:5173`),
`PORT` (default `4000`).

CORS is locked to `CORS_ORIGIN`. Health check: `GET /health` → `{ "ok": true }`.

### Database migration

The SQL schema lives at **`apps/api/migrations/001_init.sql`** (multi-tenant:
`tenants`, `users`, `workshops`, `clients`, `jobs`, `screens`, `time_entries`,
`activity_log`). Apply it with:

```bash
psql "$DATABASE_URL" -f apps/api/migrations/001_init.sql
```

## Design system

Locked palette and rules live in `packages/ui/src/tokens.css`. Sky blue
(`--sky #2f80ed`) is the lead colour (primary buttons + the OPT logo). Surfaces
are light/porcelain, text is dark ink, flat fills only — **no gradients, no dark
green**. Font is Inter (Google Fonts).

The OPT logo renders via a CSS mask so it can be tinted any colour without
shipping multiple PNGs — see `packages/ui/src/components/Logo.tsx`. Brand assets
live in `apps/web/public/brand/`.

## What is stubbed vs functional (Phase 0)

- **Functional:** monorepo wiring, design tokens + UI components, Login & Kiosk
  screens, Fastify server, `/health`, CORS, JWT signing/verification, scrypt
  password hashing, the SQL migration.
- **Stubbed (typed skeletons):** `POST /auth/login` / `GET /auth/me` (no DB
  lookup or credential check yet), tenant-resolution decorator (parses the
  subdomain but does not query). Login submit currently routes to `/kiosk`.
```
