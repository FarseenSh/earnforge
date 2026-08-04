// SPDX-License-Identifier: Apache-2.0
import type { NextConfig } from 'next'

/**
 * Optional wallet-connector peers that `@wagmi/connectors` and RainbowKit
 * import unconditionally. The Studio only offers injected wallets, so none of
 * these are reachable at runtime — but they still have to resolve at build
 * time, and several drag Node built-ins into the client bundle.
 */
const OPTIONAL_CONNECTOR_PEERS = [
  '@walletconnect/ethereum-provider',
  '@coinbase/wallet-sdk',
  '@metamask/connect-evm',
  '@base-org/account',
  '@safe-global/safe-apps-sdk',
  '@safe-global/safe-apps-provider',
  'porto',
  'porto/internal',
  'bs58',
]

const STUB = './src/lib/empty-connector-stub.ts'

const nextConfig: NextConfig = {
  transpilePackages: ['@earnforge/sdk'],

  // Next 16 runs Turbopack by default. Turbopack has no `IgnorePlugin`, so the
  // optional peers are aliased to a stub instead of excluded. Both bundlers are
  // configured so `next build --webpack` remains a working escape hatch.
  turbopack: {
    resolveAlias: Object.fromEntries(
      OPTIONAL_CONNECTOR_PEERS.map((name) => [name, STUB])
    ),
  },

  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: new RegExp(
          `^(${OPTIONAL_CONNECTOR_PEERS.map((n) =>
            n.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')
          ).join('|')})$`
        ),
      })
    )
    return config
  },
}

export default nextConfig
