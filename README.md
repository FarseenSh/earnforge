# EarnForge

[![CI](https://github.com/FarseenSh/earnforge/actions/workflows/ci.yml/badge.svg)](https://github.com/FarseenSh/earnforge/actions)
[![npm](https://img.shields.io/npm/v/@earnforge/sdk?label=%40earnforge%2Fsdk&color=f97316)](https://www.npmjs.com/package/@earnforge/sdk)
[![npm](https://img.shields.io/npm/v/@earnforge/cli?label=%40earnforge%2Fcli&color=f97316)](https://www.npmjs.com/package/@earnforge/cli)
[![npm](https://img.shields.io/npm/v/@earnforge/react?label=%40earnforge%2Freact&color=f97316)](https://www.npmjs.com/package/@earnforge/react)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-515%20passing-brightgreen)](#testing)
[![Pitfalls](https://img.shields.io/badge/API%20pitfalls-23-red)](./PITFALLS.md)

> **The judgment layer for the LI.FI Earn API.**

LI.FI tells you which vaults exist. EarnForge tells you which one to pick, and
whether your integration is actually correct.

**[Studio](https://earnforge-studio.vercel.app)** ·
**[Docs](https://earnforge-docs.vercel.app)** ·
**[npm](https://www.npmjs.com/org/earnforge)** ·
**[Pitfalls](./PITFALLS.md)** ·
**[Migrating from 0.1.x](./MIGRATING.md)**

```bash
npm i @earnforge/sdk
```

---

## Quick start

The Earn Data API requires a key as of April 2026 — create one at
[portal.li.fi](https://portal.li.fi).

```ts
import { createEarnForge, riskScore, isFlagged } from '@earnforge/sdk'

const forge = createEarnForge({ apiKey: process.env.LIFI_API_KEY })

for await (const vault of forge.vaults.listAll({ chainId: 8453 })) {
  if (isFlagged(vault)) continue // LI.FI flags ~9% of vaults as suspect
  const { score, label, flags } = riskScore(vault)
  console.log(vault.name, vault.analytics.apy.total, label, flags)
}
```

Auto-pagination, mandatory auth, rate limiting, retry, caching and all 23
documented API quirks are handled for you.

---

## Why this exists

The Earn API is easy to get wrong, and several of its behaviours contradict
LI.FI's own documentation. Verified against 609 live vaults:

| What LI.FI documents | What the API does |
|---|---|
| APY is a decimal (`0.0534` = 5.34%) | already a percentage — the quickstart's `* 100` overstates every yield **100×** |
| `tvl.usd` is a string | a number |
| `caps`, `timeLock`, `kyc`, `lpTokens` exist | sent by **zero** vaults |
| Structured errors on `400` and `404` | only `400` carries `errors[]` |
| Analytics refresh every 15 minutes | observed floor **87 minutes**, median 90 |
| "No API key required" | `earn.li.fi` hard-`401`s |
| *(undocumented)* | `verificationStatus` flags **9% of the fleet** |

Plus the silent ones: a stale protocol slug (`morpho-v1`) returns `200` with zero
results rather than an error, and an unknown query param is dropped — so
`minTvl` instead of `minTvlUsd` returns the entire unfiltered fleet.

Full detail, with a test for each: **[PITFALLS.md](./PITFALLS.md)**

---

## Architecture

```
                 @earnforge/sdk
                       |
     +--------+--------+--------+--------+
     |        |        |        |        |
    CLI     React     MCP     Skill   Studio
 (terminal) (hooks) (agents) (agents) (Next.js)
```

Every surface imports the SDK, so all pitfall mitigations, Zod-validated types,
rate limiting, caching and retry logic are inherited rather than reimplemented.

---

## Packages

| Package | Description |
|---------|-------------|
| [`@earnforge/sdk`](./packages/sdk) | Typed client, Zod schemas, risk scorer, strategies, quoting, drift detection |
| [`@earnforge/cli`](./packages/cli) | 19 commands — `list`, `risk`, `suggest`, `doctor`, `compare`, all with `--json` |
| [`@earnforge/react`](./packages/react) | 10 hooks on TanStack Query — `useVaults`, `useRiskScore`, `useEarnDeposit` |
| [`@earnforge/mcp`](./packages/mcp) | 12 MCP tools with structured output; hostable on Cloudflare; serves the skill over MCP |
| [`@earnforge/skill`](./packages/skill) | Agent Skill per the [agentskills.io](https://agentskills.io) spec |
| [`earnforge-studio`](./apps/studio) | Next.js dashboard — explorer, sparklines, risk badges, code generator |

---

## What you get beyond a typed client

### Risk scoring

A composite 0–10 score across seven dimensions — TVL, APY stability, protocol
maturity, redeemability, asset type, LI.FI's `verificationStatus`, and reward
dependency — plus a `flags[]` array of plain-language concerns.

```ts
const { score, label, flags } = riskScore(vault)
// 4.5, 'high'
// ['flagged by LI.FI verification: zero_apy', 'withdrawals unavailable via Composer']
```

Calibrated against the live fleet, whose scores span 4.1–9.7. The `8` boundary is
deliberate: verification carries 0.22 of the weight, so a flagged vault caps at
7.96 — **no flagged vault can ever be labelled low risk.**

### Reward sustainability

`apy.reward` is three-valued — null, zero, or positive — and the split varies
*within* a protocol. Preserving that distinction is what makes
`rewardShareOfTotal()` meaningful: a vault earning 87% of its yield from token
incentives is a different proposition from one earning it from lending fees.

### Drift detection

Born from this project shipping broken for three months. `detectDrift()` compares
the live API, LI.FI's OpenAPI spec, and our schema — reporting *which pair*
disagrees, so a vendor documentation bug is distinguishable from ours.

```bash
$ pnpm --filter @earnforge/sdk drift

WARNING (2)
  [live-vs-spec] analytics.apy
    The spec states APY is "expressed as a decimal", but live values exceed 1...

No breaking drift — our schema still matches the live API.
```

CI runs it daily.

### Also included

Strategy presets (all excluding flagged vaults), a risk-adjusted allocation
engine, gas-optimised cross-chain routing, DeFiLlama APY history at 97% fleet
coverage, ERC-20 allowance handling, preflight validation, and `earnforge doctor`.

---

## Testing

| Suite | Count |
|---|---|
| SDK (incl. 23 pitfall regressions) | 251 |
| CLI | 106 |
| MCP (incl. protocol + Worker surface) | 56 |
| Studio | 56 |
| React | 46 |
| **Total** | **515** |
| Live API integration | **32** |

```bash
pnpm turbo test                                    # mocked
LIFI_API_KEY=... pnpm --filter @earnforge/sdk test:live
LIFI_API_KEY=... pnpm --filter @earnforge/sdk drift
```

CI gates on build, typecheck, lint, the mocked suite, the live suite, and drift —
plus a daily scheduled drift run. The previous release gated only on build and
test, which is how it shipped broken.

---

## Stack

TypeScript 5.9 · pnpm 10 · Turborepo 2.5 · tsdown · Biome 2.4 · Vitest 4 ·
Zod 3 · viem 2.47 · TanStack Query 5 · MCP SDK 1.12 · grammY 1.35 · Next.js 15

Zod is a deliberate divergence from LI.FI's own stack — runtime validation is
what surfaces the discrepancies in the table above.

---

## Development

```bash
pnpm install
pnpm turbo build
pnpm turbo test
```

---

## License

Apache-2.0. See [LICENSE](./LICENSE).
