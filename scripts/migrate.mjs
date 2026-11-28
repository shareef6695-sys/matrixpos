// Applies database migrations during the Vercel build, but only for production deploys.
// Preview deploys (pull requests) must never change the live database, and may not have database settings at all.
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
if (env && env !== "production") {
  console.log(`Skipping database migrations for a ${env} deploy.`);
} else if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set, so migrations can't run.");
  process.exit(1);
} else {
  execSync("prisma migrate deploy", { stdio: "inherit" });
}
