import { createHmac, timingSafeEqual } from "crypto";

/**
 * NOTE: everything in this file predates
 * https://leagueapps.notion.site/LeagueApps-API-Documentation and was
 * never confirmed against it — the docs describe a "Public API Key"
 * bearer-token style distinct from the JWT-bearer "Private API" used for
 * exports, so this may still be correct, but it hasn't been checked.
 * The player-roster import (POST /sync/leagueapps/members) uses the
 * verified path instead — see src/services/leagueappsPrivateApi.ts and
 * src/services/memberImport.ts.
 */
export interface LeagueAppsRegistration {
  email: string;
  displayName?: string;
  userId: string;
  eventId: string;
  eventName: string;
  pointsEarned?: number;
  registeredAt?: string;
}

/**
 * Thin client for the LeagueApps API. The actual endpoints/response
 * shapes depend on the LeagueApps program configuration and API version
 * in use, so `listRegistrations` is intentionally a stub to be filled in
 * against the real LeagueApps API docs/credentials — the surrounding
 * sync flow (playerService.getOrCreatePlayer + participation upsert in
 * src/routes/leagueapps.ts) is what actually matters and doesn't change
 * once that call is wired up.
 */
export class LeagueAppsClient {
  constructor(
    private readonly apiBase: string,
    private readonly apiKey: string,
  ) {}

  async listRegistrations(eventId: string): Promise<LeagueAppsRegistration[]> {
    const res = await fetch(`${this.apiBase}/events/${eventId}/registrations`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(
        `LeagueApps API error ${res.status} fetching registrations for event ${eventId}`,
      );
    }
    return (await res.json()) as LeagueAppsRegistration[];
  }
}

export function leagueAppsClientFromEnv(): LeagueAppsClient {
  const apiBase = process.env.LEAGUEAPPS_API_BASE;
  const apiKey = process.env.LEAGUEAPPS_API_KEY;
  if (!apiBase || !apiKey) {
    throw new Error("LEAGUEAPPS_API_BASE / LEAGUEAPPS_API_KEY are not configured");
  }
  return new LeagueAppsClient(apiBase, apiKey);
}

/**
 * Verifies an HMAC-SHA256 webhook signature the way most webhook
 * providers do it (hex digest of the raw body under a shared secret,
 * compared in constant time). Adjust the header/encoding here to match
 * whatever LeagueApps's webhook docs specify once available.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
