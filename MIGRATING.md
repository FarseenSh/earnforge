# Migrating to 1.0.0

`0.1.x` no longer works. LI.FI rewrote the Earn API in April 2026 — moving every
path, making authentication mandatory, removing two fields and changing the type
of a third — so every `0.1.x` call now returns `404`, and once the paths are
corrected the schema throws on every vault.

This release fixes that and takes the opportunity to correct several behaviours
that were wrong or misleading. **`1.0.0` is a breaking release.** Most upgrades
are three lines.

---

## Required: pass an API key

The Earn Data API returns `401` without one. `EarnDataClient` now throws
`MissingApiKeyError` at construction rather than failing on first request.

```diff
- const forge = createEarnForge()
+ const forge = createEarnForge({ apiKey: process.env.LIFI_API_KEY })
```

`LIFI_API_KEY` is read from the environment if you omit `apiKey`, so setting the
variable is enough in most setups. Create a key at
[portal.li.fi](https://portal.li.fi).

One key authenticates both services. `composerApiKey` still exists for setups
that issue separate credentials, but `apiKey` alone now covers Composer too.

### Browser code must proxy

The key cannot go to the client — it would be readable in the network tab. Route
Earn requests through your own server and point the SDK at it:

```ts
// Server
createEarnForge({ apiKey: process.env.LIFI_API_KEY })

// Browser
createEarnForge({
  apiKey: 'proxied',
  earnData: { apiKey: 'proxied', baseUrl: '/api/earn' },
})
```

`apps/studio/src/app/api/earn/[...path]/route.ts` is a working reference
implementation with a path allowlist.

---

## Breaking: `tvl.usd` may be a number

It arrives as a JSON number now; it used to be a string, and LI.FI's OpenAPI spec
still says string. The schema accepts both.

```diff
- const tvl = Number(vault.analytics.tvl.usd)
+ const tvl = parseTvl(vault.analytics.tvl).parsed
```

If you were reading `tvl.usd` directly, either switch to `parseTvl()` or handle
both types. `String(tvl.usd)` is safe if you only need to display it.

---

## Breaking: `apy.reward` can be `null`

It was previously coerced to `0`. That coercion destroyed a real distinction — a
protocol reporting *no incentives* and a protocol reporting *nothing* are
different facts, and both occur, sometimes within the same protocol.

```diff
- const reward = vault.analytics.apy.reward        // was always number
+ const reward = getRewardApy(vault.analytics)     // number, null treated as 0
```

Use `isRewardApyUnknown(vault.analytics)` when the difference matters.
`apy.base` is also nullable now — one live vault reports `null`.

---

## Breaking: risk label thresholds moved

Labels were `low ≥ 7`, `medium ≥ 4`. They are now `low ≥ 8`, `medium ≥ 6`.

The old thresholds put 80% of the fleet in `low` and made `high` mathematically
unreachable — live scores span 4.1–9.7. The new cuts produce a usable spread
(roughly 45% / 49% / 6%), and the `8` boundary is deliberate: a
verification-flagged vault caps at 7.96, so **no flagged vault can be labelled
low risk.**

If you keyed UI or logic off the label, expect vaults to shift down one band.
`riskLabel(score)` is now exported if you need the mapping directly.

`RiskBreakdown` also gained two fields, `verification` and `rewardDependency`, and
`RiskScore` gained a `flags: string[]` array. If you construct these objects in
tests, they need the new keys.

---

## Breaking: protocol ids are unversioned

`morpho-v1` → `morpho`, `aave-v3` → `aave`, `euler-v2` → `euler`. `maple` left
the Earn index entirely.

```diff
- forge.vaults.list({ protocol: 'morpho-v1' })
+ forge.vaults.list({ protocol: 'morpho' })
```

This one fails silently — a stale slug returns `200` with `total: 0`, not an
error. Resolve against `forge.protocols.list()` rather than hardcoding.

---

## Breaking: `provider` and `lpTokens` are gone

LI.FI removed both. They were required fields in the old schema, which is why
every parse throws until you upgrade.

```diff
- console.log(vault.provider)
+ console.log(vault.protocol.id ?? vault.protocol.name)
```

`lpTokens` has no replacement — use `vault.address` as the share token, which is
what Composer expects as `toToken` anyway.

---

## Breaking: slug format changed

`8453-0xee8f...` → `morpho:8453:_:0xee8f...`.

`getVaultBySlug()` and `parseVaultSlug()` accept both forms, so stored slugs keep
working. But if you split on `-` yourself, that now mis-parses.

```diff
- const [chainId, address] = slug.split('-')
+ const { chainId, address } = parseVaultSlug(slug)!
```

---

## Behaviour changes that are not breaking

**`suggest()` excludes flagged vaults.** Roughly 9% of the fleet is flagged by
LI.FI's verification pass. Allocations skip them unless you pass
`includeFlagged: true`. Expect slightly different — and safer — allocations.

**Every strategy preset excludes flagged vaults**, and `conservative` also
excludes the `il-risk` tag and requires `isRedeemable`.

**Default page size is 100**, up from 50. Halves the requests needed to walk the
fleet.

**APY history coverage went 14.3% → 96.6%.** The DeFiLlama mapping was wrong in
five places. If `getApyHistory()` previously returned empty for your vaults, it
probably works now.

**`minTvl` actually filters.** It was being sent under a parameter name the API
ignores, so it silently returned everything.

---

## New in 1.0.0

**`verificationStatus`** — LI.FI's undocumented vault-quality signal, now on
every `Vault`. Helpers: `isFlagged(vault)`, `flagReasons(vault)`.

**Drift detection** — `detectDrift()` and `formatDriftReport()` compare the live
API, LI.FI's OpenAPI spec, and our schema, reporting which pair disagrees. Also
available as `pnpm --filter @earnforge/sdk drift`.

**Structured errors** — `EarnApiError.fieldErrors` carries the per-field
`errors[]` array from a `400`. Note that `404` does not include one, despite the
changelog saying otherwise.

**New helpers** — `getRewardApy`, `isRewardApyUnknown`, `rewardShareOfTotal`,
`hasImpermanentLossRisk`, `analyticsAgeMs`, `parseVaultSlug`, `riskLabel`,
`positionBalanceUsd`, `totalPortfolioUsd`, `protocolFilterKey`.

**Server-side filters** — `isTransactional`, `isRedeemable`,
`isComposerSupported` on `listVaults()`.

---

## Portfolio positions

`protocolName`, `balanceUsd` and `balanceNative` are all nullable now. If you
format them, handle null — `Number(null).toFixed(2)` renders `NaN`.

```diff
- `$${Number(p.balanceUsd).toFixed(2)}`
+ positionBalanceUsd(p) === null ? '—' : `$${positionBalanceUsd(p)!.toFixed(2)}`
```

---

## Checklist

- [ ] Pass `apiKey` or set `LIFI_API_KEY`
- [ ] Proxy Earn calls server-side in any browser code
- [ ] Replace versioned protocol slugs
- [ ] Replace `vault.provider` and `vault.lpTokens`
- [ ] Use `parseTvl()` for `tvl.usd`
- [ ] Handle `null` on `apy.reward`, `apy.base`, and portfolio balances
- [ ] Re-check anything keyed off risk labels
- [ ] Replace manual slug splitting with `parseVaultSlug()`
- [ ] Add `verification` and `rewardDependency` to any `RiskBreakdown` you build

Full detail on every API behaviour: [`PITFALLS.md`](./PITFALLS.md).
