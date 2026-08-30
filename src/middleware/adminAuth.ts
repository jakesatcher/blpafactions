import type { RequestHandler } from "express";

/**
 * Gates a route behind a shared admin token (`x-admin-token` header,
 * checked against ADMIN_TOKEN). Protects the routes the GUI uses to
 * mutate player/event data and the ones that expose a player's email,
 * so a publicly deployed Heroku app can't have points/achievements
 * tampered with, or emails harvested, by anyone who finds the URL.
 *
 * In development (no DYNO, no ADMIN_TOKEN configured) the check is
 * skipped so local curl/testing keeps working without extra setup —
 * see the startup check in src/index.ts that refuses to boot without
 * ADMIN_TOKEN when running on Heroku.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next();
  if (req.header("x-admin-token") === token) return next();
  res.status(401).json({ error: "missing or invalid x-admin-token header" });
};
