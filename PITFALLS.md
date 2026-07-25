# The LI.FI Earn API Pitfalls

Every pitfall here has a dedicated regression test under
`packages/sdk/test/pitfalls/`, and every claim was verified against the live API
on **Jul 25, 2026** across 609 vaults. Where LI.FI's documentation says something
different, that difference is itself recorded — six of these exist *because* the
docs and the API disagree.

Two of the original eighteen have **inverted** since they were written, and one is
**obsolete**. That is the point of this list: it tracks what the API does, not
what it did.

---

## Quick reference

| # | Pitfall | Status | Handled by |
|---|---------|--------|-----------|
| 1 | Wrong base URL — `earn.li.fi` vs `li.quest` | current | Two typed clients with correct defaults |
| 2 | **Auth is required** on the Earn Data API | **inverted** | `x-lifi-api-key` header + `MissingApiKeyError` |
| 3 | Missing Composer API key | current | Constructor validation + `requireComposer()` |
| 4 | POST instead of GET on `/v1/quote` | current | Hard-coded `GET` |
| 5 | Wrong `toToken` on deposits | current | `buildDepositQuote()` wires `vault.address` |
| 6 | Ignoring pagination | current | Async iterator; `nextCursor` absent on last page |
| 7 | Null APY values | current | Nullable types + `getBestApy()` fallback chain |
| 8 | **`tvl.usd` is a number** (was a string) | **inverted** | `TvlSchema` accepts both; `parseTvl()` normalises |
| 9 | Decimal mismatch | current | `toSmallestUnit()` / `fromSmallestUnit()` |
| 10 | Stale quote | current | LRU cache with TTL; quotes never cached |
| 11 | No gas token | current | `preflight()` balance check |
| 12 | Chain mismatch | current | `preflight()` chain comparison |
| 13 | Non-transactional vault | current | `isTransactional` guard |
| 14 | Rate limit | current | Token bucket, 100 req/min |
| 15 | Empty `underlyingTokens` | **obsolete** | Guard retained; 0 of 609 vaults now hit it |
| 16 | Optional `description` | current | `.optional()` — present on 18% of vaults |
| 17 | **`apy.reward` is three-valued** | revised | null preserved, not coerced to 0 |
| 18 | `apy1d` null | current | Extended fallback chain |
| 19 | **Stale protocol slugs return zero results** | new | Unversioned ids + upstream existence test |
| 20 | **Unknown query params fail open** | new | Correct param names pinned by test |
| 21 | **`verificationStatus` is undocumented** | new | First-class risk dimension |
| 22 | **The docs contradict the API** | new | Schemas generated from live responses |
| 23 | **Slug format changed** | new | `parseVaultSlug()` accepts both forms |

---

## The three that changed

### #2 — Auth inverted

This used to read *"don't send auth to the Earn Data API"*, because the endpoint
was public. It is now the opposite: `earn.li.fi` returns `401` without an
`x-lifi-api-key` header. Both an empty key and a garbage key are rejected, so the
header is genuinely validated rather than merely required.

The trap is that LI.FI's API reference still states *"All LI.FI APIs do not
require API key. API key is only needed for higher rate limits."* That remains
true for `li.quest` and is false for `earn.li.fi`.

`EarnDataClient` throws `MissingApiKeyError` at construction rather than letting a
`401` surface from deep inside a paginated walk.

### #8 — TVL type inverted

`tvl.usd` used to arrive as a decimal string. It is now a JSON number on every
live vault — while the OpenAPI spec still declares it a string.

Because both representations are attested by some source, `TvlSchema` accepts
either and `parseTvl()` normalises to `{ raw, parsed, bigint }`. Pinning one type
is what breaks on the next flip, and it has already flipped once.

### #17 — Reward semantics revised

The original rule was *"Morpho returns 0, Euler and Aave return null, so
normalise null to 0."* Across 609 vaults that is too simple in two ways: all three
states occur, and the split varies **within** a protocol rather than between
protocols.

| Protocol | null | 0 | positive |
|---|---|---|---|
| morpho | — | 160 | 50 |
| yearn | — | 89 | 7 |
| aave | 143 | — | 17 |
| pendle | 70 | — | 5 |

Collapsing null to 0 destroys real information: "the protocol reported no
incentives" and "the protocol reported nothing" are different facts, and
reward-sustainability analysis needs both. The schema preserves null;
`getRewardApy()` is the opt-in coercion.

---

## The four new ones

### #19 — Stale protocol slugs return zero results, not an error

The Apr 2026 rewrite dropped version suffixes: `morpho-v1` → `morpho`,
`aave-v3` → `aave`, `euler-v2` → `euler`. `maple` left the index entirely.

The failure mode is what makes this dangerous. Filtering on a slug that no longer
exists does not `400` — it returns `200` with `total: 0`. A stale slug is
indistinguishable from "this protocol has no vaults."

This bit us directly. The risk scorer's protocol tiers were keyed on versioned
slugs, so every Aave and Morpho vault fell through to the unknown-protocol default
of 3 — scoring the two largest, most audited protocols on the platform as if
nobody had heard of them.

It also hit DeFiLlama matching, where the mapping was wrong twice over: the keys
were stale *and* five of the DeFiLlama project names were wrong (`morpho` is
`morpho-blue`, not `morpho-v1`; `yearn-finance`; `maple`, not `maple-finance`).
Fixing both took APY-history coverage from **14.3% to 96.6%**.

