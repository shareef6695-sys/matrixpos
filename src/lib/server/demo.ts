import "server-only";

/**
 * The demo business (prisma/seed.ts) has a published password. Its sign-in details are shown on the
 * login page only in development and previews, or on the live site when SHOW_DEMO_LOGIN=true is set on purpose.
 */
export function showDemoLogin() {
  const live = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.NODE_ENV === "production";
  return !live || process.env.SHOW_DEMO_LOGIN === "true";
}
