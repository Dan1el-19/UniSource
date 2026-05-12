/**
 * Security: Service Isolation Tests
 *
 * Verifies that authenticated users of service A cannot access, download,
 * delete or fail uploads belonging to service B.
 */
import { Hono } from 'hono';
import { describe, it, expect } from 'vitest';
import type { UploadRecord } from '../src/db/files';
import files from '../src/routes/files';
import upload from '../src/routes/upload';

// ---------------------------------------------------------------------------
// Minimal D1 mock factory — returns a fixed record for any SELECT
// ---------------------------------------------------------------------------
function mockD1WithRecord(record: UploadRecord | null): D1Database {
	return {
		prepare: (_sql: string) => ({
			bind: (..._args: unknown[]) => ({
				first: () => Promise.resolve(record),
				run: () => Promise.resolve({ meta: { changes: record ? 1 : 0 }, results: [] }),
				all: () => Promise.resolve({ results: record ? [record] : [] }),
			}),
		}),
	} as unknown as D1Database;
}

// ---------------------------------------------------------------------------
// Helpers: build a test Hono app with pre-set serviceId / userId in context
// ---------------------------------------------------------------------------
function buildFilesApp(serviceId: string, userId: string, db: D1Database) {
	const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

	// Inject auth context the same way the real authMiddleware would
	app.use('*', async (c, next) => {
		c.set('serviceId', serviceId as WorkerVariables['serviceId']);
		c.set('userId', userId as WorkerVariables['userId']);
		c.set('authType', 'apikey' as WorkerVariables['authType']);
		await next();
	});

	app.route('/files', files);

	// Provide the D1 binding
	return { app, env: { usrc_d1: db } as unknown as CloudflareBindings };
}

function buildUploadApp(serviceId: string, userId: string, db: D1Database) {
	const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

	app.use('*', async (c, next) => {
		c.set('serviceId', serviceId as WorkerVariables['serviceId']);
		c.set('userId', userId as WorkerVariables['userId']);
		c.set('authType', 'apikey' as WorkerVariables['authType']);
		await next();
	});

	app.route('/upload', upload);

	return { app, env: { usrc_d1: db } as unknown as CloudflareBindings };
}

// ---------------------------------------------------------------------------
// Fixture: an upload that belongs to 'blokserwis'
// ---------------------------------------------------------------------------
const blokRecord: UploadRecord = {
	id: 'upload-blok-001',
	service_id: 'blokserwis',
	user_id: null,
	folder_id: null,
	filename: 'secret.pdf',
	size: 1024,
	mime_type: 'application/pdf',
	destination: 'r2',
	storage_key: 'blokserwis/uploads/2026/01/01/upload-blok-001.pdf',
	bucket: 'blokserwis',
	status: 'completed',
	presigned_url: null,
	expires_at: Math.floor(Date.now() / 1000) + 3600,
	is_main_storage: 0,
	created_at: Math.floor(Date.now() / 1000),
	updated_at: Math.floor(Date.now() / 1000),
	upload_type: 'single',
	r2_upload_id: null,
};

const blokPendingRecord: UploadRecord = {
	...blokRecord,
	id: 'upload-blok-pending',
	status: 'pending',
};

// ---------------------------------------------------------------------------
// Vuln 1: GET /files/:id — cross-service isolation
// ---------------------------------------------------------------------------
describe('GET /files/:id — service isolation', () => {
	it('returns 404 when the record belongs to a different service', async () => {
		const db = mockD1WithRecord(blokRecord);
		const { app, env } = buildFilesApp('usrc', 'system', db);

		const res = await app.fetch(
			new Request('http://localhost/files/upload-blok-001'),
			env
		);

		expect(res.status).toBe(404);
	});

	it('returns 200 when the record belongs to the authenticated service', async () => {
		const ownRecord: UploadRecord = { ...blokRecord, service_id: 'usrc' };
		const db = mockD1WithRecord(ownRecord);
		const { app, env } = buildFilesApp('usrc', 'system', db);

		const res = await app.fetch(
			new Request('http://localhost/files/upload-blok-001'),
			env
		);

		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// Vuln 1: GET /files/:id/download-url — cross-service isolation
// ---------------------------------------------------------------------------
describe('GET /files/:id/download-url — service isolation', () => {
	it('returns 404 when the record belongs to a different service', async () => {
		const db = mockD1WithRecord(blokRecord);
		const { app, env } = buildFilesApp('usrc', 'system', db);

		const res = await app.fetch(
			new Request('http://localhost/files/upload-blok-001/download-url'),
			env
		);

		expect(res.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// Vuln 1: DELETE /files/:id — cross-service isolation
// ---------------------------------------------------------------------------
describe('DELETE /files/:id — service isolation', () => {
	it('returns 404 when the record belongs to a different service', async () => {
		const db = mockD1WithRecord(blokRecord);
		const { app, env } = buildFilesApp('usrc', 'system', db);

		const res = await app.fetch(
			new Request('http://localhost/files/upload-blok-001', { method: 'DELETE' }),
			env
		);

		expect(res.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// Vuln 2: POST /upload/fail — cross-service isolation (API key path)
// ---------------------------------------------------------------------------
describe('POST /upload/fail — service isolation', () => {
	it('returns 404 when the upload belongs to a different service (API key / system userId)', async () => {
		const db = mockD1WithRecord(blokPendingRecord);
		const { app, env } = buildUploadApp('usrc', 'system', db);

		const res = await app.fetch(
			new Request('http://localhost/upload/fail', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ upload_id: 'upload-blok-pending' }),
			}),
			env
		);

		expect(res.status).toBe(404);
	});

	it('returns 200 when the upload belongs to the authenticated service (API key / system userId)', async () => {
		const ownRecord: UploadRecord = { ...blokPendingRecord, service_id: 'usrc' };
		const db = mockD1WithRecord(ownRecord);
		const { app, env } = buildUploadApp('usrc', 'system', db);

		const res = await app.fetch(
			new Request('http://localhost/upload/fail', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ upload_id: 'upload-blok-pending' }),
			}),
			env
		);

		expect(res.status).toBe(200);
	});

	it('returns 404 when the upload belongs to a different service (JWT / user auth)', async () => {
		// blokRecord user_id is null — getUploadForUser should reject this for usrc service
		const blokUserRecord: UploadRecord = {
			...blokPendingRecord,
			service_id: 'blokserwis',
			user_id: 'user-abc',
		};
		const db = mockD1WithRecord(blokUserRecord);
		// JWT path: userId is not 'system', service is 'usrc'
		const { app, env } = buildUploadApp('usrc', 'user-abc', db);

		const res = await app.fetch(
			new Request('http://localhost/upload/fail', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ upload_id: 'upload-blok-pending' }),
			}),
			env
		);

		expect(res.status).toBe(404);
	});
});
