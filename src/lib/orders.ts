/**
 * The six ODS Orders, in a fixed, never-reordered sequence. Index in this
 * array is load-bearing: assignOrder() below maps a hash to an index, so
 * appending is safe but reordering or removing an entry reassigns every
 * existing player.
 */
export const ORDERS = [
  { slug: "varghona", name: "Varghona", animal: "wolf" },
  { slug: "tuskarium", name: "Tuskarium", animal: "elephant" },
  { slug: "aetherwing", name: "Aetherwing", animal: "eagle" },
  { slug: "serikon", name: "Serikon", animal: "snake" },
  { slug: "thalkara", name: "Thalkara", animal: "kraken" },
  { slug: "ursonne", name: "Ursonne", animal: "bear" },
] as const;

export type OrderSlug = (typeof ORDERS)[number]["slug"];

export const ORDER_SLUGS: readonly OrderSlug[] = ORDERS.map((o) => o.slug);

export function isOrderSlug(value: string): value is OrderSlug {
  return (ORDER_SLUGS as readonly string[]).includes(value);
}
