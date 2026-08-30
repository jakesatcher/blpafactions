import { normalizeEmail } from "./orderAssignment";

/**
 * Player IDs are the base64url encoding of the normalized email — this is
 * an encoding, not encryption: `playerIdToEmail` trivially reverses it.
 * It exists so a player's correlation key can be derived from their email
 * alone (no DB round-trip) when linking records from LeagueApps or other
 * event data. Treat player IDs with the same care as email addresses —
 * don't log them or expose them anywhere the underlying email shouldn't
 * be exposed.
 */
export function emailToPlayerId(email: string): string {
  return Buffer.from(normalizeEmail(email), "utf8").toString("base64url");
}

export function playerIdToEmail(playerId: string): string {
  return Buffer.from(playerId, "base64url").toString("utf8");
}
