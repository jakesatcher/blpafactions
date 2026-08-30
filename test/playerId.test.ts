import { describe, expect, it } from "vitest";
import { emailToPlayerId, playerIdToEmail } from "../src/lib/playerId";

describe("playerId", () => {
  it("round-trips through encode/decode", () => {
    const email = "jane.doe@example.com";
    expect(playerIdToEmail(emailToPlayerId(email))).toBe(email);
  });

  it("normalizes before encoding", () => {
    expect(emailToPlayerId("  Jane.Doe@Example.COM ")).toBe(
      emailToPlayerId("jane.doe@example.com"),
    );
  });

  it("produces a URL-safe id", () => {
    const id = emailToPlayerId("weird+chars/test@example.com");
    expect(id).not.toMatch(/[+/=]/);
  });
});
