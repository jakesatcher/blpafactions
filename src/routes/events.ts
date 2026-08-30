import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getOrderTotalsForEvent } from "../services/orderTotals";

export const eventsRouter = Router();

const createEventSchema = z.object({
  name: z.string().min(1),
  leagueAppsEventId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

eventsRouter.post("/events", async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, leagueAppsEventId, startDate, endDate } = parsed.data;
  const event = await prisma.event.create({
    data: {
      name,
      leagueAppsEventId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
  });
  res.status(201).json(event);
});

eventsRouter.get("/events", async (_req, res) => {
  res.json(await prisma.event.findMany({ orderBy: { createdAt: "desc" } }));
});

eventsRouter.get("/events/:eventId", async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.eventId },
    include: { participation: true },
  });
  if (!event) return res.status(404).json({ error: "event not found" });
  res.json(event);
});

eventsRouter.get("/events/:eventId/order-totals", async (req, res) => {
  res.json(await getOrderTotalsForEvent(req.params.eventId));
});

const participationSchema = z.object({
  playerId: z.string().min(1),
  pointsEarned: z.number().int().default(0),
  placement: z.number().int().optional(),
});

eventsRouter.post("/events/:eventId/participation", async (req, res) => {
  const parsed = participationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { playerId, pointsEarned, placement } = parsed.data;
  const participation = await prisma.eventParticipation.upsert({
    where: { playerId_eventId: { playerId, eventId: req.params.eventId } },
    update: { pointsEarned, placement },
    create: { playerId, eventId: req.params.eventId, pointsEarned, placement },
  });
  res.status(201).json(participation);
});
