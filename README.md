# EarnForge

Developer toolkit for the LI.FI Earn API. One SDK eliminates 18 integration
pitfalls; seven surfaces put it in your terminal, your React app, your
AI agent, and your Telegram group.

**[Studio](https://earnforge-studio.vercel.app)** | **[Docs](https://earnforge-docs.vercel.app)** | **[npm](https://www.npmjs.com/org/earnforge)**

```
npm i @earnforge/sdk
```

---

## Quick start

```ts
import { createEarnForge, riskScore } from "@earnforge/sdk";

const forge = createEarnForge();
for await (const vault of forge.vaults.listAll({ chainId: 8453 })) {
  const risk = riskScore(vault);
  console.log(vault.name, vault.analytics.apy.total, risk.label);
}
```

Five lines. Auto-pagination, null-safe APY, string TVL parsing, rate
limiting, and retry logic are handled for you.

---

## Architecture

```
                        @earnforge/sdk
                              |
       +----------+----------+----------+----------+
       |          |          |          |          |
     CLI       React       MCP       Skill      Bot
  (terminal)  (hooks)   (AI tools) (agent)   (Telegram)
       |
     Studio
   (Next.js)
```

**1 SDK -> 7 surfaces.** Every surface imports `@earnforge/sdk` and
inherits all 18 pitfall mitigations, Zod-validated types, rate limiting,
caching, and retry logic.

---

## Packages

| Package | Name | Description |
|---------|------|-------------|
| `packages/sdk` | `@earnforge/sdk` | Typed client, Zod schemas, risk scorer, strategy engine, deposit quoting, preflight checks |
| `packages/cli` | `@earnforge/cli` | Terminal interface -- `earnforge list`, `earnforge doctor`, `earnforge quote` |
| `packages/react` | `@earnforge/react` | React hooks with TanStack Query -- `useVaults`, `useRiskScore`, `useDepositQuote` |
| `packages/mcp` | `@earnforge/mcp` | MCP server exposing 9 tools for vault discovery, risk scoring, deposit quoting |
| `packages/skill` | `@earnforge/skill` | Agent Skill -- SKILL.md + reference docs for Claude Code / Cursor integration |
| `packages/bot` | `@earnforge/bot` | Telegram bot -- yield queries, risk checks, portfolio suggestions via grammY |
| `apps/studio` | `earnforge-studio` | Next.js dashboard -- vault explorer, strategy builder, portfolio view |

---

## 18 Pitfalls -- Handled

Every pitfall has a dedicated test under `packages/sdk/test/pitfalls/`.

| # | Pitfall | SDK fix |
|---|---------|---------|
| 1 | Wrong base URL | Two typed clients with correct defaults |
| 2 | Auth on Earn Data API | No auth headers on `EarnDataClient` |
| 3 | Missing Composer API key | Constructor validation + `requireComposer()` gate |
| 4 | POST instead of GET | Hard-coded `GET` in `ComposerClient.getQuote()` |
| 5 | Wrong `toToken` | `buildDepositQuote()` wires `vault.address` |
| 6 | Ignoring pagination | Async iterator via `nextCursor` |
| 7 | Null APY values | Nullable types + `getBestApy()` fallback chain |
| 8 | TVL is a string | `parseTvl()` returns `{ raw, parsed, bigint }` |
| 9 | Decimal mismatch | `toSmallestUnit()` / `fromSmallestUnit()` |
| 10 | Stale quote | LRU cache with TTL; quotes excluded from cache |
| 11 | No gas token | `preflight()` balance check |
| 12 | Chain mismatch | `preflight()` chain ID comparison |
| 13 | Non-transactional vault | `isTransactional` guard in `buildDepositQuote()` + `preflight()` |
| 14 | Rate limit | Token bucket -- 100 req/min with async backpressure |
| 15 | Empty `underlyingTokens` | Null-safe array; explicit `fromToken` required when empty |
| 16 | Optional `description` | `z.string().optional()` in `VaultSchema` |
| 17 | `apy.reward` null vs 0 | `.nullable().transform(v => v ?? 0)` |
| 18 | `apy1d` null | Extended fallback chain in `getBestApy()` |

Full details with root causes and test paths: [`PITFALLS.md`](./PITFALLS.md)

---

## CLI commands

```
earnforge list            # list vaults with filters
earnforge top             # top vaults by APY for an asset
earnforge vault <slug>    # detailed vault info
earnforge portfolio <wal> # portfolio positions
earnforge quote           # build a deposit quote
earnforge risk <slug>     # risk score breakdown
earnforge suggest         # portfolio allocation suggestions
earnforge watch           # live APY/TVL monitoring
earnforge chains          # supported chains
earnforge protocols       # supported protocols
earnforge doctor          # 18-pitfall diagnostics
```

Every command supports `--json` for machine-readable output.

---

## Stack

| Layer | Tool | Version |
|-------|------|---------|
| Language | TypeScript | 5.9 |
| Package manager | pnpm | 10 |
| Monorepo | Turborepo | 2.5 |
| Bundler | tsdown | 0.21 |
| Linter + formatter | Biome | 2.4 |
| Test runner | Vitest | 4.1 |
| Schema validation | Zod | 3.24 |
| EVM types | viem | 2.47 |
| React query | TanStack Query | 5.90 |
| MCP | @modelcontextprotocol/sdk | 1.12 |
| Bot framework | grammY | 1.35 |
| Web framework | Next.js | 15.3 |

---

## Development

```bash
pnpm install
pnpm turbo build
pnpm turbo test
```

Run live integration tests against the real API:

```bash
pnpm turbo test:live --filter=@earnforge/sdk
```

---

## License

Apache-2.0. See [LICENSE](./LICENSE).
