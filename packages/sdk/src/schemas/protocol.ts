// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod'

/** Protocol schema — from GET /v1/earn/protocols */
export const ProtocolDetailSchema = z.object({
  name: z.string(),
  url: z.string(),
})

export type ProtocolDetail = z.infer<typeof ProtocolDetailSchema>

export const ProtocolListResponseSchema = z.array(ProtocolDetailSchema)
