import { prisma } from "../lib/prisma";
import { getOrCreatePlayer } from "./playerService";
import type { LeagueAppsRegistration } from "./leagueapps";

/**
 * Applies a single LeagueApps registration to our database: upserts the
 * player (assigning their Order on first sight), upserts the event, and
 * upserts the participation row. Idempotent — safe to replay the same
 * registration from a webhook retry or a manual re-sync.
 */
export async function applyRegistration(reg: LeagueAppsRegistration) {
  const { player, created } = await getOrCreatePlayer({
    email: reg.email,
    displayName: reg.displayName,
    leagueAppsUserId: reg.userId,
  });

  const event = await prisma.event.upsert({
    where: { leagueAppsEventId: reg.eventId },
    update: { name: reg.eventName },
    create: { leagueAppsEventId: reg.eventId, name: reg.eventName },
  });

  const participation = await prisma.eventParticipation.upsert({
    where: { playerId_eventId: { playerId: player.id, eventId: event.id } },
    update: { pointsEarned: reg.pointsEarned ?? 0 },
    create: {
      playerId: player.id,
      eventId: event.id,
      pointsEarned: reg.pointsEarned ?? 0,
      registeredAt: reg.registeredAt ? new Date(reg.registeredAt) : undefined,
    },
  });

  return { player, playerCreated: created, event, participation };
}
