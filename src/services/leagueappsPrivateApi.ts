import { getAccessToken } from "./leagueappsAuth";

/**
 * Client for the LeagueApps Private API export endpoints
 * (GET /v2/sites/{siteId}/export/{type}), per
 * https://leagueapps.notion.site/LeagueApps-API-Documentation. Field
 * names below are copied verbatim from that doc's sample responses —
 * this is the one part of the LeagueApps integration verified against
 * real documentation (see src/services/leagueapps.ts for the older,
 * unverified registrations/webhook code).
 */

/** One row from GET /v2/sites/{siteId}/export/members-2. `email` is
 * null for CHILD-type members, who use a parent's account/email. */
export interface LeagueAppsMember {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  type: "ADULT" | "CHILD" | "ORPHAN";
  deleted: boolean;
  lastUpdated: number;
}

export type LeagueAppsExportType = "members-2" | "registrations-2";

export interface ExportCursor {
  lastUpdated: number;
  lastId: number;
}

export interface LeagueAppsPrivateApiConfig {
  apiBase: string;
  siteId: string;
}

export function leagueAppsPrivateApiConfigFromEnv(): LeagueAppsPrivateApiConfig {
  const apiBase = process.env.LEAGUEAPPS_API_BASE;
  const siteId = process.env.LEAGUEAPPS_SITE_ID;
  if (!apiBase || !siteId) {
    throw new Error("LEAGUEAPPS_API_BASE / LEAGUEAPPS_SITE_ID are not configured");
  }
  return { apiBase, siteId };
}

export class LeagueAppsPrivateApiClient {
  constructor(private readonly config: LeagueAppsPrivateApiConfig) {}

  /**
   * One page (max 1000 rows, per the docs) of an export endpoint,
   * starting after the given cursor.
   */
  async exportPage<T>(
    type: LeagueAppsExportType,
    cursor: ExportCursor,
    extraParams: Record<string, string> = {},
  ): Promise<T[]> {
    const token = await getAccessToken();
    const url = new URL(`${this.config.apiBase}/v2/sites/${this.config.siteId}/export/${type}`);
    url.searchParams.set("last-updated", String(cursor.lastUpdated));
    url.searchParams.set("last-id", String(cursor.lastId));
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`LeagueApps export/${type} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T[];
  }

  /**
   * Pages through an export endpoint from `startCursor` to the end,
   * yielding one batch of rows per page. Follows the pagination recipe
   * from LeagueApps' own sample script: advance the cursor to the last
   * row of each page, and drop a page's leading row if it's the same
   * (id, lastUpdated) as the cursor it was fetched with — the cursor is
   * inclusive, so that boundary row is otherwise returned twice. This
   * applies uniformly to `startCursor` itself, not just cursors this
   * generator produced internally: a `startCursor` loaded from a
   * previous run's persisted position is exactly as "already seen" as
   * one from the page before it, so treating the first page as a special
   * case would just reprocess that same boundary row on every resume.
   * Safe as an unconditional check because LeagueApps ids are never 0,
   * so it never fires on a genuine first call starting at (0, 0).
   */
  async *iterateExport<T extends { id: number; lastUpdated: number }>(
    type: LeagueAppsExportType,
    startCursor: ExportCursor = { lastUpdated: 0, lastId: 0 },
    extraParams: Record<string, string> = {},
  ): AsyncGenerator<T[]> {
    let cursor = startCursor;

    for (;;) {
      const page = await this.exportPage<T>(type, cursor, extraParams);
      if (page.length === 0) return;

      const rows =
        page[0].id === cursor.lastId && page[0].lastUpdated === cursor.lastUpdated
          ? page.slice(1)
          : page;

      // A page that's nothing but the already-seen boundary row means
      // there's no new data past the cursor — and since the cursor can't
      // advance past a row we just dropped, looping again would refetch
      // this exact page forever. Stop here instead.
      if (rows.length === 0) return;

      const last = page[page.length - 1];
      cursor = { lastUpdated: last.lastUpdated, lastId: last.id };
      yield rows;
    }
  }
}

export function leagueAppsPrivateApiClientFromEnv(): LeagueAppsPrivateApiClient {
  return new LeagueAppsPrivateApiClient(leagueAppsPrivateApiConfigFromEnv());
}
