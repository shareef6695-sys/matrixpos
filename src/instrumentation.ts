/**
 * Runs once when the server starts. On the live site it refuses to start when a critical
 * environment variable is missing or unsafe, instead of failing later on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertEnv, checkEnv, isLiveRuntime } = await import("./lib/env");
  if (isLiveRuntime()) {
    assertEnv("server start");
  } else {
    // Previews and local development: say what's missing, but keep running.
    for (const e of checkEnv().errors) console.warn(`[env] ${e}`);
  }
}
