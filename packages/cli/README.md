# @earnforge/cli

Terminal interface for the [LI.FI Earn API](https://docs.li.fi/earn/overview) —
vault discovery, risk scoring, deposit quoting, and diagnostics.

```bash
npm i -g @earnforge/cli
export LIFI_API_KEY=...   # required; create one at https://portal.li.fi
earnforge list --chain 8453
```

Complements [`@lifi/cli`](https://www.npmjs.com/package/@lifi/cli), which covers
swaps and bridges but has no Earn commands. Both read the same `LIFI_API_KEY`.

## Commands

```
earnforge list             # list vaults with filters
earnforge top              # top vaults by APY for an asset
earnforge vault <slug>     # detailed vault info
earnforge compare          # side-by-side vault comparison
earnforge portfolio <addr> # portfolio positions
earnforge quote            # build a deposit quote
earnforge withdraw         # build a withdrawal quote
earnforge allowance        # check ERC-20 allowance
earnforge approve          # build an approval transaction
earnforge risk <slug>      # risk score breakdown with flags
earnforge suggest          # portfolio allocation
earnforge watch            # live APY/TVL monitoring
earnforge apy-history      # 30-day DeFiLlama APY chart
earnforge preflight        # pre-deposit validation
earnforge simulate         # eth_call dry-run
earnforge doctor           # API pitfall diagnostics
earnforge chains           # chains with indexed vaults
earnforge protocols        # protocols with indexed vaults
earnforge init <name>      # scaffold a new project
```

Every command supports `--json` for machine-readable output.

## Flagged vaults are surfaced everywhere

LI.FI flags roughly 9% of vaults through an undocumented `verificationStatus`
field — usually for `zero_apy`, occasionally `apy_outlier`. `earnforge vault`
and `earnforge compare` show a verification badge, and `earnforge risk` lists the
reasons:

```
$ earnforge risk aave:1:_:0x9277...
4.5/10 (high)

  flagged by LI.FI verification: zero_apy
  reward APY not reported by the protocol
```

A flagged vault can never score ≥ 8, so it can never read as low risk. This
matters most for `--strategy max-apy`, where a vault flagged for `apy_outlier`
would otherwise sort straight to the top.

## Notes

- APY values are percentages (`4.63` means 4.63%). LI.FI's own quickstart
  multiplies by 100, which overstates every figure 100×.
- `--min-tvl` maps to the API's `minTvlUsd`. Sending the wrong param name
  returns the entire fleet unfiltered, with no error.

## License

Apache-2.0