> LI.FI's own hosted MCP server still advertises `morpho-v1`, `aave-v3` and
> `euler-v2` to agents.

### #20 — Unknown query params fail open

The TVL filter is `minTvlUsd`. We sent `minTvl`. The API returned the entire
unfiltered fleet with `200` — no rejection, no warning.

```
minTvl=100000000     -> 609 results   (silently unfiltered)
minTvlUsd=100000000  ->  33 results
```

For a yield tool that is the worst possible failure: you ask for "$100M+ vaults"
and get sub-$20k dust back, while every downstream consumer operates on the wrong
candidate set and looks perfectly healthy. A filter that fails open is worse than
one that throws.

### #21 — `verificationStatus` is undocumented but load-bearing

Every vault carries `verificationStatus` and `verificationStatusBreakdown`.
Neither appears in the OpenAPI spec, the changelog, the quickstart, or the
NormalizedVault reference — and LI.FI's hosted MCP server does not expose them.

They are not cosmetic. **56 of 609 vaults (9.2%)** are `flagged`:

| Reason | Count |
|---|---|
| `zero_apy` | 55 |
| `apy_outlier` | 1 |

A tool ignoring this will rank a flagged vault top of a max-APY list and recommend
depositing into it — exactly what the flag exists to prevent.

EarnForge treats it as a first-class risk dimension weighted at 0.22, which
creates a structural guarantee: **a flagged vault cannot score ≥ 8, so it can
never be labelled low risk.** `suggest()` excludes flagged vaults unless you pass
`includeFlagged: true`.

### #22 — The docs contradict the API

This subsumes the rest, and it is why schemas here are generated from live
responses rather than from the specification.

**Wrong in the spec:**

| Claim | Reality |
|---|---|
| APY is "expressed as a decimal (`0.0534` = 5.34%)" | already a percentage |
| `tvl.usd` is a string | a number |
| `caps`, `timeLock`, `kyc`, `lpTokens` exist | 0 of 609 vaults send any |

The APY one costs money. The quickstart compounds it by multiplying by 100, so
**following LI.FI's official example overstates every yield 100×** — a 29% vault
renders as 2919%.

**Missing from the spec:** `verificationStatus`, `verificationStatusBreakdown`,
`underlyingTokens[].priceUsd` — all present on every vault.

**Outside the spec:** the changelog announces structured error bodies for `400`
*and* `404`, but only `400` carries an `errors[]` array. And the docs state
analytics refresh every 15 minutes, while the observed floor across the fleet is
**87 minutes**, median 90, max ~92 hours.

### #23 — Slug format changed

`8453-0xee8f...` became `morpho:8453:_:0xee8f...`. Code splitting on `-` to
recover a chain id and address mis-parses every slug — and since `nextCursor` *is*
a slug, cursor validation against the old shape rejects valid pagination tokens.

`parseVaultSlug()` accepts both forms, because slugs get stored in bookmarks,
config files and databases and keep arriving from callers long after the API
stopped producing them.

---

## #15 is obsolete, and stays anyway

Pitfall #15 was found via a UNIBTC vault reporting no underlying tokens. Zero of
609 live vaults now have an empty array, so the case cannot be driven from a
fixture.

The guard remains, tested against a synthesised vault. The shape is still legal,
and LI.FI has reintroduced dropped shapes before — `tvl.usd` went string → number
and the spec still claims string.

---

## Why a 474-test suite caught none of this

The suite that preceded this release stayed green through all four breaking
changes. Three independent reasons:

1. Every test mocked the API against April fixtures, so it verified our agreement
   with a snapshot of the past.
2. The live tests were excluded from CI to stop flakiness.
3. `test:live` used `vitest run --include`, which is not a valid Vitest 4 flag —
   **the script had never executed.**

CI now gates on typecheck, lint, the mocked suite, the live suite, and a schema
drift check, plus a daily scheduled run.

## Drift detection

Validating against LI.FI's OpenAPI spec does not work either — as #22 shows, the
spec is wrong in six places and silent about three real fields. Failing CI on
deviation from it would raise false alarms and miss the true ones.

So `pnpm --filter @earnforge/sdk drift` compares **three** sources and reports
which pair disagrees:

1. the live API — what is served
2. the OpenAPI spec — what LI.FI documents
3. our Zod schema — what we parse

A disagreement between (1) and (3) is our bug and fails the build. Between (1) and
(2) it is a documentation bug — reported but not fatal, because it will mislead
anyone reading the docs and that is worth telling users about.

```
$ pnpm --filter @earnforge/sdk drift

Schema drift check — 100 live vaults vs OpenAPI spec

WARNING (2)
  [live-vs-spec] analytics.apy
    The spec states APY is "expressed as a decimal", but live values exceed 1
    and are already percentages. Following the spec (or the quickstart, which
    multiplies by 100) overstates every APY 100x.
  [live-vs-spec] analytics.tvl.usd
    The spec declares tvl.usd a string; the live API sends a number.

INFO (4)
  [live-vs-spec] caps / timeLock / kyc / lpTokens
    Documented in the OpenAPI spec but sent by no live vault.

No breaking drift — our schema still matches the live API.
```

## Running the suite

```bash
pnpm --filter @earnforge/sdk test            # mocked, includes all 23 pitfalls
LIFI_API_KEY=... pnpm --filter @earnforge/sdk test:live
LIFI_API_KEY=... pnpm --filter @earnforge/sdk drift
```
