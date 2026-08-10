// SPDX-License-Identifier: Apache-2.0

import { EarnForgeError } from './errors.js'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/** Throw unless `value` is a 0x-prefixed 20-byte hex address. */
export function assertAddress(value: string, label: string): void {
  if (!ADDRESS_RE.test(value)) {
    throw new EarnForgeError(
      `Invalid ${label} address: "${value}". Must be 0x-prefixed and 40 hex characters.`,
      'INVALID_ADDRESS'
    )
  }
}

/**
 * Encode an address as a 32-byte ABI word.
 *
 * Validates first because `padStart` left-pads rather than rejecting: an
 * address missing its `0x` encoded to `0x00aaaa…`, and `0xAAAA` to
 * `0x0000…aaaa` — a different, valid address, in calldata of the correct
 * length. On `approve` that is an allowance to an address nobody named.
 */
export function encodeAddressArg(value: string, label: string): string {
  assertAddress(value, label)
  return value.slice(2).toLowerCase().padStart(64, '0')
}
