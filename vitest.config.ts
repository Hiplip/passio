import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Next.js loads .env for `next dev`/`next build`; Vitest does not put dotenv
// values on `process.env`. The database-backed server tests import `~/env`,
// which validates DATABASE_URL at module load, so load the file here — before
// any test module is imported. It lives with the app it configures.
const ENV = "apps/web/.env";
if (existsSync(ENV)) process.loadEnvFile(ENV);

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Explicit, not tsconfigPaths: a workspace has several tsconfigs and this
    // one config has to resolve every project's imports the same way.
    //
    // ANCHORED REGEXES, not plain strings. A string alias prefix-matches, so
    // "@passio/crypto" also swallows "@passio/crypto/worker/derive" and rewrites
    // it to ".../index.ts/worker/derive". Every subpath import fails to resolve
    // and 8 test files simply do not load.
    alias: [
      { find: /^~\//, replacement: r("./apps/web/src") + "/" },
      {
        find: /^@passio\/crypto$/,
        replacement: r("./packages/crypto/src/index.ts"),
      },
      {
        find: /^@passio\/crypto\/(.*)$/,
        replacement: r("./packages/crypto/src") + "/$1.ts",
      },
      // Directory modules, BEFORE the catch-all: the general rule rewrites
      // "@passio/core/import" to ".../src/import.ts", which does not exist.
      // First match wins, so these have to come first.
      {
        find: /^@passio\/core\/(import|export)$/,
        replacement: r("./packages/core/src") + "/$1/index.ts",
      },
      {
        find: /^@passio\/core\/(.*)$/,
        replacement: r("./packages/core/src") + "/$1.ts",
      },
    ],
  },
  test: {
    environment: "node",
    setupFiles: ["./apps/web/src/test/setup.ts"],
    // One worker, one file at a time, across the WHOLE run.
    //
    // `fileParallelism` alone only serialises files within a project, and the
    // projects still ran concurrently - so the unit project's Argon2id tests
    // (64 MiB each, several at once) starved the database workers on this
    // 8 GB box. That showed up as a different database test failing on each
    // run, which looked like a data race and was really memory pressure.
    maxWorkers: 1,
    //
    // Five server test files seed and delete rows in ONE shared Neon branch,
    // and account.status answers a question about the whole table - so any
    // overlap makes it read one state and assert against another. Setting this
    // per-project was silently ignored; only the root option is honoured.
    // It costs about a minute a run, which is worth a gate that means something.
    fileParallelism: false,
    testTimeout: 20_000, // Argon2id at 64 MiB is deliberately slow
    // The db project's beforeEach/afterEach are network round trips to Neon,
    // the same work the tests do - so they get the same budget. Leaving them on
    // vitest's 10s default produced roughly one "Hook timed out in 10000ms" per
    // five full runs, always in a fixture reset and never in an assertion.
    hookTimeout: 20_000,
    projects: [
      {
        // Everything that runs purely in memory: files in parallel, as usual.
        extends: true,
        test: {
          name: "unit",
          include: [
            "apps/web/src/**/*.test.ts",
            "apps/web/src/**/*.test.tsx",
            "apps/extension/**/*.test.ts",
            "packages/*/src/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**", "apps/web/src/server/**"],
        },
      },
      {
        // The server tests share one real Neon database, and some of them
        // assert on table-wide state (`account.status` answers "does any user
        // exist?"). Two such files running at once is a race, not a test, so
        // one worker runs them one file at a time. The scope is deliberate:
        // serialising the whole suite instead costs about a minute a run.
        extends: true,
        test: {
          name: "db",
          include: [
            "apps/web/src/server/**/*.test.ts",
            "apps/web/src/server/**/*.test.tsx",
          ],
        },
      },
    ],
  },
});
