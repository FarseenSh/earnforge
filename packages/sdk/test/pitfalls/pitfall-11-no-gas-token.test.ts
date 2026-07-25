// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultSingle from '../../../fixtures/src/vault-single.json'
import { preflight } from '../../src/preflight.js'
import { VaultSchema } from '../../src/schemas/index.js'

describe('Pitfall #11: No gas token', () => {
  const vault = VaultSchema.parse(vaultSingle)

  it('preflight fails when native balance is 0', () => {
    const report = preflight(vault, '0x1', {
      walletChainId: 8453,
      nativeBalance: 0n,
    })
    expect(report.issues.some((i) => i.code === 'NO_GAS')).toBe(true)
  })

  it('preflight passes when native balance is positive', () => {
    const report = preflight(vault, '0x1', {
      walletChainId: 8453,
      nativeBalance: 1000000000000000n,
    })
    expect(report.issues.some((i) => i.code === 'NO_GAS')).toBe(false)
  })
})
