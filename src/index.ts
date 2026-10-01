import "dotenv/config";
import "express-async-errors";
import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { playersRouter } from "./routes/players";
import { ordersRouter } from "./routes/orders";
import { eventsRouter } from "./routes/events";
import { leagueAppsRouter } from "./routes/leagueapps";
import { errorHandler } from "./middleware/errorHandler";
import { deployedPlatform } from "./lib/deployed";

// DYNO (Heroku) / RAILWAY_ENVIRONMENT_ID (Railway) are the "are we
// deployed" signals rather than NODE_ENV, since nothing here sets
// NODE_ENV=production explicitly. Refuse to boot without an admin token
// once actually deployed — the GUI's write routes and player-email lookups
// depend on it, and it's cheap to catch this at startup instead of finding
// out via a wide-open console in production.
const platform = deployedPlatform();
if (platform && !process.env.ADMIN_TOKEN) {
  throw new Error(
    platform === "railway"
      ? "ADMIN_TOKEN must be set before deploying (railway variable set ADMIN_TOKEN=...)"
      : "ADMIN_TOKEN must be set before deploying (heroku config:set ADMIN_TOKEN=...)",
  );
}

const app = express();

app.use(helmet());
app.use(cors());

// The LeagueApps webhook needs the raw body for signature verification,
// and the bulk player upload posts a raw CSV, not JSON — both get a
// path-scoped body parser ahead of the global express.json().
app.use("/webhooks/leagueapps", express.raw({ type: "*/*" }));
app.use("/players/bulk-upload", express.text({ type: "text/csv", limit: "2mb" }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "..", "public")));

app.use(playersRouter);
app.use(ordersRouter);
app.use(eventsRouter);
app.use(leagueAppsRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use(errorHandler);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`ODS API listening on port ${port}`);
});
