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
	type UploadRecord as ApiUploadRecord,
	uploadDestinationSchema,
	uploadStatusSchema,
} from '@unisource/sdk';
import { V2Error } from '../lib/v2/errors';
import { logV2Request } from '../lib/v2/log';
import { v2ValidationHook } from '../lib/v2/zodHook';

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

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

files.get('/', zValidator('query', filesListQuerySchema, v2ValidationHook), async (c) => {
	const query = c.req.valid('query');
	const serviceId = c.get('serviceId');
	const start = Date.now();

	try {
		const result = await listUploads(c.env.APP_DB, {
			limit: query.limit,
			cursor: query.cursor,
			destination: query.destination,
			status: query.status,
			service_id: serviceId,
		});

		const response = c.json({
			items: result.items.map(toApiUpload),
			next_cursor: result.next_cursor,
			limit: query.limit,
		});
		logV2Request(c, start, { route_family: 'files', operation: 'list' });
		return response;
	} catch (error) {
		if (error instanceof Error && error.message === 'Invalid cursor') {
			throw new V2Error('cursor_invalid', 400, 'cursor is invalid');
		}

		throw error;
	}
});

files.get('/:id', zValidator('param', fileIdParamSchema, v2ValidationHook), async (c) => {
	const { id } = c.req.valid('param');
	const serviceId = c.get('serviceId');
	const start = Date.now();
	const record = await getUpload(c.env.APP_DB, id);

	if (!record || record.service_id !== serviceId) {
		throw new V2Error('not_found', 404, 'File not found');
	}

	const response = c.json({ upload: toApiUpload(record) });
	logV2Request(c, start, { route_family: 'files', operation: 'get' });
	return response;
});

files.get('/:id/download-url', zValidator('param', fileIdParamSchema, v2ValidationHook), async (c) => {
	const { id } = c.req.valid('param');
	const serviceId = c.get('serviceId');
	const start = Date.now();
	const record = await getUpload(c.env.APP_DB, id);

	if (!record || record.service_id !== serviceId) {
		throw new V2Error('not_found', 404, 'File not found');
	}

	if (record.status !== 'completed') {
		throw new V2Error('conflict', 409, `File is not available for download in state: ${record.status}`);
	}

	if (record.destination === 'r2') {
		try {
			const { presigned_url, expires_at } = await generatePresignedGetUrl(
				c.env,
				record.bucket,
				record.storage_key,
				DOWNLOAD_URL_TTL_SECONDS,
				record.filename
			);

			c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
			c.header('Pragma', 'no-cache');
			c.header('Expires', '0');

			const response = c.json({
				upload_id: record.id,
				destination: record.destination,
				download_url: presigned_url,
				expires_at,
			});
			logV2Request(c, start, { route_family: 'files', operation: 'download_url' });
			return response;
		} catch {
			throw new V2Error('bad_gateway', 502, 'Unable to generate R2 download URL');
		}
	}

	const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
	if (!appwriteFileId) {
		throw new V2Error('internal_error', 500, 'Invalid Appwrite storage key format');
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

		const response = c.json({
			upload_id: record.id,
			destination: record.destination,
			download_url: downloadUrl,
			expires_at: token.expires_at,
		});
		logV2Request(c, start, { route_family: 'files', operation: 'download_url' });
		return response;
	} catch {
		throw new V2Error('bad_gateway', 502, 'Unable to generate Appwrite download URL');
	}
});

files.delete('/:id', zValidator('param', fileIdParamSchema, v2ValidationHook), async (c) => {
	const { id } = c.req.valid('param');
	const serviceId = c.get('serviceId');
	const start = Date.now();
	const record = await getUpload(c.env.APP_DB, id);

	if (!record || record.service_id !== serviceId) {
		throw new V2Error('not_found', 404, 'File not found');
	}

	// B17: delete the DB row FIRST so a failed physical delete cannot leave a
	// dangling DB record that points at an already-removed object. If the
	// physical delete fails, we resurrect the row (best-effort) so the next
	// retry can complete the operation.
	const recordDeleted = await deleteUploadRecord(c.env.APP_DB, id);
	if (!recordDeleted) {
		throw new V2Error('conflict', 409, 'File record could not be deleted');
	}

	try {
		if (record.destination === 'r2') {
			await deleteObject(c.env, record.bucket, record.storage_key);
		} else {
			const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
			if (!appwriteFileId) {
				throw new V2Error('internal_error', 500, 'Invalid Appwrite storage key format');
			}
			await deleteAppwriteFile(c.env, record.bucket, appwriteFileId);
		}
	} catch (err) {
		if (err instanceof V2Error) throw err;
		console.error('[admin files.delete] physical delete failed; row already removed', err);
		throw new V2Error('bad_gateway', 502, 'Unable to delete file in upstream storage');
	}

	const response = c.json({
		success: true,
		id,
		permanent: true,
	});
	logV2Request(c, start, { route_family: 'files', operation: 'delete' });
	return response;
});

export default files;
