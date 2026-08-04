// SPDX-License-Identifier: Apache-2.0

/**
 * Stub for optional wallet-connector peer dependencies.
 *
 * `@wagmi/connectors` and RainbowKit import a connector per wallet family at
 * module scope, so the whole set gets pulled into the graph even though the
 * Studio only ever offers injected wallets. Several of those packages reach
 * for Node built-ins or Solana tooling that has no business in a browser
 * bundle — `@base-org/account` pulls `@coinbase/cdp-sdk`, which pulls `bs58`
 * and `node:crypto`.
 *
 * Under webpack this was an `IgnorePlugin`. Turbopack has no equivalent
 * "resolve to nothing" primitive, so the modules are aliased here instead.
 * Nothing ever calls into them: the alias only has to resolve, not work.
 */
export default {}
