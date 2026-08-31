import jwt from "jsonwebtoken";

/**
 * OAuth2 JWT-bearer auth (RFC 7523) for the LeagueApps Private API, per
 * https://leagueapps.notion.site/LeagueApps-API-Documentation and the
 * official sample at
 * https://github.com/LeagueApps/api-example/blob/main/sample.py — this
 * mirrors that script's claim shape exactly rather than a generic OAuth2
 * guess:
 *
 *   { aud: <token URL>, iss: <client id>, sub: <client id>,
 *     iat: <now>, exp: <now + 300> }
 *
 * signed RS256 with the private key from the org's Private API Key
 * (a .p12 file, converted to PEM — see README). That JWT assertion is
 * POSTed as `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` to
 * get a Bearer access token, which is what actually authorizes export
 * calls and expires in 900s.
 *
 * This is a *different* auth style from the older, unverified
 * `LEAGUEAPPS_API_KEY` bearer-token code in src/services/leagueapps.ts —
 * the docs distinguish a simpler "Public API Key" from this "Private API"
 * JWT flow, so the two are kept as separate modules rather than merged.
 */

const JWT_ASSERTION_LIFETIME_SECONDS = 300;
const TOKEN_EXPIRY_SAFETY_BUFFER_SECONDS = 30;

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

let cached: CachedToken | undefined;

interface LeagueAppsAuthConfig {
  clientId: string;
  privateKey: string;
  authUrl: string;
}

export function leagueAppsAuthConfigFromEnv(): LeagueAppsAuthConfig {
  const clientId = process.env.LEAGUEAPPS_CLIENT_ID;
  const privateKey = process.env.LEAGUEAPPS_PRIVATE_KEY;
  const authUrl = process.env.LEAGUEAPPS_AUTH_URL ?? "https://auth.leagueapps.io/v2/auth/token";
  if (!clientId || !privateKey) {
    throw new Error(
      "LEAGUEAPPS_CLIENT_ID / LEAGUEAPPS_PRIVATE_KEY are not configured (see README for the p12-to-PEM setup)",
    );
  }
  return { clientId, privateKey, authUrl };
}

function buildAssertion({ clientId, authUrl, privateKey }: LeagueAppsAuthConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: authUrl,
    iss: clientId,
    sub: clientId,
    iat: now,
    exp: now + JWT_ASSERTION_LIFETIME_SECONDS,
  };
  return jwt.sign(claims, privateKey, { algorithm: "RS256", noTimestamp: true });
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
}

/**
 * Returns a cached, still-valid Bearer access token, or exchanges the
 * signed JWT assertion for a fresh one. Not per-request — callers share
 * this cache across a whole import run (and across runs, within the
 * token's lifetime).
 */
export async function getAccessToken(config: LeagueAppsAuthConfig = leagueAppsAuthConfigFromEnv()): Promise<string> {
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.accessToken;
  }

  const assertion = buildAssertion(config);
  const res = await fetch(config.authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    throw new Error(`LeagueApps token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as TokenResponse;
  const expiresInSeconds = data.expires_in ?? 900;
  cached = {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + (expiresInSeconds - TOKEN_EXPIRY_SAFETY_BUFFER_SECONDS) * 1000,
  };
  return cached.accessToken;
}

/** Test-only escape hatch — production code never needs to clear this. */
export function _resetTokenCacheForTests(): void {
  cached = undefined;
}
