import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
	deleteUploadRecord,
	getUpload,
	listUploads,
	type UploadRecord,
} from '../db/files';
import {
	buildAppwriteFileDownloadUrl,
	createAppwriteFileToken,
	deleteAppwriteFile,
	extractAppwriteFileIdFromStorageKey,
} from '../services/appwrite';
import { deleteObject, generatePresignedGetUrl } from '../services/r2';
import {
	FILES_DEFAULT_LIMIT,
	FILES_MAX_LIMIT,
	type FileDeleteResponse,
	type FileDownloadUrlResponse,
	type UploadRecord as ApiUploadRecord,
	type UploadsListResponse,
	uploadDestinationSchema,
	uploadStatusSchema,
} from '@unisource/sdk';

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

function validationErrorHook(
	result: {
		success: boolean;
		error?: {
			issues: Array<{
				path: Array<PropertyKey>;
				message: string;
			}>;
		};
	},
	c: {
		json: (value: unknown, status?: number) => Response;
	}
) {
	if (result.success) {
		return;
	}

	const firstIssue = result.error?.issues[0];
	const issuePath = firstIssue?.path.length ? `${firstIssue.path.join('.')}: ` : '';
	return c.json(
		{
			error: 'Bad Request',
			message: `${issuePath}${firstIssue?.message ?? 'Request validation failed'}`,
		},
		400
	);
}

const fileIdParamSchema = z.object({
	id: z.string().trim().min(1),
});

const filesListQuerySchema = z
	.object({
		limit: z.string().optional(),
		cursor: z.string().optional(),
		destination: uploadDestinationSchema.optional(),
		status: uploadStatusSchema.optional(),
	})
	.transform((value) => {
		const limit = typeof value.limit === 'undefined' ? FILES_DEFAULT_LIMIT : Number(value.limit);
		const cursor = typeof value.cursor === 'string' ? value.cursor.trim() : undefined;

		return {
			limit,
			cursor,
			destination: value.destination,
			status: value.status,
		};
	})
	.superRefine((value, ctx) => {
		if (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > FILES_MAX_LIMIT) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['limit'],
				message: `limit must be an integer between 1 and ${FILES_MAX_LIMIT}`,
			});
		}

		if (typeof value.cursor === 'string' && value.cursor.length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['cursor'],
				message: 'cursor cannot be empty',
			});
		}
	});

/** Map internal DB record to the public API shape */
function toApiUpload(record: UploadRecord): ApiUploadRecord {
	return {
		id: record.id,
		service_id: record.service_id ?? '',
		user_id: record.user_id ?? null,
		filename: record.filename,
		size: record.size,
		mime_type: record.mime_type,
		destination: record.destination,
		status: record.status,
		expires_at: record.expires_at,
		created_at: record.created_at,
		updated_at: record.updated_at,
	};
}

const files = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

files.get('/', zValidator('query', filesListQuerySchema, validationErrorHook), async (c) => {
	const query = c.req.valid('query');
	const serviceId = c.get('serviceId');

	try {
		const result = await listUploads(c.env.usrc_d1, {
			limit: query.limit,
			cursor: query.cursor,
			destination: query.destination,
			status: query.status,
			service_id: serviceId,
		});

		return c.json<UploadsListResponse>({
			items: result.items.map(toApiUpload),
			next_cursor: result.next_cursor,
			limit: query.limit,
		});
	} catch (error) {
		if (error instanceof Error && error.message === 'Invalid cursor') {
			return c.json({ error: 'Bad Request', message: 'cursor is invalid' }, 400);
		}

		throw error;
	}
});

files.get('/:id', zValidator('param', fileIdParamSchema, validationErrorHook), async (c) => {
	const { id } = c.req.valid('param');
	const serviceId = c.get('serviceId');
	const record = await getUpload(c.env.usrc_d1, id);

	if (!record || record.service_id !== serviceId) {
		return c.json({ error: 'Not Found', message: 'File not found' }, 404);
	}

	return c.json({ upload: toApiUpload(record) });
});

files.get('/:id/download-url', zValidator('param', fileIdParamSchema, validationErrorHook), async (c) => {
	const { id } = c.req.valid('param');
	const serviceId = c.get('serviceId');
	const record = await getUpload(c.env.usrc_d1, id);

	if (!record || record.service_id !== serviceId) {
		return c.json({ error: 'Not Found', message: 'File not found' }, 404);
	}

	if (record.status !== 'completed') {
		return c.json({ error: 'Conflict', message: `File is not available for download in state: ${record.status}` }, 409);
	}

	if (record.destination === 'r2') {
		try {
			const { presigned_url, expires_at } = await generatePresignedGetUrl(
				c.env,
				record.bucket,
				record.storage_key,
				DOWNLOAD_URL_TTL_SECONDS
			);

			c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
			c.header('Pragma', 'no-cache');
			c.header('Expires', '0');

			return c.json<FileDownloadUrlResponse>({
				upload_id: record.id,
				destination: record.destination,
				download_url: presigned_url,
				expires_at,
			});
		} catch {
			return c.json({ error: 'Bad Gateway', message: 'Unable to generate R2 download URL' }, 502);
		}
	}

	const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
	if (!appwriteFileId) {
		return c.json({ error: 'Internal Server Error', message: 'Invalid Appwrite storage key format' }, 500);
	}

	try {
		const token = await createAppwriteFileToken(
			c.env,
			record.bucket,
			appwriteFileId,
			DOWNLOAD_URL_TTL_SECONDS
		);

		const downloadUrl = buildAppwriteFileDownloadUrl(c.env, record.bucket, appwriteFileId, token.secret);

		c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
		c.header('Pragma', 'no-cache');
		c.header('Expires', '0');

		return c.json<FileDownloadUrlResponse>({
			upload_id: record.id,
			destination: record.destination,
			download_url: downloadUrl,
			expires_at: token.expires_at,
		});
	} catch {
		return c.json({ error: 'Bad Gateway', message: 'Unable to generate Appwrite download URL' }, 502);
	}
});

files.delete('/:id', zValidator('param', fileIdParamSchema, validationErrorHook), async (c) => {
	const { id } = c.req.valid('param');
	const serviceId = c.get('serviceId');
	const record = await getUpload(c.env.usrc_d1, id);

	if (!record || record.service_id !== serviceId) {
		return c.json({ error: 'Not Found', message: 'File not found' }, 404);
	}

	// B17: delete the DB row FIRST so a failed physical delete cannot leave a
	// dangling DB record that points at an already-removed object. If the
	// physical delete fails, we resurrect the row (best-effort) so the next
	// retry can complete the operation.
	const recordDeleted = await deleteUploadRecord(c.env.usrc_d1, id);
	if (!recordDeleted) {
		return c.json({ error: 'Conflict', message: 'File record could not be deleted' }, 409);
	}

	try {
		if (record.destination === 'r2') {
			await deleteObject(c.env, record.bucket, record.storage_key);
		} else {
			const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
			if (!appwriteFileId) {
				return c.json({ error: 'Internal Server Error', message: 'Invalid Appwrite storage key format' }, 500);
			}
			await deleteAppwriteFile(c.env, record.bucket, appwriteFileId);
		}
	} catch (err) {
		console.error('[admin files.delete] physical delete failed; row already removed', err);
		return c.json({ error: 'Bad Gateway', message: 'Unable to delete file in upstream storage' }, 502);
	}

	return c.json<FileDeleteResponse>({
		success: true,
		id,
		permanent: true,
	});
});

export default files;
