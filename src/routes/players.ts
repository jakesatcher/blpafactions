import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { emailToPlayerId } from "../lib/playerId";
import { addPoints, getOrCreatePlayer, recordAchievement } from "../services/playerService";

export const playersRouter = Router();

const createPlayerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
});

playersRouter.post("/players", async (req, res) => {
  const parsed = createPlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const player = await getOrCreatePlayer(parsed.data);
  res.status(201).json(player);
});

playersRouter.get("/players/:playerId", async (req, res) => {
  const player = await prisma.player.findUnique({
    where: { id: req.params.playerId },
    include: { order: true, progress: true, achievements: true },
  });
  if (!player) return res.status(404).json({ error: "player not found" });
  res.json(player);
});

playersRouter.get("/players/by-email/:email", async (req, res) => {
  const id = emailToPlayerId(req.params.email);
  const player = await prisma.player.findUnique({
    where: { id },
    include: { order: true, progress: true, achievements: true },
  });
  if (!player) return res.status(404).json({ error: "player not found" });
  res.json(player);
});

const pointsSchema = z.object({ points: z.number().int() });

playersRouter.post("/players/:playerId/points", async (req, res) => {
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

playersRouter.post("/players/:playerId/achievements", async (req, res) => {
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
