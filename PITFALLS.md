# The LI.FI Earn API Pitfalls

Every pitfall here has a dedicated regression test under
`packages/sdk/test/pitfalls/`, and every claim was verified against the live API
on **Sep 7, 2026** across 744 vaults. Where LI.FI's documentation says something
different, that difference is itself recorded: six of these exist *because* the
docs and the API disagree.

Two of the original eighteen have **inverted** since they were written, one is
**obsolete**, and one has been **fixed upstream** by LI.FI without an
announcement. That is the point of this list: it tracks what the API does, not
what it did.

---

## Quick reference

| # | Pitfall | Status | Handled by |
|---|---------|--------|-----------|
| 1 | Wrong base URL: `earn.li.fi` vs `li.quest` | current | Two typed clients with correct defaults |
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
| 15 | Empty `underlyingTokens` | **obsolete** | Guard retained; 0 of 744 vaults now hit it |
| 16 | Optional `description` | current | `.optional()`: present on 28% of vaults |
| 17 | **`apy.reward` is three-valued** | revised | null preserved, not coerced to 0 |
| 18 | `apy1d` null | current | Extended fallback chain |
| 19 | **Stale protocol slugs return zero results** | new | Unversioned ids + upstream existence test |
| 20 | **Unknown query params fail open** | new | Correct param names pinned by test |
| 21 | **`verificationStatus` is undocumented** | new | First-class risk dimension |
| 22 | **The docs contradict the API** | new | Schemas generated from live responses |
| 23 | **Slug format changed** | new | `parseVaultSlug()` accepts both forms |
| 24 | **Partial `underlyingTokens` entries** | **fixed upstream** | `symbol`/`decimals` optional; guard retained, 0 of 744 now hit it |
| 25 | **New route flags fail by exclusion** | new | `probeGasless()` / `probeSmartDeposit()` differential probe |

---

## The three that changed

### #2: Auth inverted

This used to read *"don't send auth to the Earn Data API"*, because the endpoint
was public. It is now the opposite: `earn.li.fi` returns `401` without an
`x-lifi-api-key` header. A missing header and an empty one are refused on every
request measured.

**A garbage key is not.** This section previously claimed one was, and that is no
longer true. Measured 10 Aug 2026, an invalid key was *accepted* on 9 of 15
requests to `/v1/chains` (returning real data) and `/v1/vaults` behaved the
same way. Presence of the header is enforced consistently; validity is checked
on only some fraction of requests, which looks like part of the fleet behind the
load balancer not validating.

Do not build anything on the assumption that a bad key fails fast. It fails
roughly half the time, which is worse than either extreme: a key rotated out or
mistyped will appear to work until it intermittently doesn't. The live suite
asserts only that validation still happens *at all*, because asserting `401`
failed ~60% of runs and read like a bug in EarnForge.

The trap is that LI.FI's API reference still states *"All LI.FI APIs do not
require API key. API key is only needed for higher rate limits."* That remains
true for `li.quest` and is false for `earn.li.fi`.

`EarnDataClient` throws `MissingApiKeyError` at construction rather than letting a
`401` surface from deep inside a paginated walk.

### #8: TVL type inverted

`tvl.usd` used to arrive as a decimal string. It is now a JSON number on every
live vault, while the OpenAPI spec still declares it a string.

Because both representations are attested by some source, `TvlSchema` accepts
either and `parseTvl()` normalises to `{ raw, parsed, bigint }`. Pinning one type
is what breaks on the next flip, and it has already flipped once.

### #17: Reward semantics revised

The original rule was *"Morpho returns 0, Euler and Aave return null, so
normalise null to 0."* Across 744 vaults that is too simple in two ways: all three
states occur, and the split varies **within** a protocol rather than between
protocols.

| Protocol | null | 0 | positive |
|---|---|---|---|
| morpho | 0 | 160 | 50 |
| yearn | 0 | 89 | 7 |
| aave | 143 | 0 | 17 |
| pendle | 70 | 0 | 5 |

Collapsing null to 0 destroys real information: "the protocol reported no
incentives" and "the protocol reported nothing" are different facts, and
reward-sustainability analysis needs both. The schema preserves null;
`getRewardApy()` is the opt-in coercion.

---

## The four new ones

### #19: Stale protocol slugs return zero results, not an error

The Apr 2026 rewrite dropped version suffixes: `morpho-v1` → `morpho`,
`aave-v3` → `aave`, `euler-v2` → `euler`. `maple` left the index entirely.

The failure mode is what makes this dangerous. Filtering on a slug that no longer
exists does not `400`. It returns `200` with `total: 0`. A stale slug is
indistinguishable from "this protocol has no vaults."

This bit us directly. The risk scorer's protocol tiers were keyed on versioned
slugs, so every Aave and Morpho vault fell through to the unknown-protocol default
of 3: scoring the two largest, most audited protocols on the platform as if
nobody had heard of them.

It also hit DeFiLlama matching, where the mapping was wrong twice over: the keys
were stale *and* five of the DeFiLlama project names were wrong (`morpho` is
`morpho-blue`, not `morpho-v1`; `yearn-finance`; `maple`, not `maple-finance`).
Fixing both took APY-history coverage from **14.3% to 96.6%**.

