import { describe, expect, it } from "vitest";
import { parsePlayerCsv } from "../src/services/bulkPlayerImport";

describe("parsePlayerCsv", () => {
  it("parses a plain comma-separated file", () => {
    const csv = "email,displayName\nalice@example.com,Alice A\nbob@example.com,Bob B\n";
    const { rows, errors } = parsePlayerCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, email: "alice@example.com", displayName: "Alice A" },
      { line: 3, email: "bob@example.com", displayName: "Bob B" },
    ]);
  });

  it("is tolerant of header case/spacing and common synonyms", () => {
    const csv = " Email , Full Name \nalice@example.com,Alice A\n";
    const { rows, errors } = parsePlayerCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ line: 2, email: "alice@example.com", displayName: "Alice A" }]);
  });

  it("handles semicolon- and tab-separated files", () => {
    const semicolon = parsePlayerCsv("email;displayName\nalice@example.com;Alice A\n");
    expect(semicolon.rows).toEqual([{ line: 2, email: "alice@example.com", displayName: "Alice A" }]);

    const tab = parsePlayerCsv("email\tdisplayName\nalice@example.com\tAlice A\n");
    expect(tab.rows).toEqual([{ line: 2, email: "alice@example.com", displayName: "Alice A" }]);
  });

  it("works without a displayName column at all", () => {
    const { rows, errors } = parsePlayerCsv("email\nalice@example.com\n");
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ line: 2, email: "alice@example.com", displayName: undefined }]);
  });

  it("handles a quoted field containing the delimiter", () => {
    const csv = 'email,displayName\nalice@example.com,"Anderson, Alice"\n';
    const { rows } = parsePlayerCsv(csv);
    expect(rows[0].displayName).toBe("Anderson, Alice");
  });

  it("reports missing/invalid emails with their original line number instead of aborting", () => {
    const csv = [
      "email,displayName",
      "alice@example.com,Alice A",
      ",No Email",
      "not-an-email,Bad Email",
      "bob@example.com,Bob B",
    ].join("\n");
    const { rows, errors } = parsePlayerCsv(csv);
    expect(rows.map((r) => r.email)).toEqual(["alice@example.com", "bob@example.com"]);
    expect(errors).toEqual([
      { line: 3, message: "missing email" },
      { line: 4, message: 'invalid email: "not-an-email"' },
    ]);
  });

  it("reports a clear error when there's no email column", () => {
    const { rows, errors } = parsePlayerCsv("name,team\nAlice,Red\n");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/no "email" column/);
  });

  it("reports a clear error for an empty file", () => {
    const { rows, errors } = parsePlayerCsv("");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});
