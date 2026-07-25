// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod'

/**
 * Protocol schema — from GET /v1/protocols.
 *
 * `id` is the value to pass to `?protocol=` when filtering vaults. Slugs are
 * UNVERSIONED as of Apr 2026: `morpho`, `aave`, `euler` — not `morpho-v1`,
 * `aave-v3`, `euler-v2`. A versioned slug returns an empty result set with a
 * 200, so never hardcode one; resolve against this endpoint instead.
 */
export const ProtocolDetailSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  url: z.string(),
})

export type ProtocolDetail = z.infer<typeof ProtocolDetailSchema>

export const ProtocolListResponseSchema = z.array(ProtocolDetailSchema)

/** Filter key for a protocol — prefers `id`, falls back to `name`. */
export function protocolFilterKey(protocol: ProtocolDetail): string {
  return protocol.id ?? protocol.name
}
