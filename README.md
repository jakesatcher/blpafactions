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

| Method & path | Description |
|---|---|
| `GET /health` | Liveness check |
| `GET /orders` | List all six Orders |
| `GET /orders/:slug` | One Order |
| `GET /orders/totals` | All-time points/player-count totals per Order |
| `POST /players` | Create/upsert a player `{ email, displayName? }` |
| `GET /players/:playerId` | Player + Order + progress + achievements |
| `GET /players/by-email/:email` | Same, looked up by email |
| `POST /players/:playerId/points` | `{ points }` — increments OrderProgress points |
| `POST /players/:playerId/achievements` | `{ code, title, eventId? }` — awards an achievement |
| `POST /events` | Create an event `{ name, leagueAppsEventId?, startDate?, endDate? }` |
| `GET /events` | List events |
| `GET /events/:eventId` | One event + participation |
| `GET /events/:eventId/order-totals` | Per-Order totals for one event |
| `POST /events/:eventId/participation` | Upsert a player's participation `{ playerId, pointsEarned, placement? }` |
| `POST /webhooks/leagueapps` | LeagueApps registration webhook |
| `POST /sync/leagueapps/events/:eventId` | Manual pull-and-sync for one LeagueApps event |

## Setup

```bash
npm install
cp .env.example .env   # set DATABASE_URL, LeagueApps vars
npx prisma migrate deploy   # or `prisma migrate dev` in development
npm run seed                # seeds the six Orders
npm run dev                 # starts the API on $PORT (default 3000)
```

Requires a reachable Postgres instance (`DATABASE_URL` in `.env`).

## Tests

```bash
npm test
```

Covers determinism and normalization of Order assignment, and the
player-ID encode/decode round trip.
