---
name: earnforge
description: >
  Discovers, compares, risk-scores, and builds unsigned deposit quotes for
  623+ DeFi yield vaults across 16 chains via the LI.FI Earn API.
  Handles all 18 known API pitfalls by default.
---

# EarnForge Agent Skill

## Commands

All commands accept `--json` for machine-readable output.

### Vault Discovery

- `earnforge list [--asset USDC] [--chain base] [--min-tvl 1000000] [--strategy conservative] [--json]`
  List vaults with optional filters. Supports pagination.

- `earnforge top [--asset USDC] [--chain ethereum] [--limit 10] [--strategy max-apy] [--json]`
  Top vaults sorted by APY descending.

- `earnforge get <slug> [--json]`
  Fetch a single vault by its slug.

### Comparison & Analysis

- `earnforge compare <slug1> <slug2> [--json]`
  Side-by-side comparison of two vaults: APY, TVL, risk score, protocol.

- `earnforge risk <slug> [--json]`
  Full risk score breakdown (0-10 scale): TVL magnitude, APY stability,
  protocol maturity, redeemability, asset type.

- `earnforge history <vault-address> <chain-id> [--json]`
  30-day APY history from DeFiLlama yields API.

### Portfolio & Suggestions

- `earnforge suggest <amount> <asset> [--max-vaults 5] [--max-chains 3] [--strategy diversified] [--json]`
  Risk-adjusted portfolio allocation. Returns vault list with amounts and percentages.

- `earnforge portfolio <wallet> [--json]`
  Current positions for a wallet address.

### Deposit & Withdraw

- `earnforge quote <slug> <amount> <wallet> [--from-chain 1] [--slippage 0.5] [--json]`
  Build an unsigned deposit quote. Validates all pitfalls before quoting.

- `earnforge withdraw <slug> <amount> <wallet> [--json]`
  Build an unsigned redeem/withdraw quote.

- `earnforge gas-optimize <slug> <amount> <wallet> [--from-chains 1,10,8453] [--json]`
  Compare deposit costs from multiple source chains. Cheapest route first.

### Safety & Monitoring

- `earnforge doctor <slug> [--wallet 0x...] [--json]`
  Run all preflight pitfall checks on a vault.

- `earnforge watch <slug> [--apy-drop 20] [--tvl-drop 30] [--interval 60000] [--json]`
  Monitor a vault for APY/TVL drops. Streams events.

### Reference Data

- `earnforge chains [--json]`
  List all 16 supported chains with chainIds.

- `earnforge protocols [--json]`
  List all 11 protocols with URLs.

- `earnforge strategies [--json]`
  List the 4 strategy presets: conservative, max-apy, diversified, risk-adjusted.

## Rules

1. **Never submit transactions.** Only build unsigned quotes. The user signs and broadcasts.

2. **Always check `isTransactional` before quoting.** Non-transactional vaults cannot accept deposits. Use `doctor` to verify.

3. **Use `vault.address` as `toToken`, not the underlying token address.** This is Pitfall #5 and the most common integration mistake.

4. **Filter stablecoins by the `stablecoin` tag, not by token symbol.** Some USDC vaults lack the tag; some non-USDC vaults have it.

5. **Risk score thresholds:** >= 7 is low risk (safe), 4-6.9 is medium, < 4 is high risk. Always display the score with color indicator.

6. **TVL is a string in USD.** Parse with `parseTvl()` before comparing. Never compare raw strings numerically.

7. **APY fields (`apy1d`, `apy7d`, `apy30d`) can be null.** Use the fallback chain: `apy.total` -> `apy30d` -> `apy7d` -> `apy1d`.

8. **`apy.reward` is null for some protocols** (Morpho returns 0, Euler returns null). Normalize to 0 before summing.

9. **Use chainId (number), not chain name (string), in all API calls.** Map names to IDs using the chains reference.

## References

- [references/pitfalls.md](references/pitfalls.md) - All 18 API pitfalls with descriptions and fixes
- [references/protocols.md](references/protocols.md) - 11 protocols with risk tiers
- [references/chains.md](references/chains.md) - 16 chains with chainIds
- [references/examples.md](references/examples.md) - 8 worked examples
- [references/strategies.md](references/strategies.md) - 4 yield strategy presets
