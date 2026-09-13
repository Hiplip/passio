/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // @passio/crypto and @passio/core publish TypeScript source, not a build. They
  // are deliberately buildless: a stale dist/ shadowing a source change in the
  // crypto package is precisely the failure nobody would notice.
  transpilePackages: ["@passio/crypto", "@passio/core"],
};

export default config;
