# BLPA — Original Draft Society (ODS)

Database and API for the ODS classification system: every BLPA player is
deterministically assigned to one of six Orders and tracked across events.

## The six Orders

| Slug | Name | Animal |
|---|---|---|
| `varghona` | Varghona | wolf |
| `tuskarium` | Tuskarium | elephant |
| `aetherwing` | Aetherwing | eagle |
| `serikon` | Serikon | snake |
| `thalkara` | Thalkara | kraken |
| `ursonne` | Ursonne | bear |

## How assignment works

A player's Order is derived from their email, not stored as an arbitrary
choice: `assignOrder()` (`src/lib/orderAssignment.ts`) SHA-256 hashes the
normalized (trimmed, lowercased) email and mods the result by 6 to index
into a fixed Order list. Same email → same Order, forever, with no lookup
table required.

**Player IDs** are the base64url encoding of that same normalized email
(`src/lib/playerId.ts`). This is an *encoding*, not encryption — it's
trivially reversible — and it's used purely so a player's stable
correlation key can be derived from their email alone, without a database
round trip, when reconciling data pulled from LeagueApps or other event
sources. Player IDs should be handled with the same care as email
addresses.

## Data model

See `prisma/schema.prisma` for the full definitions.

- **Order** — one of the six Orders (seeded once, slugs are stable and permanent).
- **Player** — a BLPA participant; `id` is the base64url email, `orderSlug`
  is their permanent Order assignment.
- **OrderProgress** — one row per player: running `points` and `degree` (rank/tier) within their Order.
- **Achievement** — named accomplishments a player earns, optionally tied to an event.
- **Event** — a BLPA event, optionally mirrored from a LeagueApps event via `leagueAppsEventId`.
- **EventParticipation** — a player's record (points earned, placement) in one event.

Order totals (points and player counts, overall or per event) are **not**
stored as a separate table — they're computed on read from
`OrderProgress` / `EventParticipation` (`src/services/orderTotals.ts`), so
they can never drift out of sync with the underlying per-player records.

## LeagueApps integration

`src/services/leagueapps.ts` holds a thin `LeagueAppsClient` for pulling
registrations from the LeagueApps API, and an HMAC-SHA256 webhook
signature verifier. `src/services/eventSync.ts` has the shared,
idempotent sync logic (`applyRegistration`) used by both:

- `POST /webhooks/leagueapps` — receives a LeagueApps registration webhook
  and syncs it (upserts player + Order assignment on first sight, event,
  and participation). Verifies `x-leagueapps-signature` against
  `LEAGUEAPPS_WEBHOOK_SECRET` when that env var is set.
- `POST /sync/leagueapps/events/:eventId` — manual/backfill pull of all
  registrations for a LeagueApps event.

`LeagueAppsClient.listRegistrations` is a stub against a plausible
LeagueApps REST shape — adjust the endpoint path and response mapping to
match the actual LeagueApps API docs/credentials once available. Nothing
else in the sync flow needs to change.

## API

