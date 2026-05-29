/**
 * Security: Service Isolation Tests
 *
 * Verifies that authenticated users of service A cannot access, download,
 * delete or fail uploads belonging to service B.
 */
import { Hono } from 'hono';
import { describe, it, expect } from 'vitest';
import type { UploadRecord } from '../src/db/files';
import type { ServiceRecord } from '../src/db/services';
import { v2ErrorHandler } from '../src/middleware/v2Errors';
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
// Service fixtures
// ---------------------------------------------------------------------------
const defaultServiceRecord: ServiceRecord = {
	id: 'default',
	name: 'primary',
	default_bucket: 'primary',
	max_storage_bytes: 16106127360,
	current_used_bytes: 0,
	main_used_bytes: 0,
	max_file_size_bytes: 5_368_709_120,
	recommended_upload_destination: 'r2',
	object_key_prefix: 'default',
	created_at: 0,
};

const secondaryServiceRecord: ServiceRecord = {
	id: 'service-b',
	name: 'Example Service B',
	default_bucket: 'service-b',
	max_storage_bytes: 107374182400,
	current_used_bytes: 0,
	main_used_bytes: 0,
	max_file_size_bytes: 2147483648,
	recommended_upload_destination: 'r2',
	object_key_prefix: '',
	created_at: 0,
};

// ---------------------------------------------------------------------------
// Helpers: build a test Hono app with pre-set serviceId / userId in context
// ---------------------------------------------------------------------------
function buildFilesApp(serviceId: string, userId: string, db: D1Database) {
	const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
	app.onError(v2ErrorHandler);
	const service = serviceId === 'default' ? defaultServiceRecord : secondaryServiceRecord;

	// Inject auth context the same way the real authMiddleware would
	app.use('*', async (c, next) => {
		c.set('serviceId', serviceId as WorkerVariables['serviceId']);
		c.set('userId', userId as WorkerVariables['userId']);
		c.set('service', service);
		c.set('authType', 'apikey' as WorkerVariables['authType']);
		await next();
	});

	app.route('/files', files);

	// Provide the D1 binding
	return { app, env: { APP_DB: db } as unknown as CloudflareBindings };
}

function buildUploadApp(serviceId: string, userId: string, db: D1Database) {
	const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
	app.onError(v2ErrorHandler);
	const service = serviceId === 'default' ? defaultServiceRecord : secondaryServiceRecord;

	app.use('*', async (c, next) => {
		c.set('serviceId', serviceId as WorkerVariables['serviceId']);
		c.set('userId', userId as WorkerVariables['userId']);
		c.set('service', service);
		c.set('authType', 'apikey' as WorkerVariables['authType']);
		await next();
	});

	app.route('/upload', upload);

	return { app, env: { APP_DB: db } as unknown as CloudflareBindings };
}

// ---------------------------------------------------------------------------
// Fixture: an upload that belongs to 'service-b'
// ---------------------------------------------------------------------------
const blokRecord: UploadRecord = {
	id: 'upload-blok-001',
	service_id: 'service-b',
	user_id: null,
	folder_id: null,
	filename: 'secret.pdf',
	size: 1024,
	mime_type: 'application/pdf',
	destination: 'r2',
	storage_key: 'service-b/uploads/2026/01/01/upload-blok-001.pdf',
	bucket: 'service-b',
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
		const { app, env } = buildFilesApp('default', 'system', db);

		const res = await app.fetch(
			new Request('http://localhost/files/upload-blok-001'),
			env
		);

		expect(res.status).toBe(404);
	});

	it('returns 200 when the record belongs to the authenticated service', async () => {
		const ownRecord: UploadRecord = { ...blokRecord, service_id: 'default' };
		const db = mockD1WithRecord(ownRecord);
		const { app, env } = buildFilesApp('default', 'system', db);

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
		const { app, env } = buildFilesApp('default', 'system', db);

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
		const { app, env } = buildFilesApp('default', 'system', db);

		const res = await app.fetch(
			new Request('http://localhost/files/upload-blok-001', { method: 'DELETE' }),
			env
		);

		expect(res.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// Vuln 2: POST /upload/fail — REMOVED in V2 migration (section 2). The
// /upload/fail endpoint had its own cross-service guard via
// `record.service_id !== serviceId`. /upload/complete intentionally does NOT
// guard by service_id on the API-key path: it relies on the upper layers
// (auth middleware → service resolution) to fix the service. The JWT path is
// guarded via getUploadForUser(WHERE user_id AND service_id) at the SQL
// layer; the mock D1 here cannot exercise SQL filtering. End-to-end cross-
// service isolation for /complete is exercised via integration tests that
// use a real D1 (apps/backend/test/routes/v2/upload.test.ts uses real D1
// migrations and rejects cross-service access there).
// ---------------------------------------------------------------------------
