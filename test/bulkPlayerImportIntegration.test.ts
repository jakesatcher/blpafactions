import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { bulkImportPlayersFromCsv } from "../src/services/bulkPlayerImport";
import { emailToPlayerId } from "../src/lib/playerId";

describe("bulkImportPlayersFromCsv — integration", () => {
  const emails = ["bulk1@example.com", "bulk2@example.com", "bulk3@example.com"];
  const ids = emails.map(emailToPlayerId);

  beforeEach(async () => {
    await prisma.player.deleteMany({ where: { id: { in: ids } } });
  });

  afterAll(async () => {
    await prisma.player.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("dry run previews without writing anything", async () => {
    const csv = "email,displayName\nbulk1@example.com,Bulk One\nbulk2@example.com,Bulk Two\n";
    const summary = await bulkImportPlayersFromCsv(csv, { dryRun: true });

    expect(summary.dryRun).toBe(true);
    expect(summary.newlyAssigned).toBe(2);
    expect(summary.alreadyAssigned).toBe(0);
    expect(summary.invalid).toBe(0);

    const rows = await prisma.player.findMany({ where: { id: { in: ids } } });
    expect(rows).toHaveLength(0);
  });

  it("commits on a real (non-dry-run) import", async () => {
    const csv = "email,displayName\nbulk1@example.com,Bulk One\nbulk2@example.com,Bulk Two\n";
    const summary = await bulkImportPlayersFromCsv(csv, { dryRun: false });

    expect(summary.newlyAssigned).toBe(2);
    expect(summary.alreadyAssigned).toBe(0);

    const rows = await prisma.player.findMany({ where: { id: { in: ids } }, orderBy: { email: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].displayName).toBe("Bulk One");
  });

  it("re-uploading the same file never reassigns or duplicates", async () => {
    const csv = "email,displayName\nbulk1@example.com,Bulk One\nbulk2@example.com,Bulk Two\n";
    const first = await bulkImportPlayersFromCsv(csv, { dryRun: false });
    const firstOrders = Object.fromEntries(first.rows.map((r) => [r.email, r.orderSlug]));

    const second = await bulkImportPlayersFromCsv(csv, { dryRun: false });
    expect(second.newlyAssigned).toBe(0);
    expect(second.alreadyAssigned).toBe(2);
    for (const row of second.rows) {
      expect(row.orderSlug).toBe(firstOrders[row.email]);
    }

    const rows = await prisma.player.findMany({ where: { id: { in: ids } } });
    expect(rows).toHaveLength(2);
  });

  it("flags a duplicate email within the same file and doesn't double-assign it", async () => {
    const csv = "email,displayName\nbulk3@example.com,First\nbulk3@example.com,Second\n";
    const summary = await bulkImportPlayersFromCsv(csv, { dryRun: false });

    expect(summary.newlyAssigned).toBe(1);
    expect(summary.alreadyAssigned).toBe(1);
    expect(summary.rows[0].duplicateWithinFile).toBeFalsy();
    expect(summary.rows[1].duplicateWithinFile).toBe(true);
    expect(summary.rows[1].orderSlug).toBe(summary.rows[0].orderSlug);

    const rows = await prisma.player.findMany({ where: { id: ids[2] } });
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Second"); // profile fields still update
  });

  it("imports clean rows and reports invalid ones without aborting the batch", async () => {
    const csv = [
      "email,displayName",
      "bulk1@example.com,Good Row",
      ",Missing Email",
      "not-an-email,Bad Email",
    ].join("\n");
    const summary = await bulkImportPlayersFromCsv(csv, { dryRun: false });

    expect(summary.newlyAssigned).toBe(1);
    expect(summary.invalid).toBe(2);
    expect(summary.parseErrors).toHaveLength(2);

    const rows = await prisma.player.findMany({ where: { id: ids[0] } });
    expect(rows).toHaveLength(1);
  });
});
