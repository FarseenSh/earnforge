# Earn types for `@lifi/types`

A PR-ready contribution adding LI.FI Earn types to
[`@lifi/types`](https://www.npmjs.com/package/@lifi/types).

## Why

`@lifi/types@17.88.0` ships types for chains, tokens, bridges, exchanges,
steps and balances. It has **zero Earn types** — the word "earn" appears only
in the README. Anyone integrating the Earn Data API in TypeScript today writes
these by hand, from an OpenAPI spec that disagrees with the service.

## What to do with it

`earn.ts` is written in the package's own house style: plain interfaces, no
runtime dependency, no validation library. Dropping it in should be:

1. Copy `earn.ts` to `src/earn.ts` in `lifinance/types`.
2. Add `export * from './earn.js';` to `src/index.ts`.

No other changes. It imports nothing.

## Provenance

These are not transcribed from `earn-openapi.yaml`. They are derived from the
live API and cross-checked against it — 710 vaults, 19 chains, 27 protocols, as
of August 2026 — because the spec and the service disagree in several places.
Each disagreement is documented inline at the field it affects, so the
correction travels with the type rather than living in a changelog:

| Field | Spec says | API does |
|---|---|---|
| `analytics.apy.*` | decimal (`0.0534` = 5.34%) | already a percentage — the quickstart's `* 100` overstates every yield 100× |
| `analytics.tvl.usd` | string | number |
| `caps`, `timeLock`, `kyc` | documented | sent by zero vaults |
| `rewardTokens[].symbol`/`.decimals` | required | absent on some entries |
| 404 responses | structured `errors[]` | bare `{ statusCode, message }` |

Plus three behaviours that are in no spec at all:

- **`verificationStatus`** — undocumented, present on every vault, set to
  `flagged` on ~9% of them. It is LI.FI's own vault-quality signal.
- **`nextCursor`** is *absent* from the JSON on the final page rather than
  null, so it must be optional as well as nullable.
- **`apy.reward` is three-valued** — `null` (unreported), `0` (reported as
  none), or positive — and the split varies within a single protocol. This is
  the distinction that separates organic yield from a token emission, and a
  `?? 0` normalisation destroys it.

The portfolio response also renamed its array `positions` → `data` in August
2026 with no changelog entry; both are declared so consumers can migrate
without a break.

## Source

Generated from the Zod schemas in
[`@earnforge/sdk`](https://www.npmjs.com/package/@earnforge/sdk)
(`packages/sdk/src/schemas/`), which are exercised by a live integration suite
and a three-way drift check against the live API, the OpenAPI spec, and the
schemas themselves.
