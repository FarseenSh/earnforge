# @earnforge/react

React hooks for the [LI.FI Earn API](https://docs.li.fi/earn/overview), built on
TanStack Query.

```bash
npm i @earnforge/react @earnforge/sdk @tanstack/react-query wagmi viem
```

## Setup

The Earn Data API requires an API key and **must not be called from the
browser** — doing so exposes the credential in the network tab. Proxy Earn
requests through your own server route and point the SDK at it:

```tsx
import { EarnForgeProvider } from '@earnforge/react'

// Server-side: real key. Browser: point baseUrl at your own proxy route.
<EarnForgeProvider
  options={{
    apiKey: 'proxied',
    earnData: { apiKey: 'proxied', baseUrl: '/api/earn' },
  }}
>
  <App />
</EarnForgeProvider>
```

## Hooks

| Hook | Purpose |
|---|---|
| `useVaults` | Paginated vault list; resets on param change |
| `useVault` | Single vault by slug |
| `useEarnTopYield` | Top vaults by APY |
| `usePortfolio` | Wallet positions |
| `useRiskScore` | 0–10 composite score with flags |
| `useStrategy` | Strategy preset filtering |
| `useSuggest` | Risk-adjusted allocation |
| `useApyHistory` | 30-day DeFiLlama history |
| `useEarnDeposit` | Deposit state machine with allowance phase |
| `useEarnRedeem` | Withdrawal state machine |

## Peer dependencies

Requires `wagmi` 3+ and `react` 19+, matching the LI.FI ecosystem — Widget v4
and SDK v4 are wagmi 3 / React 19 only.

## License

Apache-2.0
