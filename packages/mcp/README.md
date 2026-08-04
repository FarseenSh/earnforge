# @earnforge/mcp

MCP server for the [LI.FI Earn API](https://docs.li.fi/earn/overview) — vault
discovery, risk scoring, allocation, diagnostics, and API drift detection as
agent-callable tools.

Also serves the EarnForge Agent Skill over the same connection, so a host gets
both the tools and the workflow instructions from one endpoint.

## Local (stdio)

```bash
npm i -g @earnforge/mcp
```

```json
{
  "mcpServers": {
    "earnforge": {
      "command": "earnforge-mcp",
      "env": { "LIFI_API_KEY": "your_key" }
    }
  }
}
```

The Earn Data API returns `401` without a key — create one at
[portal.li.fi](https://portal.li.fi).

## Hosted (Cloudflare Worker)

Serves the **`2026-07-28`** revision, which is stateless by definition: no
`initialize` handshake, no `Mcp-Session-Id`, every request carrying its own
protocol version in `_meta`. That makes a Worker the natural host — no sticky
routing, no shared session store, nothing to rebuild on a cold start.

2025-era clients are served from the same factory, so upgrading the protocol
strands no existing host. A request is treated as modern when it carries the
per-request `_meta` envelope, and falls through to the 2025 path otherwise.

Verified on the actual runtime under `wrangler dev`, not only against
synthetic `Request` objects: `server/discover` advertising the revision,
`resultType` on every result, `ttlMs`/`cacheScope` on list results, and
`serverInfo` in result `_meta`.

```bash
cd packages/mcp
wrangler secret put LIFI_API_KEY
wrangler dev            # exercise it locally first
wrangler deploy
```

No build step: `wrangler.toml` points at `src/worker.ts` so wrangler does the
bundling itself. That is load-bearing — see the `[alias]` note in the config.

A public instance runs at `earnforge-mcp.papermind-ai.workers.dev`, so an agent
can reach every tool with no install and no key:

```json
{
  "mcpServers": {
    "earnforge": {
      "type": "http",
      "url": "https://earnforge-mcp.papermind-ai.workers.dev/mcp"
    }
  }
}
```

**Bring your own key for anything beyond trying it out.** The shared instance
spends a single 100 req/min budget across everyone using it, so it will
rate-limit under load. Pass `x-lifi-api-key` and the Worker uses yours instead:

```json
{
  "mcpServers": {
    "earnforge": {
      "type": "http",
      "url": "https://earnforge-mcp.papermind-ai.workers.dev/mcp",
      "headers": { "x-lifi-api-key": "your-key-from-portal.li.fi" }
    }
  }
}
```

For anything production, deploy your own with the three commands above —
it is the same Worker, on your own account and quota.

`GET /health` is an unauthenticated liveness probe.

## Tools

12 tools, all read-only — nothing signs or broadcasts. Quote tools return
unsigned `transactionRequest` objects for the caller's wallet.

| Tool | LI.FI's hosted server | Here |
|---|---|---|
| `get-earn-vaults` | ✓ | ✓ |
| `get-earn-vault` | ✓ | ✓ |
| `get-earn-chains` | ✓ | ✓ |
| `get-earn-protocols` | ✓ | ✓ |
| `get-earn-portfolio` | ✓ | ✓ |
| `get-vault-risk` | — | ✓ |
| `suggest-allocation` | — | ✓ |
| `run-doctor` | — | ✓ |
| `check-allowance` | — | ✓ |
| `quote-vault-deposit` | ✓ (via `get-quote`) | ✓ |
| `quote-vault-redeem` | — | ✓ |
| `check-api-drift` | — | ✓ |

### Where this differs on quality

**Structured output on every tool.** Each declares an `outputSchema`, so results
arrive as validated `structuredContent` rather than JSON an agent has to parse
out of a text block and guess at.

**Tool annotations.** All twelve are marked `readOnlyHint` and
`destructiveHint: false`, so a host can auto-approve them instead of prompting on
every call.

**`verificationStatus` is surfaced.** LI.FI flags roughly 9% of vaults as suspect
through a field that appears in no spec or changelog — and their own MCP server
does not expose it. Every vault result here carries the status and its reasons,
flagged vaults are excluded from allocations by default, and a flagged vault can
never score as low risk.

**Correct protocol ids.** LI.FI's tool descriptions still advertise `morpho-v1`,
`aave-v3` and `euler-v2`. Those return HTTP 200 with zero results — an agent
following them gets silence, not an error.

**Correct APY scale.** Tool descriptions state that APY is already a percentage.
LI.FI's OpenAPI spec and quickstart say to multiply by 100, which overstates
every yield 100×.

## Skill over MCP (SEP-2640)

The Agent Skill is served as MCP Resources under a `skill://` URI scheme,
following [SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640):

```
skill://earnforge/index.json          discovery index
skill://earnforge/SKILL.md            entry point
skill://earnforge/references/*.md     loaded only when a task needs them
```

One connection gives a host the tools it can call *and* the instructions
describing when to call them — previously two separate packages, one of which had
to be installed by hand.

## License

Apache-2.0
