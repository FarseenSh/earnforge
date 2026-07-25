# @earnforge/bot

Telegram bot for the [LI.FI Earn API](https://docs.li.fi/earn/overview) — yield
queries, risk checks, and portfolio suggestions, built on grammY.

```bash
npm i @earnforge/bot
export TELEGRAM_BOT_TOKEN=...
export LIFI_API_KEY=...      # create one at https://portal.li.fi
```

## Commands

```
/start
/yield <asset>                        # best APY for an asset
/top <chain>                          # top vaults on a chain
/risk <slug>                          # risk score with flags
/suggest <amount> <asset> [strategy]  # allocation
/doctor <slug> [wallet]               # diagnostics
/withdraw <slug> <amount>             # withdrawal quote
```

Risk replies include LI.FI's `verificationStatus`, so vaults flagged for
`zero_apy` or `apy_outlier` are called out rather than quietly recommended.

## License

Apache-2.0