> LI.FI's own hosted MCP server still advertises `morpho-v1`, `aave-v3` and
> `euler-v2` to agents.

### #20: Unknown query params fail open

The TVL filter is `minTvlUsd`. We sent `minTvl`. The API returned the entire
unfiltered fleet with `200`. No rejection, no warning.

```
minTvl=100000000     -> 744 results   (silently unfiltered)
minTvlUsd=100000000  ->  39 results
```

For a yield tool that is the worst possible failure: you ask for "$100M+ vaults"
and get sub-$20k dust back, while every downstream consumer operates on the wrong
candidate set and looks perfectly healthy. A filter that fails open is worse than
one that throws.

### #21: `verificationStatus` is undocumented but load-bearing

Every vault carries `verificationStatus` and `verificationStatusBreakdown`.
Neither appears in the OpenAPI spec, the changelog, the quickstart, or the
NormalizedVault reference, and LI.FI's hosted MCP server does not expose them.

They are not cosmetic. **72 of 744 vaults (9.7%)** are `flagged`:

| Reason | Count |
|---|---|
| `zero_apy` | 73 |
| `apy_outlier` | 2 |

A tool ignoring this will rank a flagged vault top of a max-APY list and recommend
depositing into it: exactly what the flag exists to prevent.

EarnForge treats it as a first-class risk dimension weighted at 0.22, which
creates a structural guarantee: **a flagged vault cannot score ≥ 8, so it can
never be labelled low risk.** `suggest()` excludes flagged vaults unless you pass
`includeFlagged: true`.

### #22. The docs contradict the API

This subsumes the rest, and it is why schemas here are generated from live
responses rather than from the specification.

**Wrong in the spec:**

| Claim | Reality |
|---|---|
| APY is "expressed as a decimal (`0.0534` = 5.34%)" | already a percentage |
| `tvl.usd` is a string | a number |
| `caps`, `timeLock`, `kyc`, `lpTokens` exist | 0 of 744 vaults send any |

The APY one costs money. The quickstart compounds it by multiplying by 100, so
**following LI.FI's official example overstates every yield 100×**: a 29% vault
renders as 2919%.

**Missing from the spec:** `verificationStatus`, `verificationStatusBreakdown`,
`underlyingTokens[].priceUsd`. All present on every vault.

**Outside the spec:** the changelog announces structured error bodies for `400`
*and* `404`, but only `400` carries an `errors[]` array. And the docs state
analytics refresh every 15 minutes, while the fleet actually refreshes in a
single **hourly** batch: most vaults share one `updatedAt` minute, though the
exact share swings through the cycle, so the freshest reading available is over
an hour old, with a tail past 90 hours.
The precise staleness you observe is just how far into the hour you sampled;
what is stable is that it is never 15 minutes.

### #23: Slug format changed

`8453-0xee8f...` became `morpho:8453:_:0xee8f...`. Code splitting on `-` to
recover a chain id and address mis-parses every slug, and since `nextCursor` *is*
a slug, cursor validation against the old shape rejects valid pagination tokens.

`parseVaultSlug()` accepts both forms, because slugs get stored in bookmarks,
config files and databases and keep arriving from callers long after the API
stopped producing them.

---

## #15 is obsolete, and stays anyway

Pitfall #15 was found via a UNIBTC vault reporting no underlying tokens. Zero of
744 live vaults now have an empty array, so the case cannot be driven from a
fixture.

The guard remains, tested against a synthesised vault. The shape is still legal,
and LI.FI has reintroduced dropped shapes before: `tvl.usd` went string → number
and the spec still claims string.

---

## #24, and then the array came back, half-filled

Keeping #15's guard was the right call for the wrong reason. The array never went
empty again. What the API actually started sending was stranger: a *populated*
`underlyingTokens` whose entries carry only an `address`. No `symbol`, no
`decimals`.

`morpho:1:_:0xb5ce3ca2c774b72955c25875022fdd91f7a7b938` (KPK-WARS-YIELD) was the
live example. Because the schema required both fields, `listAll()` threw a
ZodError partway through the fleet, and everything iterating every vault died with
it: the Studio's vault list read **zero** in production, and `earnforge list`
without a chain filter could not complete.

One vault in seven hundred, and it survived every check. The drift detector
samples 100 vaults, the fixtures stop at two pages, and the live tests assert
shape on a handful. The bad vault sat around index 300.

`symbol` and `decimals` are now optional. The lesson is narrower than "validate
less": a field being present on every vault you sampled is not the same as it
being required, and the distance between those two claims is one vault in the
fleet.

**As of 7 Sep 2026 that distance is zero.** LI.FI has filled the gap upstream:
KPK-WARS-YIELD still exists and now reports `wARS`, 18 decimals and a price,
and all 796 token entries across the fleet are complete. The guard stays for the
same reason #15's does. The shape is legal, LI.FI never announced either the
break or the fix, and a schema that only tolerates today's fleet is a schema
that breaks on tomorrow's.

---

## #25: the new route flags fail by exclusion, not by error

