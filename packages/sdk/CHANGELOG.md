# @earnforge/sdk

## 1.0.4

### Patch Changes

- **`listAll()` completes.** It threw a `ZodError` roughly 300 vaults into the
  fleet, because `underlyingTokens[].symbol` and `.decimals` were required and
  one vault in 712 — `morpho:1:_:0xb5ce...b938`, KPK-WARS-YIELD — ships a token
  object carrying nothing but an address. Anything iterating every vault died on
  it: EarnForge Studio's vault list read zero in production, and `earnforge
  list` without a chain filter could not finish.

  Both fields are optional now, which is what the API demonstrably sends.
  Callers needing `decimals` for amount conversion already fell back to 18;
  callers displaying `symbol` no longer assume a string.

  Pitfall #15 anticipated an *empty* `underlyingTokens` array. This is the
  stranger case it did not: a populated array with a partial entry.

- **`detectDrift()` parses every vault, not one page.** It sampled 100 and
  therefore could never have seen a vault at index 300. Sampling answers "does
  this field still exist"; it cannot answer "is our schema satisfiable by every
  vault", and those come apart at exactly one vault in seven hundred. Failures
  are grouped by field path and reported per vault rather than thrown, so one
  malformed row is a finding instead of the end of the audit.

## 1.0.3

### Patch Changes

- **The deposit flow can compile.** `buildDepositFlow` composed the swap to
  output the vault's *share* token, then zapped from that into the same share
  token. Composer rejects the program with
  `No routing edge found from erc20:<vault> to erc20:<vault>` — not for certain
  vaults or certain inputs, but for every vault from every input, which means
  `earnforge simulate` had never once succeeded.

  The swap now outputs the vault's underlying asset, which is what the zap needs
  on its input side, and the swap leg is skipped entirely when the caller
  already holds that asset. Verified against live Composer: USDC into STEAKUSDC
  simulates clean at 1,012,480 gas, WETH at 2,084,552 with the swap included.

  The tests could not have caught this. Compilation is stubbed, and the vault
  fixture omitted `underlyingTokens` — which no live vault does — so the flow
  passed while being impossible to compile. The fixture now carries the field
  and two tests pin the swap's destination.

- `DepositFlowParams.vault` accepts `underlyingTokens`, since the flow now needs
  the vault's asset to route through.

## 1.0.2

### Patch Changes

- Package metadata declares `repository`, `homepage`, `bugs` and `author`. The
  npm page had no link back to the source or the docs.

## 1.0.1

### Patch Changes

- Documentation-only. The README and the risk scorer's own comments quoted an
  "observed floor of 87 minutes" for analytics staleness. That figure was never
  a property of the API — it was how far into the refresh cycle the sample
  landed. The fleet updates in one hourly batch, with 588 of 711 vaults sharing
  a single `updatedAt` minute, so the number reads differently every time it is
  measured. Replaced with the structural claim, which holds: the documented
  15-minute refresh is never what you get.

  Fleet counts normalised to one measurement (711 vaults, 68 flagged). Three
  figures dated the same day disagreed — 710, 711, and 609 in the risk scorer.

  No behaviour change; `STALE_ANALYTICS_MS` and every score are unchanged.

## 1.0.0

### Major Changes

- `apiKey` is now required. `createEarnForge()` with no key throws a
  `MissingApiKeyError` naming the portal, instead of failing later with a bare
  `401`. One key authenticates both the Earn Data API and Composer.

- Every request path lost its `/earn` segment (`/v1/earn/vaults` →
  `/v1/vaults`). Calls made by `0.1.x` return `404`.

- `tvl.usd` is a number, not a string. `parseTvl()` accepts both and
  normalises, so a flip back is a non-event for callers. **This inverts
  Pitfall #8.**

- `apy.reward` is no longer coerced to `0`. It is three-valued — `null`
  (protocol reported nothing), `0` (reported no incentives), or positive — and
  the split varies *within* a protocol. Collapsing `null` into `0` would score
  most of Aave as confidently organic while knowing nothing about it.

- Risk label thresholds moved from 7/4 to 8/6. A vault that reported `low` may
  now report `medium`. The old boundaries put 80% of the fleet in `low` and
  made `high` mathematically unreachable.

- `provider` and `lpTokens` were removed from vault responses and dropped from
  the schema. Both were required, so every parse threw.

- Protocol ids are read from `/v1/protocols`, never hardcoded. Most are
  unversioned (`morpho`, not `morpho-v1`), but `spark-v2` arrived versioned in
  Aug 2026 — a stale id returns `200` with zero results rather than an error,
  so it is indistinguishable from an empty protocol.

- Requires Zod 4 and TypeScript 7.

### Minor Changes

- `rewardSustainability()` / `analyzeRewardSustainability()` — grade how much
  of a headline APY survives incentives ending. The async form folds in the
  DeFiLlama curve, since a decaying APY separates *this emission exists* from
  *this emission is ending*.

- `ComposerFlows` — atomic multi-step positions via `@lifi/composer-sdk`.
  `buildDepositFlow()` binds the swap's `amountOut` handle straight into the
  deposit's `amountIn`, so the exact received amount is deposited in one
  transaction. `vaultRoutability()` reports whether a vault can actually be
  entered or exited: the Earn index is a superset of what Composer can route.

- Aave v3 borrow lifecycle — `getAaveAccountData()`, `projectBorrow()`,
  `assertBorrowSafe()`. The health-factor floor is enforced before signing, not
  on-chain; the Compose manifest exposes no `getHealthFactor` op to guard
  against, and that limitation is documented at the call site.

- `detectDrift()` — three-way diff across the live API, the OpenAPI spec, and
  our schema, reporting which pair disagrees. Covers response envelopes as well
  as vault fields, after `/v1/portfolio` renamed its array and a vault-only
  check reported "no breaking drift" straight through it.

- `verificationStatus` is a weighted risk dimension, alongside a
  `rewardDependency` dimension and a `flags[]` array. A flagged vault caps at
  7.96, so no flagged vault can read as low risk.

- All 27 live protocols carry an explicit risk tier, derived from track record,
  audits, scale and category rather than assigned by feel.

### Patch Changes

- DeFiLlama project mapping corrected — fleet coverage 14.3% → 96.6%. Keyed on
  versioned slugs that no longer exist, and five project names were wrong
  (`morpho-blue`, not `morpho-v1`).

- `minTvl` is sent as `minTvlUsd`. The API drops unknown query params without
  error, so the old name returned the entire unfiltered fleet.

- Page size raised 50 → 100.

- `nextCursor` is absent from the JSON on the final page — not null, not empty
  — so it is both nullable and optional.

- `/v1/portfolio` renamed its array `positions` → `data`. Both keys are
  accepted and normalised to `positions`.

- `apy.base` is nullable; it is null on at least one live vault.
