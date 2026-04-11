# Worked Examples

8 end-to-end examples demonstrating common EarnForge workflows.

## 1. List Vaults by Asset

Find all USDC vaults sorted by APY:

```bash
earnforge top --asset USDC --limit 5
```

```json
[
  {
    "name": "STEAKUSDC",
    "slug": "8453-0xbeef...",
    "chain": "Base",
    "apy": 3.85,
    "tvl": "$33.8M",
    "protocol": "morpho-v1",
    "risk": { "score": 7.8, "label": "low" }
  }
]
```

## 2. Compare Two Vaults

Side-by-side comparison of Morpho vs Aave USDC vaults:

```bash
earnforge compare 8453-0xbeef... 1-0xaave... --json
```

Output includes APY difference, TVL ratio, risk score delta, and protocol tier comparison.

## 3. Build a Deposit Quote

Quote depositing 1000 USDC into a Base vault:

```bash
earnforge quote 8453-0xbeef... 1000 0xYourWallet --json
```

The SDK automatically:
- Sets `toToken = vault.address` (Pitfall #5)
- Uses 6 decimals for USDC (Pitfall #9)
- Validates `isTransactional` (Pitfall #13)
- Checks `underlyingTokens` is non-empty (Pitfall #15)

Returns an unsigned transaction for the user to sign.

## 4. Portfolio Allocation

Get a diversified allocation for $50,000 in USDC:

```bash
earnforge suggest 50000 USDC --max-vaults 5 --max-chains 3 --strategy diversified --json
```

```json
{
  "totalAmount": 50000,
  "expectedApy": 4.52,
  "allocations": [
    { "vault": "STEAKUSDC", "amount": 20000, "percentage": 40.0, "apy": 3.85 },
    { "vault": "Aave USDC", "amount": 15000, "percentage": 30.0, "apy": 5.20 },
    { "vault": "Euler USDC", "amount": 10000, "percentage": 20.0, "apy": 4.10 },
    { "vault": "Pendle USDC", "amount": 5000, "percentage": 10.0, "apy": 6.50 }
  ]
}
```

## 5. Withdraw from a Vault

Build a redeem quote to exit a position:

```bash
earnforge withdraw 8453-0xbeef... 500 0xYourWallet --json
```

Checks `isRedeemable` and `redeemPacks` before building the quote. Warns if the vault is non-redeemable.

## 6. Cross-Chain Deposit

Deposit from Ethereum into a Base vault using LI.FI routing:

```bash
earnforge quote 8453-0xbeef... 1000 0xYourWallet --from-chain 1 --json
```

The Composer API handles the bridge + swap + deposit in a single quote. Use `gas-optimize` to compare costs across source chains:

```bash
earnforge gas-optimize 8453-0xbeef... 1000 0xYourWallet --from-chains 1,10,8453 --json
```

## 7. Risk Analysis

Get a full risk breakdown for a vault:

```bash
earnforge risk 8453-0xbeef... --json
```

```json
{
  "score": 7.8,
  "label": "low",
  "breakdown": {
    "tvl": 8,
    "apyStability": 8,
    "protocol": 9,
    "redeemability": 10,
    "assetType": 9
  }
}
```

Dimensions:
- **TVL Magnitude** (25% weight): Higher TVL = lower risk. $100M+ = 10/10.
- **APY Stability** (20% weight): Small divergence between apy1d/apy30d/total = more stable.
- **Protocol Maturity** (25% weight): Known blue-chip protocols score higher.
- **Redeemability** (15% weight): Non-redeemable = liquidity risk (3/10).
- **Asset Type** (15% weight): Stablecoin tag = lower asset risk (9/10).

## 8. Portfolio Suggestion with Strategy

Use the conservative strategy for a safe allocation:

```bash
earnforge suggest 100000 USDC --strategy conservative --json
```

The conservative strategy applies these filters:
- Only stablecoin-tagged vaults
- TVL > $50M
- Blue-chip protocols only (aave-v3, morpho-v1, euler-v2, pendle, maple)

Other strategies: `max-apy` (no filters, pure APY sort), `diversified` (3+ chains, $1M+ TVL), `risk-adjusted` (risk score >= 7).
