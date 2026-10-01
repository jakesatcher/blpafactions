/**
 * "Are we deployed?" — true on Heroku (DYNO is set on every dyno) and on
 * Railway (RAILWAY_ENVIRONMENT_ID is set on every service). Used to refuse
 * booting without ADMIN_TOKEN, so a deploy can't come up with its admin
 * routes wide open.
 */
export function deployedPlatform(env: NodeJS.ProcessEnv = process.env): "heroku" | "railway" | null {
  if (env.DYNO) return "heroku";
  if (env.RAILWAY_ENVIRONMENT_ID) return "railway";
  return null;
}
