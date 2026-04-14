// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest'
import { VaultListResponseSchema } from '../../src/schemas/index.js'
import vaultsBase from '../../../fixtures/src/vaults-base.json'

describe('Pitfall #6: Ignoring pagination', () => {
  it('vault list response has nextCursor for pagination', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    expect(result.nextCursor).toBeTruthy()
    expect(result.total).toBeGreaterThan(result.data.length)
  })

  it('page size is 50', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    expect(result.data.length).toBe(50)
  })

  it('total is greater than page size (90 Base vaults)', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    expect(result.total).toBe(90)
  })

  // EarnDataClient.listAllVaults() provides async iterator that handles pagination
  // See live integration tests for full pagination coverage
})
