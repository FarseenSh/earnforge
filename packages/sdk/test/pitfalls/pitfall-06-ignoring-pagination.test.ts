// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import vaultsBase from '../../../fixtures/src/vaults-base.json'
import vaultsBaseLastPage from '../../../fixtures/src/vaults-base-lastpage.json'
import { VaultListResponseSchema } from '../../src/schemas/index.js'

/**
 * Pitfall #6 — reading only the first page.
 *
 * The default page size is 50 and the maximum is 100. `total` reports the full
 * result-set size, so a caller who ignores `nextCursor` silently analyses a
 * fraction of the fleet.
 *
 * The subtle part: on the final page `nextCursor` is ABSENT from the JSON — not
 * null, not an empty string. A schema declaring it merely nullable rejects the
 * last page, and a loop testing `cursor !== null` never terminates.
 */
describe('Pitfall #6: Ignoring pagination', () => {
  it('a full page carries a nextCursor and total exceeds the page', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    expect(result.nextCursor).toBeTruthy()
    expect(result.total).toBeGreaterThan(result.data.length)
  })

  it('honours the requested page size', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    expect(result.data.length).toBe(50)
  })

  it('omits nextCursor entirely on the final page', () => {
    // Absent, not null — this is what breaks a nullable-only schema.
    expect('nextCursor' in vaultsBaseLastPage).toBe(false)

    const result = VaultListResponseSchema.parse(vaultsBaseLastPage)
    expect(result.nextCursor).toBeUndefined()
  })

  it('treats the final page as terminal via ?? undefined', () => {
    const result = VaultListResponseSchema.parse(vaultsBaseLastPage)
    // The idiom listAllVaults() relies on: both null and undefined must end
    // the walk, so the loop condition normalises to undefined.
    const cursor = result.nextCursor ?? undefined
    expect(cursor).toBeUndefined()
  })

  it('pages sum to total', () => {
    const first = VaultListResponseSchema.parse(vaultsBase)
    const last = VaultListResponseSchema.parse(vaultsBaseLastPage)
    expect(first.data.length + last.data.length).toBe(first.total)
  })

  it('cursor is a vault slug, not an opaque token or offset', () => {
    const result = VaultListResponseSchema.parse(vaultsBase)
    // Format is protocol:chainId:_:address — useful when debugging, and a
    // reminder that cursors are not stable across data refreshes.
    expect(result.nextCursor).toMatch(/^[a-z0-9-]+:\d+:.*0x[0-9a-fA-F]{40}$/)
  })
})
