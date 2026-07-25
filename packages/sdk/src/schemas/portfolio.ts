// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod'

/** Position asset */
export const PositionAssetSchema = z.object({
  address: z.string(),
  name: z.string(),
  symbol: z.string(),
  decimals: z.number(),
})

/**
 * Single portfolio position.
 *
 * `address` (the vault contract) was added in Apr 2026. In the same release
 * `protocolName` and `balanceUsd` became nullable — they are populated in
 * practice, but the API contract now permits null, so anything formatting them
 * must handle it rather than producing `NaN`.
 */
export const PositionSchema = z.object({
  chainId: z.number(),
  address: z.string().optional(),
  protocolName: z.string().nullable(),
  asset: PositionAssetSchema,
  balanceUsd: z.string().nullable(),
  balanceNative: z.string().nullable(),
})

export type Position = z.infer<typeof PositionSchema>

/** USD balance as a number, or null when the API did not report one. */
export function positionBalanceUsd(position: Position): number | null {
  if (position.balanceUsd === null) {
    return null
  }
  const n = Number(position.balanceUsd)
  return Number.isNaN(n) ? null : n
}

/** Total portfolio value in USD, skipping positions with no reported balance. */
export function totalPortfolioUsd(positions: Position[]): number {
  return positions.reduce((sum, p) => sum + (positionBalanceUsd(p) ?? 0), 0)
}

/** Portfolio response */
export const PortfolioResponseSchema = z.object({
  positions: z.array(PositionSchema),
})

export type PortfolioResponse = z.infer<typeof PortfolioResponseSchema>
