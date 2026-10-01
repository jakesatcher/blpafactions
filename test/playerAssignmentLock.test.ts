import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import { getOrCreatePlayer } from "../src/services/playerService";
import { emailToPlayerId } from "../src/lib/playerId";
import type { OrderSlug } from "../src/lib/orders";

/**
 * Runs against a real Postgres database (DATABASE_URL in .env) rather
 * than a mock — the guarantee under test is "the DB row never changes
 * orderSlug on a second call", which is ultimately a statement about
 * what SQL getOrCreatePlayer sends, not just its TypeScript.
 */
describe("getOrCreatePlayer — Order assignment is a one-time, permanent check", () => {
  const email = "faction-lock-test@example.com";
  const id = emailToPlayerId(email);

  beforeEach(async () => {
    await prisma.player.deleteMany({ where: { id } });
  });

  afterAll(async () => {
    await prisma.player.deleteMany({ where: { id } });
    await prisma.$disconnect();
  });

  it("reports created:true the first time and created:false afterward", async () => {
    const first = await getOrCreatePlayer({ email, displayName: "First Call" });
    expect(first.created).toBe(true);

    const second = await getOrCreatePlayer({ email, displayName: "Second Call" });
    expect(second.created).toBe(false);
    // Profile fields are still allowed to update...
    expect(second.player.displayName).toBe("Second Call");
    // ...but the Order assignment from the first call is untouched.
    expect(second.player.orderSlug).toBe(first.player.orderSlug);
  });

  it("never moves an existing player even if assignOrder's output changes", async () => {
    const first = await getOrCreatePlayer({ email });
    const originalOrderSlug = first.player.orderSlug;

    // Simulate the one real-world way this could go wrong: the ORDERS
    // list or hash changes later, so assignOrder(email) now returns a
    // different Order than it did at creation time (see the warning in
    // src/lib/orders.ts about reordering ORDERS). getOrCreatePlayer must
    // still refuse to move this player, because its update path never
    // writes orderSlug at all — this isn't testing that assignOrder
    // happens to be stable, it's testing that the write path can't
    // apply a new answer even when assignOrder's answer does change.
    const differentSlug: OrderSlug = originalOrderSlug === "varghona" ? "ursonne" : "varghona";
    const orderAssignment = await import("../src/lib/orderAssignment");
    vi.spyOn(orderAssignment, "assignOrder").mockReturnValue(differentSlug);

    const second = await getOrCreatePlayer({ email });

    expect(second.created).toBe(false);
    expect(second.player.orderSlug).toBe(originalOrderSlug);
    expect(second.player.orderSlug).not.toBe(differentSlug);

    vi.restoreAllMocks();
  });

  it("re-importing the same email never creates a duplicate row", async () => {
    await getOrCreatePlayer({ email });
    await getOrCreatePlayer({ email });
    await getOrCreatePlayer({ email });

    const rows = await prisma.player.findMany({ where: { id } });
    expect(rows).toHaveLength(1);
  });
});
