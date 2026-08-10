// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { defaultRpcUrl } from '../src/balances.js'

/**
 * The CLI shipped `https://rpc.li.fi/v1/chain/{id}` as its default RPC. That
 * host has no DNS record, so `earnforge allowance` failed with a bare "fetch
 * failed" for anyone who did not pass `--rpc`. Nothing tested it because
 * nothing asserted the URL was reachable — only that one was produced.
 *
 * These assert the shape of the map rather than reachability: a unit test that
 * makes sixteen network calls is a flake generator. Reachability was verified
 * once by calling `eth_chainId` on every entry and confirming the reply matched
 * its key; `pnpm verify:live` is where live checks belong.
 */
describe('defaultRpcUrl', () => {
  it('returns an https URL for the chains Earn indexes', () => {
    // A representative spread rather than all sixteen: the fleet's chain list
    // moves (Unichain and Scroll were de-indexed in Aug 2026), so pinning every
    // id here would make this fail for a reason that is not a defect.
    for (const chainId of [1, 8453, 42161, 137, 10]) {
      const url = defaultRpcUrl(chainId)
      expect(url, `no default RPC for chain ${chainId}`).toBeDefined()
      expect(url).toMatch(/^https:\/\//)
    }
  })

  it('never returns the host that does not resolve', () => {
    for (const chainId of [1, 10, 56, 100, 137, 8453, 42161, 43114, 59144]) {
      expect(defaultRpcUrl(chainId)).not.toContain('rpc.li.fi')
    }
  })

  it('returns undefined for a chain with no known public RPC', () => {
    // Robinhood Chain (4663) is in the Earn index but had no public endpoint
    // that answered. `undefined` lets a caller say "pass --rpc" rather than
    // emitting a guessed URL that fails as a DNS error.
    expect(defaultRpcUrl(4663)).toBeUndefined()
    expect(defaultRpcUrl(999999)).toBeUndefined()
  })
})
