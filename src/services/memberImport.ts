import { prisma } from "../lib/prisma";
import { getOrCreatePlayer } from "./playerService";
import {
  leagueAppsPrivateApiClientFromEnv,
  type ExportCursor,
  type LeagueAppsMember,
} from "./leagueappsPrivateApi";

const CURSOR_SOURCE = "leagueapps-members-2";

async function loadCursor(): Promise<ExportCursor> {
  const row = await prisma.syncCursor.findUnique({ where: { source: CURSOR_SOURCE } });
  return { lastUpdated: Number(row?.lastUpdated ?? 0), lastId: Number(row?.lastId ?? 0) };
}

async function saveCursor(cursor: ExportCursor): Promise<void> {
  await prisma.syncCursor.upsert({
    where: { source: CURSOR_SOURCE },
    update: { lastUpdated: BigInt(cursor.lastUpdated), lastId: BigInt(cursor.lastId) },
    create: {
      source: CURSOR_SOURCE,
      lastUpdated: BigInt(cursor.lastUpdated),
      lastId: BigInt(cursor.lastId),
    },
  });
}

export interface MemberImportSummary {
  pagesProcessed: number;
  totalSeen: number;
  imported: number;
  skippedDeleted: number;
  skippedNoEmail: number;
  cursor: ExportCursor;
}

/**
 * Imports the LeagueApps member roster (GET /export/members-2) into our
 * Player table, encoding each member's email as their player id and
 * assigning their Order on first sight — the same getOrCreatePlayer path
 * used by the GUI and the event-registration sync, so an import is
 * indistinguishable afterward from a player created any other way.
 *
 * Incremental by default: resumes from the SyncCursor left by the last
 * run, matching the "periodic sync of new data since the last request"
 * usage the LeagueApps docs describe this API for. Pass `fromScratch` to
 * re-walk the entire roster (safe — getOrCreatePlayer is an upsert).
 *
 * A CHILD-type LeagueApps member has no email of their own (they're
 * attached to a parent's account) — our Order/player-id scheme requires
 * one, so those rows are skipped and counted rather than guessed at.
 * Deleted members are skipped too.
 */
export async function importMembers({
  fromScratch = false,
}: { fromScratch?: boolean } = {}): Promise<MemberImportSummary> {
  const client = leagueAppsPrivateApiClientFromEnv();
  const startCursor = fromScratch ? { lastUpdated: 0, lastId: 0 } : await loadCursor();

  const summary: MemberImportSummary = {
    pagesProcessed: 0,
    totalSeen: 0,
    imported: 0,
    skippedDeleted: 0,
    skippedNoEmail: 0,
    cursor: startCursor,
  };

  for await (const page of client.iterateExport<LeagueAppsMember>("members-2", startCursor)) {
    summary.pagesProcessed += 1;
    summary.totalSeen += page.length;

    for (const member of page) {
      if (member.deleted) {
        summary.skippedDeleted += 1;
        continue;
      }
      if (!member.email) {
        summary.skippedNoEmail += 1;
        continue;
      }

      const displayName = [member.firstName, member.lastName].filter(Boolean).join(" ") || undefined;
      await getOrCreatePlayer({
        email: member.email,
        displayName,
        leagueAppsUserId: String(member.userId),
      });
      summary.imported += 1;
    }

    const last = page[page.length - 1];
    summary.cursor = { lastUpdated: last.lastUpdated, lastId: last.id };
    await saveCursor(summary.cursor);
  }

  return summary;
}
