import { prisma } from "../lib/prisma";
import { assignOrder, normalizeEmail } from "../lib/orderAssignment";
import { emailToPlayerId } from "../lib/playerId";

export interface UpsertPlayerInput {
  email: string;
  displayName?: string;
  leagueAppsUserId?: string;
}

/**
 * Finds the player for an email, creating them (with their Order
 * assignment and an initial OrderProgress row) if this is the first time
 * we've seen them. Safe to call repeatedly — subsequent calls only touch
 * denormalized fields (displayName, leagueAppsUserId) and never change
 * the player's id or Order.
 */
export async function getOrCreatePlayer(input: UpsertPlayerInput) {
  const email = normalizeEmail(input.email);
  const id = emailToPlayerId(email);

  return prisma.player.upsert({
    where: { id },
    update: {
      displayName: input.displayName,
      leagueAppsUserId: input.leagueAppsUserId,
    },
    create: {
      id,
      email,
      displayName: input.displayName,
      leagueAppsUserId: input.leagueAppsUserId,
      orderSlug: assignOrder(email),
      progress: {
        create: {
          orderSlug: assignOrder(email),
        },
      },
    },
    include: { progress: true, order: true },
  });
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
