# @earnforge/mcp

## 1.0.0

### Major Changes

- Serves MCP **`2026-07-28`**, the current protocol revision. Migrated from
  `@modelcontextprotocol/sdk@1.x` to the v2 scoped packages
  (`@modelcontextprotocol/server@2`) — note the v2 line shipped under new
  package names, which is why `@modelcontextprotocol/sdk` still reads `1.30`.

  2025-era clients are served from the same factory, so upgrading strands no
  existing host. A request is treated as modern when it carries the per-request
  `_meta` envelope and falls through to the 2025 path otherwise.

  On the wire: `server/discover` advertising the revision, `resultType` on
  every result, `ttlMs`/`cacheScope` on list results, and `serverInfo` in
  result `_meta` — the post-#3002 location, asserted so a regression to the
  pre-final shape fails.

- Requires an API key. Tools call an API that now `401`s without one; a missing
  key surfaces as a plain HTTP error from the Worker rather than a JSON-RPC
  error raised from inside a tool call.

- Requires Zod 4.

### Minor Changes

- Twelve tools, up from eleven. `check-api-drift` lets an agent ask whether
  LI.FI changed something rather than silently receiving stale answers.

- Structured output on every tool. Each declares an `outputSchema` and returns
  validated `structuredContent`, so an agent no longer parses JSON out of a
  prose text block and guesses at the shape.

- Annotations on every tool — `readOnlyHint`, `destructiveHint: false`. Nothing
  here signs or broadcasts; quote tools return unsigned transactions. That was
  unknowable from the protocol, so hosts had to prompt on every call.

- Runs on Cloudflare Workers, verified on the real runtime under
  `wrangler dev` rather than only against synthetic `Request` objects.

- Serves the Agent Skill as MCP resources under `skill://earnforge/*` with a
  discovery index, so one connection yields the tools *and* the instructions
  for using them.

- Tool descriptions carry the corrections that matter to an agent: APY is
  already a percentage, protocol ids are unversioned, and roughly 9% of vaults
  are verification-flagged.

### Patch Changes

- The Worker boots. It died at module evaluation with
  `ZodLazy is not a constructor`: `@modelcontextprotocol/core` imports
  `zod/v4` while this package imports `zod`, so the bundler emitted two copies
  of zod's classic graph and one copy's `lazy()` ran before the other assigned
  `ZodLazy`. Node never splits them, so every in-process test passed against a
  Worker that could not start. Fixed with a bundler alias.

- `outputSchema` receives schema objects rather than `.shape`. Raw shapes were
  removed in SDK v2.

- `wrangler.toml` no longer carries a placeholder custom domain, which failed
  any real deploy.