`🔒` = requires an `x-admin-token` header matching `ADMIN_TOKEN` (see
[Admin auth](#admin-auth) below).

| Method & path | Description |
|---|---|
| `GET /health` | Liveness check |
| `GET /orders` | List all six Orders |
| `GET /orders/:slug` | One Order |
| `GET /orders/totals` | All-time points/player-count totals per Order |
| 🔒 `POST /players` | Create/upsert a player `{ email, displayName? }` |
| 🔒 `GET /players/:playerId` | Player + Order + progress + achievements |
| 🔒 `GET /players/by-email/:email` | Same, looked up by email |
| 🔒 `POST /players/:playerId/points` | `{ points }` — increments OrderProgress points |
| 🔒 `POST /players/:playerId/achievements` | `{ code, title, eventId? }` — awards an achievement |
| 🔒 `POST /events` | Create an event `{ name, leagueAppsEventId?, startDate?, endDate? }` |
| `GET /events` | List events |
| 🔒 `GET /events/:eventId` | One event + participation roster |
| `GET /events/:eventId/order-totals` | Per-Order totals for one event |
| 🔒 `POST /events/:eventId/participation` | Upsert a player's participation `{ playerId, pointsEarned, placement? }` |
| `POST /webhooks/leagueapps` | LeagueApps registration webhook (own HMAC signature check, not the admin token) |
| 🔒 `POST /sync/leagueapps/events/:eventId` | Manual pull-and-sync for one LeagueApps event |

Routes without 🔒 are aggregate/reference data with no PII, safe to leave
public (e.g. a standings page). Everything that mutates data, or that
exposes a player's email (directly, or via their reversible player id),
is gated.

## GUI

A small static admin console lives at `/` (`public/index.html` +
`app.js`, served via `express.static` — no separate build step or
frontend framework). It covers the day-to-day inputs: find/create a
player, add points, award achievements, create events, and record event
participation, with a live standings table on top.

Paste the `ADMIN_TOKEN` value into the "Admin token" field in the top
right and hit Save — it's stored in that browser's `localStorage` and
sent as `x-admin-token` on every request the GUI makes. An activity log
at the bottom of the page echoes every API call and its response, which
doubles as a quick way to see what the GUI is actually doing.

## Admin auth

Routes marked 🔒 above require an `x-admin-token: <ADMIN_TOKEN>` header.
If `ADMIN_TOKEN` isn't set, the check is skipped — convenient for local
development, but **the app refuses to start at all when running on
Heroku** (detected via the `DYNO` env var) if `ADMIN_TOKEN` is unset, so
this can't accidentally ship open. Set it with:

```bash
heroku config:set ADMIN_TOKEN="$(openssl rand -hex 24)"
```

## Setup

```bash
npm install
cp .env.example .env   # set DATABASE_URL, ADMIN_TOKEN, LeagueApps vars
npx prisma migrate deploy   # or `prisma migrate dev` in development
npm run seed                # seeds the six Orders
npm run dev                 # starts the API + GUI on $PORT (default 3000)
```

Requires a reachable Postgres instance (`DATABASE_URL` in `.env`).

## Tests

```bash
npm test
```

Covers determinism and normalization of Order assignment, and the
player-ID encode/decode round trip.

## Deploying to Heroku

```bash
heroku create your-app-name
heroku addons:create heroku-postgresql:essential-0

# Heroku Postgres terminates TLS with a self-signed cert; sslmode=require
# tells Prisma to negotiate TLS without validating that cert.
heroku config:set DATABASE_URL="$(heroku config:get DATABASE_URL)?sslmode=require"

heroku config:set ADMIN_TOKEN="$(openssl rand -hex 24)"
heroku config:set LEAGUEAPPS_API_BASE="https://api.leagueapps.io"
heroku config:set LEAGUEAPPS_API_KEY="..."
heroku config:set LEAGUEAPPS_WEBHOOK_SECRET="..."

git push heroku claude/ods-classification-database-njqfzk:main
heroku run npm run seed
```

What that push actually does, all driven by `package.json` and
`Procfile`:

1. `npm install` runs, which triggers `postinstall` (`prisma generate`).
   `prisma`, `typescript`, and `ts-node` are regular `dependencies` (not
   `devDependencies`) specifically so this step doesn't depend on
   Heroku's `NPM_CONFIG_PRODUCTION` setting.
2. Heroku's Node buildpack runs `heroku-postbuild`, which runs `npm run
   build` (`tsc` → `dist/`).
3. The `release` phase in `Procfile` runs `prisma migrate deploy` against
   the new `DATABASE_URL` before any web dyno picks up the new release.
4. The `web` process starts `npm start` → `node dist/index.js`, which
   reads `$PORT` the way Heroku requires.

`heroku run npm run seed` only needs to be run once per database (it's
an idempotent upsert of the six Orders, safe to re-run).
