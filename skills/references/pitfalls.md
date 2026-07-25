# LI.FI Earn API Pitfalls

All 18 known pitfalls discovered during integration. The SDK handles each one by default.

| # | Pitfall | Impact | Fix |
|---|---------|--------|-----|
| 1 | Earn Data API has no auth, Composer API requires API key | 401 on quote requests | Set `x-lifi-api-key` header only on Composer calls |
| 2 | Earn Data base URL is `earn.li.fi`, not `li.quest` | 404 on vault/chain/protocol endpoints | Use `https://earn.li.fi` for data, `https://li.quest` for Composer |
| 3 | API key goes in `x-lifi-api-key` header, not query param | 401 even with valid key | Pass key via header, never as URL parameter |
| 4 | Composer quote endpoint is GET, not POST | 405 Method Not Allowed | Use `GET /v1/quote` with query parameters |
| 5 | `toToken` must be vault address, not underlying token | Quote returns wrong asset or fails | Set `toToken = vault.address` for deposits |
| 6 | Pagination uses cursor-based, not offset-based | Missing vaults after page 1 | Pass `nextCursor` to fetch subsequent pages |
| 7 | `apy.total` can be 0 when only `apy30d` has data | Show 0% APY for active vaults | Use fallback chain: `apy.total` -> `apy30d` -> `apy7d` -> `apy1d` |
| 8 | `tvl.usd` is a string, not a number | Numeric comparisons fail silently | Parse with `Number()` or `parseTvl()` before comparing |
| 9 | Token amounts need correct decimals (USDC=6, ETH=18) | Deposit 1 USDC sends 0.000001 USDC | Read `underlyingTokens[0].decimals`, use `toSmallestUnit()` |
| 10 | Vault list returns all chains mixed together | Cannot filter by chain in client | Pass `chainId` query parameter to filter server-side |
| 11 | No gas token on destination chain | Transaction reverts | Check native balance before quoting; use LI.Fuel `fromAmountForGas` |
| 12 | Wallet on wrong chain | Transaction sent to wrong network | Compare `wallet.chainId` with `vault.chainId` before deposit |
| 13 | Non-transactional vaults exist | Cannot deposit programmatically | Check `vault.isTransactional === true` before any quote |
| 14 | Some vaults have zero APY temporarily | Misleading display | Filter or flag vaults with `apy.total === 0` and no historical data |
| 15 | `underlyingTokens` can be an empty array | Cannot determine `fromToken` | Check array length; require explicit `fromToken` if empty |
| 16 | `description` field is optional (~14% of vaults) | `undefined` in display strings | Use optional chaining or fallback to vault name |
| 17 | `apy.reward` is null for some protocols | NaN when summing base + reward | Normalize null to 0 (SDK Zod schema does this automatically) |
| 18 | `apy1d`, `apy7d`, `apy30d` can all be null | Crash on `.toFixed()` or division | Null-check before arithmetic; use `getBestApy()` helper |
