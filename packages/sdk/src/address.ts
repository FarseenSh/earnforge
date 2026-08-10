// SPDX-License-Identifier: Apache-2.0

import { EarnForgeError } from './errors.js'

/**
 * Address validation and ABI word encoding.
 *
 * Five call sites encoded an address as
 * `value.slice(2).toLowerCase().padStart(64, '0')` with no validation, which is
 * wrong in a way that produces a plausible result instead of an error:
 *
 * - `padStart` left-pads, so a short or unprefixed value is padded to a full
 *   32-byte word and decodes as a *different, valid* address. Passing an
 *   address without its `0x` dropped two characters and shifted the whole
 *   value: `AAAA…AAAA` encoded to `0x00aaaa…aaaa`.
 * - Non-hex input produced calldata containing non-hex characters, rejected
 *   only later by the node with an opaque error.
 *
 * Every case still yielded 138-character calldata, so nothing downstream could
 * tell. For `approve` that means building an unlimited allowance to an address
 * the caller never named. An address is either well-formed or it is a bug, so
 * this throws rather than coercing.
 */
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
 * Encode an address as a 32-byte ABI word, validating it first.
 *
 * @param value - 0x-prefixed 20-byte address
 * @param label - Field name, used in the error message
 */
export function encodeAddressArg(value: string, label: string): string {
  assertAddress(value, label)
  return value.slice(2).toLowerCase().padStart(64, '0')
}
