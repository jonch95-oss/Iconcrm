/**
 * Migration step for builds (Vercel runs this via `npm run build`).
 *
 * Neon note: the Vercel<->Neon integration sets DATABASE_URL to a POOLED
 * connection (pgbouncer). Migrations need a DIRECT connection or the advisory
 * lock times out (P1002). Neon also provides unpooled URLs in
 * DATABASE_URL_UNPOOLED / POSTGRES_URL_NON_POOLING — we prefer those here.
 * The running app keeps using the pooled DATABASE_URL, which is correct.
 *
 * Behavior:
 * - No database URL        -> skip with a loud warning (build continues).
 * - P1002 (lock timeout)   -> retry up to 3x (cold Neon computes wake slowly).
 * - P3005 (no history)     -> baseline existing schema, then deploy.
 * - Anything else          -> fail the build loudly.
 */
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";

const directUrl =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DIRECT_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!directUrl) {
  console.warn(
    "\n[migrate] No database URL set — skipping migrations. " +
      "Set DATABASE_URL in your Vercel project settings.\n",
  );
  process.exit(0);
}

const env = { ...process.env, DATABASE_URL: directUrl };
const run = (cmd) => execSync(cmd, { stdio: "inherit", env });
const runCapture = (cmd) => {
  try {
    execSync(cmd, { stdio: ["ignore", "inherit", "pipe"], env });
    return { ok: true, stderr: "" };
  } catch (err) {
    const stderr = err?.stderr?.toString?.() ?? "";
    process.stderr.write(stderr);
    return { ok: false, stderr };
  }
};

const MAX_ATTEMPTS = 3;
let lastStderr = "";
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const res = runCapture("npx prisma migrate deploy");
  if (res.ok) {
    console.log("[migrate] migrations applied.");
    process.exit(0);
  }
  lastStderr = res.stderr;

  if (res.stderr.includes("P3005")) {
    console.warn("[migrate] schema exists without history (P3005) — baselining…");
    try {
      const migrations = readdirSync("prisma/migrations").filter((d) => /^\d{14}_/.test(d));
      for (const m of migrations) run(`npx prisma migrate resolve --applied ${m}`);
      run("npx prisma migrate deploy");
      console.warn("[migrate] baselined and deployed.");
      process.exit(0);
    } catch (err) {
      console.error("[migrate] baseline failed:", err?.message ?? err);
      process.exit(1);
    }
  }

  if (res.stderr.includes("P1002") && attempt < MAX_ATTEMPTS) {
    const wait = attempt * 5;
    console.warn(
      `[migrate] lock timeout (P1002) — database may be waking up. Retry ${attempt}/${MAX_ATTEMPTS - 1} in ${wait}s…`,
    );
    execSync(`sleep ${wait}`);
    continue;
  }

  break;
}

console.error("[migrate] migrations failed after retries.", lastStderr.slice(0, 500));
process.exit(1);
