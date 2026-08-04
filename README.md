# EarnForge

[![CI](https://github.com/FarseenSh/earnforge/actions/workflows/ci.yml/badge.svg)](https://github.com/FarseenSh/earnforge/actions)
[![npm](https://img.shields.io/npm/v/@earnforge/sdk?label=%40earnforge%2Fsdk&color=f97316)](https://www.npmjs.com/package/@earnforge/sdk)
[![npm](https://img.shields.io/npm/v/@earnforge/cli?label=%40earnforge%2Fcli&color=f97316)](https://www.npmjs.com/package/@earnforge/cli)
[![npm](https://img.shields.io/npm/v/@earnforge/react?label=%40earnforge%2Freact&color=f97316)](https://www.npmjs.com/package/@earnforge/react)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-573%20passing-brightgreen)](#testing)
[![Pitfalls](https://img.shields.io/badge/API%20pitfalls-23-red)](./PITFALLS.md)

> **The judgment layer for the LI.FI Earn API.**

LI.FI tells you which vaults exist. EarnForge tells you which one to pick, and
whether your integration is actually correct.

**[Studio](https://earnforge-studio.vercel.app)** ·
**[MCP endpoint](https://earnforge-mcp.papermind-ai.workers.dev/mcp)** ·
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
LI.FI's own documentation. Verified against 711 live vaults:

| What LI.FI documents | What the API does |
|---|---|
| APY is a decimal (`0.0534` = 5.34%) | already a percentage — the quickstart's `* 100` overstates every yield **100×** |
| `tvl.usd` is a string | a number |
| `caps`, `timeLock`, `kyc`, `lpTokens` exist | sent by **zero** vaults |
| Structured errors on `400` and `404` | only `400` carries `errors[]` |
| Analytics refresh every 15 minutes | one **hourly** batch — the freshest reading in the fleet is over an hour old, the tail ~92 h |
| "No API key required" | `earn.li.fi` hard-`401`s |
| *(undocumented)* | `verificationStatus` flags **9.6% of the fleet** |

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
| [`@earnforge/mcp`](./packages/mcp) | 12 MCP tools on the `2026-07-28` revision; [hosted, no install](https://earnforge-mcp.papermind-ai.workers.dev/health); serves the skill over MCP |
| [`@earnforge/skill`](./packages/skill) | Agent Skill per the [agentskills.io](https://agentskills.io) spec — `npx skills add FarseenSh/earnforge` |
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

*Is this 12% real, or an incentive that ends?* No LI.FI surface answers it.

```ts
const { label, organicApy, reasons } = rewardSustainability(vault)
// 'incentive-dependent', 2.4
// ['Incentives are 80% of total APY. Organic yield is only 2.40%.']
```

It works only because `apy.reward` is three-valued and the schema refuses to
coerce it. `null` means the protocol reported nothing — 143 of Aave's 160
vaults. `0` means it reported no incentives — 160 of Morpho's 210. A `?? 0`
transform collapses the two and scores most of Aave as confidently organic
while knowing nothing about it, so `null` is labelled `unknown` and stays that
way. `analyzeRewardSustainability()` additionally reads the DeFiLlama curve,
since a decaying APY separates *this emission exists* from *this emission is
ending*.

### Composer Flows

`/v1/quote` builds one step at a time, so swap-then-deposit is two transactions
and the second has to guess what the first returned. A Flow binds the swap's
`amountOut` handle straight into the deposit's `amountIn` — the exact received
amount, one transaction, atomic.

`vaultRoutability()` answers what no Earn field does: the vault list is a
**superset** of what Composer can execute. Protocols ingested from DeFiLlama
appear with no routing edges at all, and seven protocols are deposit-only —
so a vault can be listed, carry `isTransactional: true`, and still be
impossible to enter or impossible to exit.

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
| SDK (incl. 23 pitfall regressions) | 294 |
| CLI | 109 |
| MCP (incl. `2026-07-28` wire + Worker surface) | 62 |
| Studio | 62 |
| React | 46 |
| **Total** | **573** |
| Live API integration | **34** |

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

TypeScript 7.0 · pnpm 10 · Turborepo 2.5 · tsdown · Biome 2.5 · Vitest 4 ·
Zod 4 · viem 2.55 · TanStack Query 5 · MCP SDK 2.0 (`2026-07-28`) ·
`@lifi/composer-sdk` 0.2 · Next.js 16 · Astro 7

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
