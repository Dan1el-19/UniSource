import { z } from 'zod';

export const uploadDestinationSchema = z.enum(['r2', 'appwrite']);
export type UploadDestination = z.infer<typeof uploadDestinationSchema>;
