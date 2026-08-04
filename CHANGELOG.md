# EarnForge

## 1.0.0

The `0.1.x` line does not work. LI.FI rewrote the Earn API in April 2026, days
after `0.1.4` was published, and every call it makes now returns `404` or `401`.
This release is the repair, plus the work that repair made possible.

**If you are on `0.1.x`, upgrading is not optional.** See
[MIGRATING.md](./MIGRATING.md) for a diff of every breaking change.

### The breakage, and why 474 passing tests missed it

Four independent breaks landed in one release, with no deprecation window:

| | |
|---|---|
| Paths | every Earn endpoint dropped its `/earn` segment |
| Auth | became mandatory — **this inverts Pitfall #2**, which had said the Earn API takes no auth header |
| Fields | `provider` and `lpTokens` removed; both were required in our schema, so every parse threw |
| Types | `tvl.usd` changed string → number — **this inverts Pitfall #8** |

Nothing caught it, for three independent reasons: the suite was entirely
MSW-mocked against April fixtures; the live tests were excluded from CI; and
`test:live` used `vitest run --include`, which is not a valid Vitest 4 flag, so
**the script had never once executed**. There was no typecheck or lint gate
either — 18 and 124 errors were sitting unreported.

All of that is now gated in CI, including a live suite and a daily drift check.

### Breaking changes

- **`apiKey` is required.** `createEarnForge()` with no key throws instead of
  failing later with a bare `401`.
- **`tvl.usd` is a number.** `parseTvl()` accepts both and normalises, so a
  flip back is a non-event.
- **`apy.reward` is no longer coerced to `0`.** It is three-valued — `null`
  (unreported), `0` (reported as none), or positive — and the distinction is
  load-bearing for reward sustainability. It can now be `null` where it never
  was before.
- **Risk labels moved.** Thresholds went 7/4 → 8/6. A vault that reported
  "low" may now report "medium". The old thresholds put 80% of the fleet in
  "low" and made "high" mathematically unreachable.
- **Protocol ids are unversioned** — mostly. `morpho`, not `morpho-v1`. Read
  them from `/v1/protocols` and never hardcode: a stale id returns `200` with
  zero results rather than an error. (`spark-v2` arrived versioned in August,
  so "always unversioned" is a convention, not a rule.)
- **Studio proxies Earn calls server-side.** Both data components previously
  called the API from the browser, which now `401`s — and shipping the key
  client-side would leak it.
- **Peer requirements moved**: Zod 4, TypeScript 7, Next 16, Astro 7,
  commander 15.

### Added

- **Reward sustainability** — answers *"is this 12% real, or an incentive that
  ends?"*, which no LI.FI surface does. Works only because `apy.reward` keeps
  its three-valued distinction.
- **Composer Flows** — atomic swap-then-deposit at the exact received amount,
  which `/v1/quote` cannot express. Plus `vaultRoutability()`, which answers
  what no Earn field does: the vault list is a *superset* of what Composer can
  execute, so a vault can be listed, carry `isTransactional: true`, and still
  be impossible to enter.
- **Aave v3 borrow lifecycle** with a health-factor floor, enforced before
  signing. (Not on-chain — the Compose manifest exposes no `getHealthFactor`
  op, and that limitation is documented rather than glossed.)
- **Schema drift detection** — a three-way diff across the live API, LI.FI's
  OpenAPI spec, and our schema, reporting *which pair* disagrees so a vendor
  doc bug is distinguishable from ours. Runs daily in CI.
- **MCP `2026-07-28`** — the current protocol revision, served alongside
  2025-era clients from one factory, verified on a real Cloudflare Workers
  runtime.
- **The skill served over MCP** as resources under `skill://earnforge/*`, so
  one connection yields the tools *and* the instructions for using them.

### Fixed

- **DeFiLlama coverage 14.3% → 96.6%.** The mapping was keyed on versioned
  slugs that no longer exist *and* five project names were wrong. Sparklines
  were broken for 86% of vaults, including all 210 Morpho ones.
- **`minTvl` was silently doing nothing.** The parameter is `minTvlUsd`;
  unknown params are dropped without error, so a `$100M+` filter returned the
  entire unfiltered fleet.
- **`verificationStatus` is now wired in** — undocumented, in no spec or
  changelog, present on every vault, and flagging 9.6% of them. It is a
  weighted risk dimension with a structural invariant: a flagged vault caps at
  7.96, so **no flagged vault can ever read as low risk**, and `suggest()` will
  not allocate into one without `includeFlagged: true`.
- **All 27 live protocols carry a risk tier.** Fourteen were silently
  defaulting to "unknown" while LI.FI doubled its protocol count.
- **`earnforge simulate` actually simulates.** It was a bare `eth_call` that
  could not see allowances, balances or protocol state, and reported SUCCESS
  for transactions that would revert.

### Removed

- **`@earnforge/bot`** is archived. Run
  `npm deprecate @earnforge/bot 'Archived. Use @earnforge/cli or @earnforge/sdk.'`

### Notes on LI.FI's documentation

Several published behaviours are wrong, and following them silently produces
incorrect numbers. Verified against 711 live vaults on Aug 4, 2026:

| Documented | Actual |
|---|---|
| APY is a decimal (`0.0534` = 5.34%) | already a percentage — the quickstart's `* 100` overstates every yield **100×** |
| `tvl.usd` is a string | a number |
| `caps`, `timeLock`, `kyc`, `lpTokens` exist | sent by **zero** vaults |
| Structured errors on `400` and `404` | only `400` carries `errors[]` |
| Analytics refresh every 15 minutes | one **hourly** batch — the freshest reading in the fleet is over an hour old, the tail ~92 h |
| "No API key required" | `earn.li.fi` hard-`401`s |

Full detail, with a regression test for each: [PITFALLS.md](./PITFALLS.md).
