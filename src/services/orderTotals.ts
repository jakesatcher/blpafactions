import { prisma } from "../lib/prisma";
import { ORDERS } from "../lib/orders";

export interface OrderTotal {
  slug: string;
  name: string;
  animal: string;
  totalPoints: number;
  playerCount: number;
}

/**
 * Order standings, all-time. Derived on read from OrderProgress (rather
 * than maintained as a separate running-total table) so it can never
 * drift out of sync with the per-player points it summarizes.
 */
export async function getOrderTotals(): Promise<OrderTotal[]> {
  const grouped = await prisma.orderProgress.groupBy({
    by: ["orderSlug"],
    _sum: { points: true },
    _count: { playerId: true },
  });

  const byOrder = new Map(grouped.map((g) => [g.orderSlug, g]));

  return ORDERS.map((order) => ({
    slug: order.slug,
    name: order.name,
    animal: order.animal,
    totalPoints: byOrder.get(order.slug)?._sum.points ?? 0,
    playerCount: byOrder.get(order.slug)?._count.playerId ?? 0,
  }));
}

/**
 * Order standings for a single event, derived from EventParticipation
 * joined through to each player's Order.
 */
export async function getOrderTotalsForEvent(eventId: string): Promise<OrderTotal[]> {
  const participation = await prisma.eventParticipation.findMany({
    where: { eventId },
    select: { pointsEarned: true, player: { select: { orderSlug: true } } },
  });

  const totals = new Map<string, { points: number; players: number }>();
  for (const p of participation) {
    const slug = p.player.orderSlug;
    const current = totals.get(slug) ?? { points: 0, players: 0 };
    current.points += p.pointsEarned;
    current.players += 1;
    totals.set(slug, current);
  }

  return ORDERS.map((order) => ({
    slug: order.slug,
    name: order.name,
    animal: order.animal,
    totalPoints: totals.get(order.slug)?.points ?? 0,
    playerCount: totals.get(order.slug)?.players ?? 0,
  }));
}
