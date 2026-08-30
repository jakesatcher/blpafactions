import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { playersRouter } from "./routes/players";
import { ordersRouter } from "./routes/orders";
import { eventsRouter } from "./routes/events";
import { leagueAppsRouter } from "./routes/leagueapps";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(helmet());
app.use(cors());

// The LeagueApps webhook needs the raw body for signature verification,
// so that one path gets express.raw() ahead of the global express.json().
app.use("/webhooks/leagueapps", express.raw({ type: "*/*" }));
app.use(express.json());

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
