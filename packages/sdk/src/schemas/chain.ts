// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

/** Chain schema — from GET /v1/earn/chains */
export const ChainSchema = z.object({
  chainId: z.number(),
  name: z.string(),
  networkCaip: z.string(),
});

export type Chain = z.infer<typeof ChainSchema>;

export const ChainListResponseSchema = z.array(ChainSchema);
