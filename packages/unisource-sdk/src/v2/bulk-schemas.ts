import { z } from 'zod'
import { V2_ERROR_CODES } from './error-codes'

const v2ErrorCodeSchema = z.enum(V2_ERROR_CODES)

export const v2BulkFailureSchema = z.object({
  id: z.string().min(1),
  code: v2ErrorCodeSchema,
  message: z.string(),
})
export type V2BulkFailure = z.infer<typeof v2BulkFailureSchema>

export const v2BulkResponseSchema = z.object({
  processed: z.array(z.string().min(1)),
  failed: z.array(v2BulkFailureSchema),
})
export type V2BulkResponse = z.infer<typeof v2BulkResponseSchema>
