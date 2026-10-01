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

**Once assigned, always that Order.** Every path that can create a
player — the GUI, the LeagueApps member import, the registration
webhook/sync, a future bulk upload — funnels through one function,
`getOrCreatePlayer()` (`src/services/playerService.ts`). If a player
already exists for an email, that function's update path has no
`orderSlug` field in it at all, so there is no code path, on any input,
that can move an existing player to a different Order — re-running an
import, uploading the same roster twice, or a player showing up again
through a different source all just confirm the existing assignment
rather than touching it. The function reports `created: true`/`false` so
callers can tell "newly assigned" from "already was" instead of that
distinction being silent; `POST /sync/leagueapps/members`'s response
breaks this out as `newlyAssigned` / `alreadyAssigned` counts.
`test/playerAssignmentLock.test.ts` verifies this against a real
database, including a case where the assignment algorithm's answer
changes between two calls for the same email — the second call still
can't move the player.

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

Two separate pieces, because LeagueApps itself documents two separate
auth styles — a "Public API Key" bearer-token style, and a JWT-bearer
"Private API" used for bulk exports:

### Player roster import (verified against real docs)

`POST /sync/leagueapps/members` 🔒 imports the full LeagueApps member
roster via the Private API's `GET /v2/sites/{siteId}/export/members-2`
(https://leagueapps.notion.site/LeagueApps-API-Documentation) and upserts
every member as a Player — same `getOrCreatePlayer` path the GUI uses, so
imported players get the same base64url player id and deterministic
Order assignment as anyone created any other way.

- **Auth**: OAuth2 with a JWT-bearer assertion (RFC 7523), signed RS256
  with your org's Private API Key (a downloaded `.p12`, converted to
  PEM). Not a static API token — see `src/services/leagueappsAuth.ts`,
  which mirrors LeagueApps' own
  [sample script](https://github.com/LeagueApps/api-example)'s claim
  shape (`{ aud, iss, sub, iat, exp }`) exactly. Access tokens last 15
  minutes and are cached/refreshed automatically.
- **Pagination**: `members-2` returns up to 1000 rows per call, cursor-paginated
  by `(last-updated, last-id)`. `src/services/leagueappsPrivateApi.ts`'s
  `iterateExport()` walks pages until one comes back empty, replicating
  the sample script's dedup rule for the repeated boundary row.
- **Incremental by default**: the cursor is persisted in the `SyncCursor`
  table (`source = "leagueapps-members-2"`) after every page, so a
  second run only pulls members updated since the first — matching the
  docs' own recommended usage ("periodically exporting... e.g. hourly
  syncing to a client system with new data since the last request").
  Pass `{ "fromScratch": true }` in the request body to re-walk the
  whole roster (safe — every write is an upsert).
- **Skipped rows**: `deleted` members, and `CHILD`-type members (who have
  no email of their own — they're attached to a parent account, and our
  Order/player-id scheme requires an email) are counted and skipped
  rather than guessed at. The response reports `newlyAssigned` (brand-new
  players) separately from `alreadyAssigned` (members who already had a
  player — their existing Order was left alone) alongside those skip
  counts, so a re-run's output makes the "didn't duplicate or reassign"
  check visible rather than just a trust-me.

Set up: generate a Private API Key in the LeagueApps admin dashboard
(Connect → API Settings), download the `.p12`, convert it —
`openssl pkcs12 -nodes -legacy -in <client-id>.p12 -out <client-id>.pem`
— and set `LEAGUEAPPS_SITE_ID`, `LEAGUEAPPS_CLIENT_ID`,
`LEAGUEAPPS_PRIVATE_KEY` (the PEM contents) per `.env.example`.

### Event registrations (⚠️ unverified)

`src/services/leagueapps.ts` (a different, older `LeagueAppsClient`),
`src/services/eventSync.ts`'s `applyRegistration`, and two routes:

- `POST /webhooks/leagueapps` — a registration webhook, HMAC-signature
  checked against `LEAGUEAPPS_WEBHOOK_SECRET` when set.
- `POST /sync/leagueapps/events/:eventId` 🔒 — manual pull of
  registrations for one event.

This code predates having real LeagueApps docs and was never checked
against them — the endpoint path, payload shape, and webhook signature
scheme are all guesses. Don't rely on it until it's verified the same
way the member import above was (real docs, or a confirmed sample
payload).

## BLST integration

[BLST](https://github.com/jakesatcher/BLST) (BLPA Live Scoring & Stats)
is a separate app that pushes into this one — Factions doesn't call out
to BLST at all, so there's nothing to build or configure here. BLST's
`src/services/factions.js` registers each rostered player via
`POST /players {email, displayName}` (the exact endpoint this README
documents above), then pushes tournament results through
`POST /events/:eventId/participation` and achievements through
`POST /players/:playerId/achievements` — both idempotent upserts, and it
deliberately never calls `POST /players/:id/points` (which increments,
so a retried push would double-count). Because player registration goes
through the same `getOrCreatePlayer` path as everything else, a BLST
tournament re-sync carries the same guarantee described above: it can't
duplicate a player or move them to a different Order.

## Bulk player upload (manual)

🔒 `POST /players/bulk-upload` takes a CSV/TSV/semicolon-separated body
(`Content-Type: text/csv`) with an `email` column and an optional
`displayName`/`name` column — header matching is case- and
punctuation-insensitive. `?dryRun=true` previews the whole file (what
would be newly assigned vs. already exists, and which rows are invalid)
without writing anything, the same workflow BLST's own roster CSV
upload uses. Every row goes through `getOrCreatePlayer`, so re-uploading
a file (accidentally twice, or as a refreshed export) never duplicates
or reassigns anyone — it's also safe within one file: a repeated email
in the same upload only gets assigned once (`duplicateWithinFile: true`
on the later row). Parsing errors (missing/invalid email) are reported
per line rather than aborting the batch, matching BLST's own CSV
import's "flag problems with line numbers" behavior.

The GUI's "Bulk Upload Players" card wraps this with a file picker and
Preview/Import buttons.

## API

`🔒` = requires an `x-admin-token` header matching `ADMIN_TOKEN` (see
[Admin auth](#admin-auth) below).

| Method & path | Description |
|---|---|
| `GET /health` | Liveness check |
| `GET /orders` | List all six Orders |
| `GET /orders/:slug` | One Order |
| `GET /orders/totals` | All-time points/player-count totals per Order |
| 🔒 `POST /players` | Create/find a player `{ email, displayName? }` — 201 if newly assigned, 200 if the email was already a player (`alreadyAssigned: true`) |
| 🔒 `POST /players/bulk-upload` | CSV body (`Content-Type: text/csv`), `?dryRun=true` to preview → `{ newlyAssigned, alreadyAssigned, invalid, rows, parseErrors }` |
| 🔒 `GET /players/:playerId` | Player + Order + progress + achievements |
| 🔒 `GET /players/by-email/:email` | Same, looked up by email |
| 🔒 `POST /players/:playerId/points` | `{ points }` — increments OrderProgress points |
| 🔒 `POST /players/:playerId/achievements` | `{ code, title, eventId? }` — awards an achievement |
| 🔒 `POST /events` | Create an event `{ name, leagueAppsEventId?, startDate?, endDate? }` |
| `GET /events` | List events |
| 🔒 `GET /events/:eventId` | One event + participation roster |
| `GET /events/:eventId/order-totals` | Per-Order totals for one event |
| 🔒 `POST /events/:eventId/participation` | Upsert a player's participation `{ playerId, pointsEarned, placement? }` |
| `POST /webhooks/leagueapps` | ⚠️ unverified — LeagueApps registration webhook (own HMAC signature check, not the admin token) |
| 🔒 `POST /sync/leagueapps/events/:eventId` | ⚠️ unverified — manual pull-and-sync for one LeagueApps event |
| 🔒 `POST /sync/leagueapps/members` | Import/incrementally re-sync the full LeagueApps roster `{ fromScratch? }` → `{ newlyAssigned, alreadyAssigned, skippedDeleted, skippedNoEmail, ... }` |

Routes without 🔒 are aggregate/reference data with no PII, safe to leave
public (e.g. a standings page). Everything that mutates data, or that
exposes a player's email (directly, or via their reversible player id),
is gated.

## GUI

A small static admin console lives at `/` (`public/index.html` +
`app.js`, served via `express.static` — no separate build step or
frontend framework). It covers the day-to-day inputs: find/create a
player, bulk-upload a CSV of players, add points, award achievements,
create events, and record event participation, with a live standings
table on top.

Paste the `ADMIN_TOKEN` value into the "Admin token" field in the top
right and hit Save — it's stored in that browser's `localStorage` and
sent as `x-admin-token` on every request the GUI makes. An activity log
at the bottom of the page echoes every API call and its response, which
doubles as a quick way to see what the GUI is actually doing.

## Admin auth

Routes marked 🔒 above require an `x-admin-token: <ADMIN_TOKEN>` header.
If `ADMIN_TOKEN` isn't set, the check is skipped — convenient for local
development, but **the app refuses to start at all when running on
Heroku or Railway** (detected via `DYNO` / `RAILWAY_ENVIRONMENT_ID`) if `ADMIN_TOKEN` is unset, so
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

The LeagueApps env vars are only required if you're using the LeagueApps
sync routes — everything else runs fine without them.

Requires a reachable Postgres instance (`DATABASE_URL` in `.env`).

## Tests

```bash
npm test
```

Covers determinism and normalization of Order assignment, and the
player-ID encode/decode round trip.

## Deploying to Railway

The easiest path runs this app next to BLST in one Railway project. From the
BLST repo, `scripts/railway-setup.sh` creates Postgres plus a `factions` and a
`blst` service and wires them together; see BLST's
[docs/RAILWAY.md](https://github.com/jakesatcher/BLST/blob/claude/great-bardeen-wfd39q/docs/RAILWAY.md).

To deploy this app on its own: **New Project → Deploy PostgreSQL**, then
**+ Create → GitHub Repo → jakesatcher/blpafactions**, with these variables:

```
ADMIN_TOKEN=<openssl rand -hex 24>
DATABASE_URL=${{Postgres.DATABASE_URL}}
PORT=8080
```

Then generate a domain under Settings → Networking (port 8080).

You don't need to configure build or start commands: `railpack.json` tells
Railway's builder to start with
`npx prisma migrate deploy && npm run seed && npm start`. That migrates,
upserts the six Orders (idempotent), and starts. It also installs `openssl`,
which Prisma needs.

Like on Heroku, the app refuses to boot on Railway without `ADMIN_TOKEN`.
Railway is detected through `RAILWAY_ENVIRONMENT_ID`; see
`src/lib/deployed.ts`.

When sharing a database with BLST, add `?schema=factions` to `DATABASE_URL`
so this app's tables live in their own schema.

## Deploying to Heroku

```bash
heroku create your-app-name
heroku addons:create heroku-postgresql:essential-0

# Heroku Postgres terminates TLS with a self-signed cert; sslmode=require
# tells Prisma to negotiate TLS without validating that cert.
heroku config:set DATABASE_URL="$(heroku config:get DATABASE_URL)?sslmode=require"

heroku config:set ADMIN_TOKEN="$(openssl rand -hex 24)"

# LeagueApps Private API (member roster import) — omit if not using it yet
heroku config:set LEAGUEAPPS_API_BASE="https://public.leagueapps.io"
heroku config:set LEAGUEAPPS_SITE_ID="..."
heroku config:set LEAGUEAPPS_CLIENT_ID="..."
heroku config:set LEAGUEAPPS_PRIVATE_KEY="$(cat <client-id>.pem)"

git push heroku claude/ods-classification-database-njqfzk:main
heroku run npm run seed
```

To run the member import on a schedule (the docs' recommended usage —
"typical usage example is hourly syncing"), add the Heroku Scheduler
add-on and point it at:

```bash
curl -X POST https://your-app-name.herokuapp.com/sync/leagueapps/members \
  -H "x-admin-token: $ADMIN_TOKEN"
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
