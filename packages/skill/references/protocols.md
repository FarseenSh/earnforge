# Supported Protocols

11 protocols currently available through the LI.FI Earn API, with risk tier assignments used by the SDK's risk scorer.

| Protocol | Risk Tier | Score | URL | Notes |
|----------|-----------|-------|-----|-------|
| aave-v3 | Blue-chip | 9/10 | https://app.aave.com | Largest DeFi lending protocol; battle-tested |
| morpho-v1 | Blue-chip | 9/10 | https://app.morpho.org | Optimized lending layer on top of Aave/Compound |
| euler-v2 | Established | 7/10 | https://app.euler.finance | Modular lending with custom vault support |
| pendle | Established | 7/10 | https://app.pendle.finance | Yield tokenization and trading |
| ethena-usde | Established | 7/10 | https://www.ethena.fi | Synthetic dollar protocol backed by staked ETH |
| ether.fi-liquid | Established | 7/10 | https://app.ether.fi/liquid | Liquid restaking vaults |
| ether.fi-stake | Established | 7/10 | https://ether.fi/app/weeth | Native ETH staking (weETH) |
| maple | Moderate | 6/10 | https://app.maple.finance | Institutional lending with credit risk |
| upshift | Emerging | 5/10 | https://app.upshift.finance | Newer yield aggregator |
| neverland | Emerging | 4/10 | https://app.neverland.money | Emerging lending market |
| yo-protocol | Emerging | 4/10 | https://app.yo.xyz | Newer yield protocol |

## Risk Tier Definitions

- **Blue-chip (9-10):** Multi-year track record, $1B+ TVL historically, multiple audits, battle-tested through market cycles.
- **Established (7-8):** At least 1 year live, audited, significant TVL, active development.
- **Moderate (5-6):** Audited but newer, or has had security incidents that were resolved.
- **Emerging (3-4):** Less than 1 year live, limited audit history, lower TVL. Higher risk/reward.

Protocols not in the list default to a score of 3/10 (unrated).
