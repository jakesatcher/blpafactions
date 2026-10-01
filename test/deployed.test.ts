import { describe, expect, it } from "vitest";
import { deployedPlatform } from "../src/lib/deployed";

describe("deployedPlatform", () => {
  it("detects Heroku and Railway, and treats everything else as local", () => {
    expect(deployedPlatform({ DYNO: "web.1" })).toBe("heroku");
    expect(deployedPlatform({ RAILWAY_ENVIRONMENT_ID: "e3b0c442-98fc" })).toBe("railway");
    expect(deployedPlatform({})).toBeNull();
    expect(deployedPlatform({ NODE_ENV: "production" })).toBeNull();
  });
});
