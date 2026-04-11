# Supported Chains

16 chains currently supported by the LI.FI Earn API.

| Chain | chainId | Network CAIP | Notes |
|-------|---------|-------------|-------|
| Ethereum | 1 | eip155:1 | Largest DeFi ecosystem; highest gas costs |
| Optimism | 10 | eip155:10 | OP Stack L2; low gas |
| BSC | 56 | eip155:56 | Binance Smart Chain |
| Gnosis | 100 | eip155:100 | Formerly xDai; stable gas |
| Unichain | 130 | eip155:130 | Uniswap's app-chain |
| Polygon | 137 | eip155:137 | PoS chain; low gas |
| Monad | 143 | eip155:143 | High-performance EVM chain |
| Sonic | 146 | eip155:146 | Formerly Fantom rebranded |
| Mantle | 5000 | eip155:5000 | L2 with MNT gas token |
| Base | 8453 | eip155:8453 | Coinbase L2; fastest growing |
| Arbitrum | 42161 | eip155:42161 | Largest L2 by TVL |
| Celo | 42220 | eip155:42220 | Mobile-first chain |
| Avalanche | 43114 | eip155:43114 | Subnet architecture |
| Linea | 59144 | eip155:59144 | Consensys zkEVM L2 |
| Berachain | 80094 | eip155:80094 | Proof of Liquidity chain |
| Katana | 747474 | eip155:747474 | Ronin's DeFi chain |

## Usage Notes

- Always use `chainId` (number) in API calls, never the chain name string.
- Chain name matching in CLI/bot is case-insensitive: `base`, `Base`, `BASE` all map to 8453.
- Cross-chain deposits are supported via the Composer API (LI.FI routing).
- Gas costs vary significantly: Ethereum (~$5-50) vs L2s (~$0.01-0.10).
