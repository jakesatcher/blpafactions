import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/adminAuth";
import { applyRegistration } from "../services/eventSync";
import { leagueAppsClientFromEnv } from "../services/leagueapps";
import { verifyWebhookSignature } from "../services/leagueapps";

export const leagueAppsRouter = Router();

const registrationSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  userId: z.string(),
  eventId: z.string(),
  eventName: z.string(),
  pointsEarned: z.number().int().optional(),
  registeredAt: z.string().optional(),
});

const webhookSchema = z.object({
  registration: registrationSchema,
});

/**
 * Receives a LeagueApps registration webhook and syncs it into the ODS
 * database. Requires `express.raw()` on this route (wired in src/index.ts)
 * so the raw body bytes are available for signature verification.
 */
leagueAppsRouter.post("/webhooks/leagueapps", async (req, res) => {
  const secret = process.env.LEAGUEAPPS_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.header("x-leagueapps-signature");
    const rawBody = req.body as Buffer;
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return res.status(401).json({ error: "invalid webhook signature" });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse((req.body as Buffer).toString("utf8"));
  } catch {
    return res.status(400).json({ error: "invalid JSON body" });
  }

  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await applyRegistration(parsed.data.registration);
  res.status(200).json({
    playerId: result.player.id,
    orderSlug: result.player.orderSlug,
    eventId: result.event.id,
  });
});

/**
 * Manually pulls all registrations for a LeagueApps event and syncs them.
 * Useful for backfills and for environments without a reachable webhook.
 */
leagueAppsRouter.post("/sync/leagueapps/events/:eventId", requireAdmin, async (req, res) => {
  const client = leagueAppsClientFromEnv();
  const registrations = await client.listRegistrations(req.params.eventId);
  const results = [];
  for (const reg of registrations) {
    results.push(await applyRegistration(reg));
  }
  res.json({ synced: results.length });
});
