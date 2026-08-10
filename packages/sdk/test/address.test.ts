// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { encodeAddressArg } from '../src/address.js'
import { buildApprovalTx } from '../src/allowance.js'

const TOKEN = '0x1111111111111111111111111111111111111111'
const SPENDER = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

/** The 20-byte address the EVM decodes from the first ABI word of calldata. */
function spenderFromCalldata(data: string): string {
  return `0x${data.slice(34, 74)}`
}

describe('address encoding', () => {
  /**
   * The original encoder was `value.slice(2).toLowerCase().padStart(64, '0')`
   * with no validation. `padStart` left-pads, so malformed input produced a
   * full-width word that decoded as a *different, valid* address rather than
   * failing — an address without `0x` lost two characters and became
   * `0x00aaaa…`, and `0xAAAA` became `0x0000…aaaa`. Calldata was 138 characters
   * either way, so nothing downstream could tell.
   *
   * On `approve` that is an allowance granted to an address the caller never
   * named, which is why these throw instead of coercing.
   */
  it.each([
    ['missing 0x prefix', SPENDER.slice(2)],
    ['too short', '0xAAAA'],
    ['too long', `0x${'A'.repeat(44)}`],
    ['non-hex characters', `0x${'Z'.repeat(40)}`],
    ['empty', ''],
  ])('rejects a spender that is %s', (_label, bad) => {
    expect(() => buildApprovalTx(TOKEN, bad, 1n, 8453)).toThrow(
      /Invalid spender address/
    )
  })

  it('rejects a malformed token address', () => {
    expect(() => buildApprovalTx('0xbad', SPENDER, 1n, 8453)).toThrow(
      /Invalid token address/
    )
  })

  it('encodes a valid spender to the address the EVM will decode', () => {
    const { data } = buildApprovalTx(TOKEN, SPENDER, 1n, 8453)
    expect(spenderFromCalldata(data)).toBe(SPENDER.toLowerCase())
    // selector (10) + address word (64) + amount word (64)
    expect(data).toHaveLength(138)
  })

  it('keeps the amount word intact — a shifted address would corrupt it', () => {
    const { data } = buildApprovalTx(TOKEN, SPENDER, 123456n, 8453)
    expect(BigInt(`0x${data.slice(74)}`)).toBe(123456n)
  })

  it('lowercases without altering the value', () => {
    expect(encodeAddressArg(SPENDER, 'spender')).toBe(
      SPENDER.slice(2).toLowerCase().padStart(64, '0')
    )
  })
})
