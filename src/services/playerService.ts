import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { assignOrder, normalizeEmail } from "../lib/orderAssignment";
import { emailToPlayerId } from "../lib/playerId";

export interface UpsertPlayerInput {
  email: string;
  displayName?: string;
  leagueAppsUserId?: string;
}

type PlayerWithOrderAndProgress = Prisma.PlayerGetPayload<{
  include: { progress: true; order: true };
}>;

export interface GetOrCreatePlayerResult {
  player: PlayerWithOrderAndProgress;
  /**
   * true only when this call assigned a brand-new player to an Order.
   * false means the player already existed and their Order was left
   * untouched — see the comment above the `existing` branch below for
   * why that's structurally guaranteed, not just a convention.
   */
  created: boolean;
}

/**
 * Finds the player for an email, or creates one (assigning their Order
 * and an initial OrderProgress row) the first time that email is seen.
 * This is the single path every player-creation source — the GUI, the
 * LeagueApps member import, the registration webhook/sync — funnels
 * through, specifically so "has this player already been assigned a
 * Faction?" only has to be answered correctly in one place.
 *
 * An email that already has a player is NEVER reassigned to a
 * different Order, no matter what assignOrder(email) computes on this
 * call — not because assignOrder is trusted to always return the same
 * answer (it is, today, but future code could change ORDERS or the
 * hash), but because the update path below has no `orderSlug` field in
 * it at all. There is no code path through this function, on any input,
 * that can move an existing player to a different Order.
 */
export async function getOrCreatePlayer(input: UpsertPlayerInput): Promise<GetOrCreatePlayerResult> {
  const email = normalizeEmail(input.email);
  const id = emailToPlayerId(email);

  const existing = await prisma.player.findUnique({ where: { id } });
  if (existing) {
    const player = await prisma.player.update({
      where: { id },
      data: {
        displayName: input.displayName,
        leagueAppsUserId: input.leagueAppsUserId,
      },
      include: { progress: true, order: true },
    });
    return { player, created: false };
  }

  const orderSlug = assignOrder(email);
  const player = await prisma.player.upsert({
    where: { id },
    update: {
      // Only reached if another request created this same player in the
      // gap between the findUnique above and this upsert. Still no
      // orderSlug field here, for the same reason as the branch above.
      displayName: input.displayName,
      leagueAppsUserId: input.leagueAppsUserId,
    },
    create: {
      id,
      email,
      displayName: input.displayName,
      leagueAppsUserId: input.leagueAppsUserId,
      orderSlug,
      progress: { create: { orderSlug } },
    },
    include: { progress: true, order: true },
  });
  // `created` is reported optimistically here — under the race described
  // above it could actually have hit the `update` branch — but that only
  // affects this audit flag, never which Order the player ends up in.
  return { player, created: true };
}

export async function addPoints(playerId: string, points: number) {
  return prisma.orderProgress.update({
    where: { playerId },
    data: { points: { increment: points } },
  });
}

export async function recordAchievement(
  playerId: string,
  code: string,
  title: string,
  eventId?: string,
) {
  return prisma.achievement.upsert({
    where: { playerId_code: { playerId, code } },
    update: {},
    create: { playerId, code, title, eventId },
  });
}
