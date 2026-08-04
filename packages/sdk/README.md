# @earnforge/sdk

Typed SDK for the [LI.FI Earn API](https://docs.li.fi/earn/overview) — vault
discovery, risk scoring, yield strategies, and deposit/withdrawal quoting.

```bash
npm i @earnforge/sdk
```

## Quick start

The Earn Data API requires an API key as of April 2026. Create one at
[portal.li.fi](https://portal.li.fi).

```ts
import { createEarnForge, riskScore, isFlagged } from '@earnforge/sdk'

const forge = createEarnForge({ apiKey: process.env.LIFI_API_KEY })

for await (const vault of forge.vaults.listAll({ chainId: 8453 })) {
  if (isFlagged(vault)) continue // LI.FI flagged ~9% of vaults as suspect
  const risk = riskScore(vault)
  console.log(vault.name, vault.analytics.apy.total, risk.label, risk.flags)
}
```

Auto-pagination, rate limiting, retry, caching, and every quirk below are
handled for you.

## Why this exists

The Earn API has a number of behaviours that are easy to get wrong, several of
which contradict LI.FI's own documentation. Verified against 711 live vaults:

| Behaviour | What bites you |
|---|---|
| **APY is a percentage** (`4.63` = 4.63%) | The OpenAPI spec, quickstart and schema docs all say decimal. Following the quickstart's `* 100` overstates every APY 100×. |
| **`tvl.usd` is a number** | It used to be a string, and the spec still says string. `parseTvl()` accepts either. |
| **Auth is mandatory** | `earn.li.fi` hard-401s, while LI.FI's API reference still says no key is required. That's true only for `li.quest`. |
| **Protocol ids are unversioned** | `?protocol=morpho-v1` returns `200` with zero results — a stale slug fails silently. |
| **`nextCursor` is absent on the last page** | Not null, not empty. A nullable-only schema rejects the final page. |
| **`apy.reward` is three-valued** | null / 0 / positive, and the split varies *within* a protocol. Collapsing null to 0 loses real signal. |
| **Unknown query params are ignored** | Sending `minTvl` instead of `minTvlUsd` returns the whole fleet, silently unfiltered. |
| **`verificationStatus` is undocumented** | Present on every vault, flags ~9% of the fleet. In no spec or changelog. |
| **`caps`, `timeLock`, `kyc`, `lpTokens`** | Documented in the OpenAPI spec; sent by zero vaults. |

## What's in it

**Discovery** — `listVaults`, `listAllVaults` (async iterator), `getVault`,
`getVaultBySlug`, `listChains`, `listProtocols`, `getPortfolio`.

**Risk scoring** — a composite 0–10 score across seven dimensions: TVL, APY
stability, protocol maturity, redeemability, asset type, LI.FI's
`verificationStatus`, and reward dependency. Returns a `flags[]` array of
human-readable concerns. Calibrated so **no flagged vault can score ≥ 8**, which
means none can be labelled low risk.

```ts
const { score, label, breakdown, flags } = riskScore(vault)
// score: 4.5, label: 'high'
// flags: ['flagged by LI.FI verification: zero_apy', 'withdrawals unavailable']
```

**Strategy presets** — `conservative`, `max-apy`, `diversified`,
`risk-adjusted`. All exclude verification-flagged vaults; `conservative` also
excludes `il-risk` tags.

**Portfolio allocation** — `suggest()` produces a risk-adjusted allocation with
chain-diversification limits. Flagged vaults are excluded unless you pass
`includeFlagged: true`.

**Execution** — `buildDepositQuote`, `buildRedeemQuote`, `checkAllowance`,
`buildApprovalTx`, `preflight`, `optimizeGasRoutes`.

**Enrichment** — `getApyHistory` matches vaults to DeFiLlama pools by project +
chain + underlying token + TVL proximity, covering ~97% of the fleet.

**Drift detection** — `detectDrift()` compares three sources: the live API, the
published OpenAPI spec, and our schema. It reports which pair disagrees, so a
LI.FI documentation bug is distinguishable from our own.

```ts
const report = await detectDrift()
console.log(formatDriftReport(report))
```

## Notes

- ESM-first with a CJS build. `"type": "module"`.
- Zod schemas are generated from real API responses, never from documentation —
  see the table above for why.
- Rate limiting defaults to 100 req/min. LI.FI enforces this as RPM × 120 over a
  two-hour rolling window.

## License

Apache-2.0
