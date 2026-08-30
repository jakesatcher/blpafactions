import { describe, expect, it } from "vitest";
import { assignOrder, normalizeEmail } from "../src/lib/orderAssignment";
import { ORDER_SLUGS } from "../src/lib/orders";

describe("assignOrder", () => {
  it("is deterministic for the same email", () => {
    const email = "player@example.com";
    expect(assignOrder(email)).toBe(assignOrder(email));
  });

  it("is case- and whitespace-insensitive", () => {
    expect(assignOrder("  Player@Example.com ")).toBe(
      assignOrder("player@example.com"),
    );
  });

  it("always returns a valid Order slug", () => {
    const emails = Array.from({ length: 200 }, (_, i) => `player${i}@example.com`);
    for (const email of emails) {
      expect(ORDER_SLUGS).toContain(assignOrder(email));
    }
  });

  it("distributes across all six Orders over a large sample", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      seen.add(assignOrder(`user${i}@blpa.test`));
    }
    expect(seen.size).toBe(6);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM  ")).toBe("foo.bar@example.com");
  });
});
