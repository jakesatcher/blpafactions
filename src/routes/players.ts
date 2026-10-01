import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { emailToPlayerId } from "../lib/playerId";
import { requireAdmin } from "../middleware/adminAuth";
import { addPoints, getOrCreatePlayer, recordAchievement } from "../services/playerService";
import { bulkImportPlayersFromCsv } from "../services/bulkPlayerImport";

export const playersRouter = Router();

// Every player route exposes an email (directly, or via a reversible
// player id) or mutates points/achievements, so all of them require the
// admin token — applied per-route (not via router.use()) because this
// router is mounted at "/" alongside orders/events routers that must
// stay reachable when a request doesn't match any player route.
const createPlayerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
});

playersRouter.post("/players", requireAdmin, async (req, res) => {
  const parsed = createPlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { player, created } = await getOrCreatePlayer(parsed.data);
  res.status(created ? 201 : 200).json({ ...player, alreadyAssigned: !created });
});

/**
 * Bulk player import from a CSV body (Content-Type: text/csv — see the
 * path-scoped express.text() in src/index.ts). `?dryRun=true` previews
 * without writing anything. Same duplicate/reassignment guarantee as
 * every other player-creation path — see src/services/playerService.ts.
 */
playersRouter.post("/players/bulk-upload", requireAdmin, async (req, res) => {
  if (typeof req.body !== "string") {
    return res.status(400).json({ error: "expected a text/csv body" });
  }
  const dryRun = req.query.dryRun === "true";
  const summary = await bulkImportPlayersFromCsv(req.body, { dryRun });
  res.status(dryRun ? 200 : 201).json(summary);
});

playersRouter.get("/players/:playerId", requireAdmin, async (req, res) => {
  const player = await prisma.player.findUnique({
    where: { id: req.params.playerId },
    include: { order: true, progress: true, achievements: true },
  });
  if (!player) return res.status(404).json({ error: "player not found" });
  res.json(player);
});

playersRouter.get("/players/by-email/:email", requireAdmin, async (req, res) => {
  const id = emailToPlayerId(req.params.email);
  const player = await prisma.player.findUnique({
    where: { id },
    include: { order: true, progress: true, achievements: true },
  });
  if (!player) return res.status(404).json({ error: "player not found" });
  res.json(player);
});

const pointsSchema = z.object({ points: z.number().int() });

playersRouter.post("/players/:playerId/points", requireAdmin, async (req, res) => {
  const parsed = pointsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const progress = await addPoints(req.params.playerId, parsed.data.points);
  res.json(progress);
});

const achievementSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  eventId: z.string().optional(),
});

playersRouter.post("/players/:playerId/achievements", requireAdmin, async (req, res) => {
  const parsed = achievementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const achievement = await recordAchievement(
    req.params.playerId,
    parsed.data.code,
    parsed.data.title,
    parsed.data.eventId,
  );
  res.status(201).json(achievement);
});
