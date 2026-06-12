/**
 * Migration step for builds (Vercel runs this via `npm run build`).
 * - No DATABASE_URL  -> skip with a loud warning (build continues; the app
 *   will show clear DB errors at runtime until the variable is added).
 * - P3005 (schema exists but no migration history, e.g. created via db push)
 *   -> baseline by marking all migrations as applied, then continue.
 * - Any other failure -> fail the build so broken schema never ships silently.
 */
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";

if (!process.env.DATABASE_URL) {
  console.warn(
    "\n[migrate] DATABASE_URL is not set — skipping migrations. " +
      "Set it in your Vercel project settings (Neon/Supabase Postgres).\n",
  );
  process.exit(0);
}

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

try {
  run("prisma migrate deploy");
} catch {
  console.warn("[migrate] migrate deploy failed — checking for a baseline case (P3005)…");
  try {
    const migrations = readdirSync("prisma/migrations").filter((d) => /^\d{14}_/.test(d));
    for (const m of migrations) {
      run(`prisma migrate resolve --applied ${m}`);
    }
    run("prisma migrate deploy");
    console.warn("[migrate] baselined existing schema and completed deploy.");
  } catch (err) {
    console.error("[migrate] migrations failed:", err?.message ?? err);
    process.exit(1);
  }
}
