---
name: earnforge
description: >
  Discovers, compares, risk-scores, and builds unsigned deposit and withdrawal
  quotes for 623+ DeFi yield vaults across 16 chains via the LI.FI Earn API.
  Includes ERC-20 allowance checking, risk scoring (0-10), yield strategy
  presets, portfolio allocation, and all 18 known API pitfalls handled.
---

# EarnForge Agent Skill

## Commands

All commands accept `--json` for machine-readable output.

### Vault Discovery

- `earnforge list [--asset USDC] [--chain 8453] [--min-tvl 1000000] [--strategy conservative] [--json]`
  List vaults with optional filters. Supports pagination.

- `earnforge top --asset USDC [--chain 8453] [--limit 10] [--strategy max-apy] [--json]`
  Top vaults sorted by APY descending.

- `earnforge vault <slug> [--json]`
  Fetch a single vault by its slug.

### Comparison & Analysis

- `earnforge risk <slug> [--json]`
  Full risk score breakdown (0-10 scale): TVL magnitude, APY stability,
  protocol maturity, redeemability, asset type.

- `earnforge apy-history <slug> [--json]`
  30-day APY history from DeFiLlama yields API.

### Portfolio & Suggestions

- `earnforge suggest --amount 10000 --asset USDC [--max-chains 3] [--strategy diversified] [--json]`
  Risk-adjusted portfolio allocation. Returns vault list with amounts and percentages.

- `earnforge portfolio <wallet> [--json]`
  Current positions for a wallet address.

### Deposit & Withdraw

- `earnforge quote --vault <slug> --amount 100 --wallet 0x... [--from-chain 1] [--optimize-gas] [--json]`
  Build an unsigned deposit quote. Validates all pitfalls before quoting.
  **Check allowance before executing** — the response includes `approvalAddress`.

- `earnforge withdraw --vault <slug> --amount 100 --wallet 0x... [--to-token 0x...] [--json]`
  Build an unsigned redeem/withdraw quote. Checks `isRedeemable` first.

- `earnforge allowance --token 0x... --owner 0x... --spender 0x... --amount 1000000 --rpc-url <url> --chain-id 8453 [--json]`
  Check ERC-20 token allowance. Returns whether approval is sufficient and
  builds an unsigned approval tx if not. Use `approvalAddress` from the
  deposit quote as the `--spender`.

- `earnforge approve --token 0x... --spender 0x... --amount 1000000 --chain-id 8453 [--json]`
  Build an unsigned ERC-20 approval transaction.

### Safety & Monitoring

- `earnforge preflight --vault <slug> --wallet 0x... [--amount 100] [--cross-chain] [--json]`
  Run all preflight checks: isTransactional, chain match, gas balance,
  token balance, redeemability.

- `earnforge doctor --vault <slug> [--env] [--json]`
  Run all 18 pitfall checks on a vault.

- `earnforge watch --vault <slug> [--apy-drop 20] [--tvl-drop 30] [--json]`
  Monitor a vault for APY/TVL drops. Streams events.

- `earnforge simulate --vault <slug> --amount 100 --wallet 0x... [--json]`
  Dry-run a deposit via eth_call. Runs preflight first.

### Reference Data

- `earnforge chains [--json]` — 16 supported chains with chainIds
- `earnforge protocols [--json]` — 11 protocols with URLs
- `earnforge init <name>` — Scaffold a new project with EarnForge wired up

## Rules

1. **Never submit transactions.** Only build unsigned quotes. The user signs.

2. **Check ERC-20 allowance before depositing.** Use `earnforge allowance`
   with the quote's `approvalAddress` as spender. If insufficient, have the
   user sign the approval tx from `earnforge approve` first, then the deposit.

3. **Always check `isTransactional` before quoting deposits.** Use `doctor`
   or `preflight` to verify.

4. **Check `isRedeemable` before quoting withdrawals.** Non-redeemable vaults
   have locked liquidity.

5. **Use `vault.address` as `toToken` for deposits, not the underlying.**
   This is Pitfall #5. The SDK handles it automatically.

6. **Filter stablecoins by the `stablecoin` tag, not by token symbol.**

7. **Risk score thresholds:** >= 7 is low risk, 4-6.9 is medium, < 4 is
   high risk. Always show score alongside APY.

8. **APY values are already percentages** (3.84 = 3.84%). Do NOT multiply
   by 100. `apy1d/apy7d/apy30d` can be null — use the fallback chain.

9. **Cross-chain deposits require explicit `--from-token`.** The vault's
   underlying token address is on the vault's chain, not the source chain.

10. **Use chainId (number), not chain name, in all API paths.**

## References

- [references/pitfalls.md](references/pitfalls.md) — All 18 API pitfalls
- [references/protocols.md](references/protocols.md) — 11 protocols with risk tiers
- [references/chains.md](references/chains.md) — 16 chains with chainIds
- [references/examples.md](references/examples.md) — Worked examples
- [references/strategies.md](references/strategies.md) — 4 yield strategy presets
