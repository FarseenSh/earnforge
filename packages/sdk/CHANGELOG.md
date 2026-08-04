# @earnforge/sdk

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
