# LI.FI Earn API -- 18 Pitfalls

Every pitfall below has been observed in production responses from
`earn.li.fi` and `li.quest` (April 2026). Pitfalls 1--14 originate from
LI.FI's official integration guide. Pitfalls 15--18 were discovered via
live API probing against the full vault set.

EarnForge eliminates each one at the SDK layer so downstream surfaces
(CLI, React hooks, MCP server, Telegram bot) never have to think about them.

| # | Pitfall | Root Cause | SDK Mitigation | Verifying Test |
|---|---------|-----------|----------------|----------------|
| 1 | Wrong base URL | Earn Data lives at `earn.li.fi`, Composer at `li.quest`. Mixing them returns 404. | Two typed clients: `EarnDataClient` (earn.li.fi) and `ComposerClient` (li.quest) with hard-coded defaults. | `packages/sdk/test/pitfalls/pitfall-01-wrong-base-url.test.ts` |
| 2 | Auth on Earn Data API | Sending an `Authorization` or `x-lifi-api-key` header to Earn Data returns 401 or is silently ignored. | `EarnDataClient.fetch()` sends zero auth headers. | `packages/sdk/test/pitfalls/pitfall-02-auth-on-earn-data.test.ts` |
| 3 | Missing Composer API key | Composer `/v1/quote` returns 401 without `x-lifi-api-key`. | `ComposerClient` constructor throws `ComposerError` if `apiKey` is falsy. `createEarnForge()` gates all Composer paths behind `requireComposer()`. | `packages/sdk/test/pitfalls/pitfall-03-missing-composer-key.test.ts` |
| 4 | POST instead of GET | Composer `/v1/quote` is GET with query params. POST returns 405. | `ComposerClient.getQuote()` hard-codes `method: 'GET'` and serializes params to query string. | `packages/sdk/test/pitfalls/pitfall-04-post-instead-of-get.test.ts` |
| 5 | Wrong `toToken` | Passing the underlying token address as `toToken` fails. The vault's share token _is_ the vault address. | `buildDepositQuote()` wires `toToken = vault.address` automatically. | `packages/sdk/test/pitfalls/pitfall-05-wrong-totoken.test.ts` |
| 6 | Ignoring pagination | `/v1/earn/vaults` returns max 50 per page. Without `nextCursor` handling you see <8% of vaults. | `EarnDataClient.listAllVaults()` is an async iterator that follows `nextCursor` until exhausted. | `packages/sdk/test/pitfalls/pitfall-06-ignoring-pagination.test.ts` |
| 7 | Null APY values | `apy.total` is always a number, but `apy1d`, `apy7d`, `apy30d` can be `null` on new or low-volume vaults. | `AnalyticsSchema` types them as `number | null`. `getBestApy()` implements a fallback chain: `apy.total` -> `apy30d` -> `apy7d` -> `apy1d` -> `0`. | `packages/sdk/test/pitfalls/pitfall-07-null-apy.test.ts` |
| 8 | TVL is a string | `analytics.tvl.usd` comes as `"12345678.90"` (string), not a number. Arithmetic on it silently produces `NaN`. | `parseTvl()` returns `{ raw: string, parsed: number, bigint: bigint }`. All SDK comparisons go through it. | `packages/sdk/test/pitfalls/pitfall-08-tvl-string.test.ts` |
| 9 | Decimal mismatch | USDC has 6 decimals, WETH has 18. Passing `"1"` raw sends 1 wei instead of 1 token. | `toSmallestUnit(amount, decimals)` and `fromSmallestUnit()` handle the conversion. `buildDepositQuote()` reads decimals from `vault.underlyingTokens`. | `packages/sdk/test/pitfalls/pitfall-09-decimal-mismatch.test.ts` |
| 10 | Stale quote | Quotes expire quickly. Using a cached quote for a transaction can revert. | `LRUCache` with configurable TTL (default 60s). Quote results are not cached; only read-only data (vaults, chains, protocols) is cached. | `packages/sdk/test/pitfalls/pitfall-10-stale-quote.test.ts` |
| 11 | No gas token | Submitting a tx with 0 native balance reverts with an opaque EVM error. | `preflight()` checks `nativeBalance` and returns a `NO_GAS` issue before any tx is built. | `packages/sdk/test/pitfalls/pitfall-11-no-gas-token.test.ts` |
| 12 | Chain mismatch | Wallet connected to chain A, vault on chain B. Tx sent to wrong RPC. | `preflight()` compares `walletChainId` vs `vault.chainId` and returns a `CHAIN_MISMATCH` issue. | `packages/sdk/test/pitfalls/pitfall-12-chain-mismatch.test.ts` |
| 13 | Non-transactional vault | ~30% of vaults have `isTransactional: false`. Deposit calls fail with an obscure Composer error. | `buildDepositQuote()` and `preflight()` both check `vault.isTransactional` and throw/report before hitting the network. | `packages/sdk/test/pitfalls/pitfall-13-non-transactional.test.ts` |
| 14 | Rate limit | Earn Data API has undocumented rate limits. Hammering it returns 429. | `TokenBucketRateLimiter` at 100 req/min. `acquireAsync()` waits instead of throwing when the bucket is empty. | `packages/sdk/test/pitfalls/pitfall-14-rate-limit.test.ts` |
| 15 | Empty `underlyingTokens` | Some vaults return `underlyingTokens: []`. Accessing `[0].address` throws. | `VaultSchema` allows empty arrays. `buildDepositQuote()` checks length and requires explicit `fromToken` when empty. `preflight()` warns. | `packages/sdk/test/pitfalls/pitfall-15-empty-underlying-tokens.test.ts` |
| 16 | Optional `description` | ~14% of vaults omit the `description` field entirely. Accessing it without a guard crashes rendering. | `VaultSchema` types `description` as `z.string().optional()`. All display code uses optional chaining. | `packages/sdk/test/pitfalls/pitfall-16-optional-description.test.ts` |
| 17 | `apy.reward` null vs 0 | Morpho vaults return `reward: 0`. Euler and Aave return `reward: null`. Inconsistent. | `ApySchema` applies `.nullable().transform(v => v ?? 0)` -- every consumer sees a plain `number`. | `packages/sdk/test/pitfalls/pitfall-17-apy-reward-null-vs-zero.test.ts` |
| 18 | `apy1d` null | Short-lived or freshly deployed vaults return `apy1d: null` and sometimes `apy7d: null`. Code that divides by `apy1d` gets `Infinity`. | `AnalyticsSchema` types all three as `number | null`. `getBestApy()` fallback chain skips nulls. `riskScore()` handles missing historical data with a moderate default. | `packages/sdk/test/pitfalls/pitfall-18-apy1d-null.test.ts` |

## Coverage

All 18 pitfall tests live under `packages/sdk/test/pitfalls/`. Run them with:

```
pnpm turbo test --filter=@earnforge/sdk
```

Each test constructs a minimal fixture that triggers the pitfall and
asserts the SDK handles it without error.
