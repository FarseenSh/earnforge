// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

/** Position asset */
export const PositionAssetSchema = z.object({
  address: z.string(),
  name: z.string(),
  symbol: z.string(),
  decimals: z.number(),
});

/** Single portfolio position */
export const PositionSchema = z.object({
  chainId: z.number(),
  protocolName: z.string(),
  asset: PositionAssetSchema,
  balanceUsd: z.string(),
  balanceNative: z.string(),
});

export type Position = z.infer<typeof PositionSchema>;

/** Portfolio response */
export const PortfolioResponseSchema = z.object({
  positions: z.array(PositionSchema),
});

export type PortfolioResponse = z.infer<typeof PortfolioResponseSchema>;
