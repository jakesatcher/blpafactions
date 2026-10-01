import { parse } from "csv-parse/sync";
import { prisma } from "../lib/prisma";
import { assignOrder, normalizeEmail } from "../lib/orderAssignment";
import { emailToPlayerId } from "../lib/playerId";
import { getOrCreatePlayer } from "./playerService";

/**
 * Bulk player import from a CSV (or Excel's regional variants — comma,
 * semicolon, or tab separated) with an `email` column and an optional
 * display-name column. This is the "manual upload" input path alongside
 * the LeagueApps member import and BLST's per-player POST /players
 * calls — all three funnel through getOrCreatePlayer, so a row for an
 * email that's already a player confirms the existing Order rather than
 * reassigning it (see src/services/playerService.ts).
 */

// Matched against headers already lowercased with separators stripped
// (see the `columns` callback below), so "E-Mail" and "Email Address"
// both normalize to one of these, no separate variants needed.
const EMAIL_HEADER_CANDIDATES = ["email", "emailaddress"];
const NAME_HEADER_CANDIDATES = ["displayname", "name", "fullname"];

export interface ParsedCsvRow {
  line: number;
  email: string;
  displayName?: string;
}

export interface CsvParseError {
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  errors: CsvParseError[];
}

/**
 * Parses raw CSV/TSV text into rows ready for import. Tolerant of header
 * casing/spacing and a few common header spellings; any row missing or
 * failing basic email validation is reported in `errors` (with its
 * original line number) rather than aborting the whole file, matching
 * BLST's own CSV roster upload's "flag problems with line numbers,
 * import what's clean" behavior.
 */
export function parsePlayerCsv(text: string): CsvParseResult {
  let records: Record<string, string>[];
  try {
    records = parse(text, {
      // Collapses "Full Name" / "full_name" / "Full-Name" to the same
      // "fullname" key so the candidate lists below only need one form.
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "")),
      delimiter: [",", ";", "\t"],
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (err) {
    return { rows: [], errors: [{ line: 0, message: `could not parse CSV: ${(err as Error).message}` }] };
  }

  if (records.length === 0) {
    return { rows: [], errors: [{ line: 0, message: "no data rows found" }] };
  }

  const headers = Object.keys(records[0]);
  const emailHeader = headers.find((h) => EMAIL_HEADER_CANDIDATES.includes(h));
  if (!emailHeader) {
    return { rows: [], errors: [{ line: 0, message: `no "email" column found (saw: ${headers.join(", ")})` }] };
  }
  const nameHeader = headers.find((h) => NAME_HEADER_CANDIDATES.includes(h));

  const rows: ParsedCsvRow[] = [];
  const errors: CsvParseError[] = [];

  records.forEach((record, index) => {
    const line = index + 2; // header is line 1, records are 1-indexed after it
    const rawEmail = (record[emailHeader] ?? "").trim();
    if (!rawEmail) {
      errors.push({ line, message: "missing email" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      errors.push({ line, message: `invalid email: "${rawEmail}"` });
      return;
    }
    const displayName = nameHeader ? record[nameHeader]?.trim() || undefined : undefined;
    rows.push({ line, email: rawEmail, displayName });
  });

  return { rows, errors };
}

export interface BulkUploadRowResult {
  line: number;
  email: string;
  displayName?: string;
  status: "newlyAssigned" | "alreadyAssigned";
  orderSlug: string;
  playerId: string;
  /** This email appeared earlier in the same upload, not just in a past run. */
  duplicateWithinFile?: boolean;
}

export interface BulkUploadSummary {
  dryRun: boolean;
  totalDataRows: number;
  newlyAssigned: number;
  alreadyAssigned: number;
  invalid: number;
  rows: BulkUploadRowResult[];
  parseErrors: CsvParseError[];
}

/**
 * Processes already-parsed rows. In dry-run mode this never writes —
 * `newlyAssigned` previews what assignOrder(email) would pick, without
 * creating anything, so an admin can preview before committing (same
 * pattern BLST's own roster CSV upload uses). Rows are processed one at
 * a time, in file order, so a duplicate email within the same file
 * naturally resolves the same way a duplicate across two separate
 * uploads would: the second occurrence sees the first's write and
 * reports alreadyAssigned rather than a second Order assignment.
 */
export async function importPlayerRows(
  rows: ParsedCsvRow[],
  { dryRun }: { dryRun: boolean },
): Promise<Omit<BulkUploadSummary, "parseErrors" | "invalid">> {
  const results: BulkUploadRowResult[] = [];
  const seenEmails = new Set<string>();
  let newlyAssigned = 0;
  let alreadyAssigned = 0;

  for (const row of rows) {
    const normalized = normalizeEmail(row.email);
    const duplicateWithinFile = seenEmails.has(normalized);
    seenEmails.add(normalized);

    if (dryRun) {
      const id = emailToPlayerId(normalized);
      const existing = await prisma.player.findUnique({ where: { id } });
      const created = !existing && !duplicateWithinFile;
      results.push({
        line: row.line,
        email: row.email,
        displayName: row.displayName,
        status: created ? "newlyAssigned" : "alreadyAssigned",
        orderSlug: existing?.orderSlug ?? assignOrder(normalized),
        playerId: id,
        duplicateWithinFile,
      });
      if (created) newlyAssigned += 1;
      else alreadyAssigned += 1;
      continue;
    }

    const { player, created } = await getOrCreatePlayer({ email: row.email, displayName: row.displayName });
    results.push({
      line: row.line,
      email: row.email,
      displayName: row.displayName,
      status: created ? "newlyAssigned" : "alreadyAssigned",
      orderSlug: player.orderSlug,
      playerId: player.id,
      duplicateWithinFile,
    });
    if (created) newlyAssigned += 1;
    else alreadyAssigned += 1;
  }

  return {
    dryRun,
    totalDataRows: rows.length,
    newlyAssigned,
    alreadyAssigned,
    rows: results,
  };
}

export async function bulkImportPlayersFromCsv(
  text: string,
  { dryRun }: { dryRun: boolean },
): Promise<BulkUploadSummary> {
  const { rows, errors } = parsePlayerCsv(text);
  const processed = await importPlayerRows(rows, { dryRun });
  return { ...processed, invalid: errors.length, parseErrors: errors };
}