The four before this one were found by reading responses LI.FI already served.
This one was found by reading LI.FI's git history, which turns out to be the
better source: it tells you what is coming before it reaches anyone's response.

`@lifi/types` 18.4.0 (Aug and Sep 2026) added three optional request flags:

| Flag | What it does |
|---|---|
| `destinationActionKind` + `destinationActionVault` | **Smart Deposits**: bridge, then deposit into an ERC-4626 vault, in one route |
| `gasless` | returns signable typed data instead of a `transactionRequest`, with a `LIFI Gasless Relay Fee` deducted from the input |
| `amountFlexible` | any amount at or above a minimum executes at the live price |

Smart Deposits matters most here: it is the first time LI.FI's routing layer has
reached into the vault itself, which is the thing this SDK is about.

All three are live and validated today. None of them errors when it cannot be
honoured. **The route is excluded instead**, and what comes back is
indistinguishable from a pair with no liquidity:

```
GET  /v1/quote            -> 404  "No available quotes for the requested transfer"
POST /v1/advanced/routes  -> 200  { "routes": [] }
```

Measured 7 Sep 2026. `gasless=true` turned a working 200 into a 404 on every
pair tried, same-chain and cross-chain, on Arbitrum and Ethereum. Smart Deposits
returned zero routes across 25 vaults on multiple chains, because the Intent
Factory allowlist gating it is not published and currently matches nothing
reachable from outside.

Exclusion is the right behaviour on LI.FI's side, and they say so: serving a
Smart Deposits route with the deposit leg quietly removed would hand the user
raw tokens while they believed they held vault shares. The pitfall is what it
does to the caller. A 404 reads as "this vault is unreachable", and all three
instinctive responses are wrong: retrying does nothing, widening slippage does
nothing, and dropping the flag *succeeds* while silently abandoning the thing
the user asked for. The last is the dangerous one, because it looks like it
worked.

From outside there is exactly one way to tell the two apart: run the request
both ways and compare.

```bash
earnforge probe --flag smart-deposit --vault morpho:8453:_:0xbeef… \
  --from-chain 42161 --from-token 0xaf88…5831 --wallet 0xd8dA…6045
```
```
  Verdict:   flag-excluded
  Baseline:  routes
  Flagged:   no route
  Status:    404
```

`flag-excluded` and `route-unavailable` are the same HTTP status and opposite
conclusions. The probe reports; it deliberately does not fall back, because a
silent fallback is the failure it exists to prevent. A `flag-excluded` verdict
means *not yet*, not *broken*.

Two guards sit around the probe, both against false negatives that would write a
wrong fact about LI.FI's allowlist into a caller's cache. A `toToken` that is not
the vault's underlying, and a same-chain route, each return the identical 404 as
an unlisted vault. Both are refused before the request is sent.

**The second half of the trap is worse, and is not yet observable.** A step
returned for a Smart Deposits route carries its `destinationAction`, and LI.FI's
type documentation states that posting it back to `/v1/advanced/stepTransaction`
without that field "prepares a plain bundle that delivers the raw token instead
of the action's output". Any code that reserialises a step, strips unknown keys,
or narrows it through a stricter type will drop it, and the flow then succeeds
while depositing nothing.

That one is sourced from LI.FI's types, not from observation, and is labelled as
such in the code: with no route served, no step carrying a real
`destinationAction` could be obtained to test against.
`assertDestinationActionPreserved()` is written to be right when routes appear
rather than to encode behaviour anyone has watched. The distinction is the same
one the drift detector draws, and it is worth keeping honest: this list is only
useful if "verified" and "documented" never quietly become the same word.

---

## Why a 474-test suite caught none of this

The suite that preceded this release stayed green through all four breaking
changes. Three independent reasons:

1. Every test mocked the API against April fixtures, so it verified our agreement
   with a snapshot of the past.
2. The live tests were excluded from CI to stop flakiness.
3. `test:live` used `vitest run --include`, which is not a valid Vitest 4 flag.
   **The script had never executed.**

CI now gates on typecheck, lint, the mocked suite, the live suite, and a schema
drift check, plus a daily scheduled run.

## Drift detection

Validating against LI.FI's OpenAPI spec does not work either, as #22 shows, the
spec is wrong in six places and silent about three real fields. Failing CI on
deviation from it would raise false alarms and miss the true ones.

So `pnpm --filter @earnforge/sdk drift` compares **three** sources and reports
which pair disagrees:

1. the live API: what is served
2. the OpenAPI spec: what LI.FI documents
3. our Zod schema: what we parse

A disagreement between (1) and (3) is our bug and fails the build. Between (1) and
(2) it is a documentation bug: reported but not fatal, because it will mislead
anyone reading the docs and that is worth telling users about.

```
$ pnpm --filter @earnforge/sdk drift

Schema drift check: 100 live vaults vs OpenAPI spec

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

No breaking drift. Our schema still matches the live API.
```

## Running the suite

```bash
pnpm --filter @earnforge/sdk test            # mocked, includes all 25 pitfalls
LIFI_API_KEY=... pnpm --filter @earnforge/sdk test:live
LIFI_API_KEY=... pnpm --filter @earnforge/sdk drift
```
