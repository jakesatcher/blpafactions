import { createHash } from "crypto";
import { ORDERS, type OrderSlug } from "./orders";

/**
 * Normalizes an email the same way everywhere it's used as a key:
 * trimmed and lowercased. Every function below assumes its input has
 * already been normalized, or normalizes it itself — never mix raw and
 * normalized emails when computing IDs/assignments.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deterministically assigns a BLPA player to one of the six ODS Orders
 * based on their email. Deterministic = same email always yields the same
 * Order, with no lookup required and no stored assignment table to drift.
 *
 * Algorithm: SHA-256 the normalized email, take the first 4 bytes of the
 * digest as an unsigned big-endian integer, mod 6, index into ORDERS.
 * This is a classification hash, not a security control — it does not
 * need to be cryptographically unpredictable, only stable and roughly
 * uniform across the six Orders.
 */
export function assignOrder(email: string): OrderSlug {
  const normalized = normalizeEmail(email);
  const digest = createHash("sha256").update(normalized).digest();
  const bucket = digest.readUInt32BE(0) % ORDERS.length;
  return ORDERS[bucket].slug;
}
