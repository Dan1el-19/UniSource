import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/shareLinks', () => ({
	getShareLinkBySlug: vi.fn(),
	incrementDownloadCount: vi.fn()
}));

vi.mock('../src/db/fileRecords', () => ({
	getFileRecord: vi.fn()
}));

vi.mock('../src/db/services', () => ({
	logServiceEvent: vi.fn()
}));

vi.mock('../src/services/r2', () => ({
	generatePresignedGetUrl: vi.fn()
}));

vi.mock('../src/services/appwrite', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/services/appwrite')>();
	return {
		...actual,
		createAppwriteFileToken: vi.fn(),
		buildAppwriteFileDownloadUrl: vi.fn()
	};
});

import { getFileRecord } from '../src/db/fileRecords';
import { getShareLinkBySlug, incrementDownloadCount } from '../src/db/shareLinks';
import { generatePresignedGetUrl } from '../src/services/r2';
import publicRouter from '../src/routes/public';

function buildPublicApp() {
	const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
	app.route('/public', publicRouter);
	return app;
}

const env = {
	APP_DB: {},
	DOWNLOAD_TOKEN_SECRET: 'test-secret'
} as unknown as CloudflareBindings;

const activeLink = {
	id: 'link-1',
	service_id: 'default',
	user_id: 'user-1',
	file_id: 'file-1',
	slug: 'shared-file',
	name: 'Shared file',
	password_hash: null,
	is_active: 1,
	expires_at: null,
	max_downloads: null,
	download_count: 0
};

const r2File = {
	id: 'file-1',
	filename: 'report.pdf',
	size: 1234,
	mime_type: 'application/pdf',
	storage_destination: 'r2',
	storage_key: 'default/uploads/report.pdf',
	bucket: 'unisource',
	is_trashed: 0
};

describe('GET /public/:slug/download', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.unstubAllGlobals();
		vi.mocked(getShareLinkBySlug).mockResolvedValue(activeLink as any);
		vi.mocked(getFileRecord).mockResolvedValue(r2File as any);
		vi.mocked(incrementDownloadCount).mockResolvedValue(true);
		vi.mocked(generatePresignedGetUrl).mockResolvedValue({
			presigned_url: 'https://storage.example/report.pdf?signature=abc',
			storage_key: 'default/uploads/report.pdf',
			expires_at: Math.floor(Date.now() / 1000) + 900
		});
	});

	it('redirects to storage instead of streaming file bytes through the backend', async () => {
		const app = buildPublicApp();
		const infoResponse = await app.fetch(new Request('http://localhost/public/shared-file'), env);
		const info = (await infoResponse.json()) as { download_url: string };

		const fetchMock = vi.fn().mockResolvedValue(new Response('proxied bytes'));
		vi.stubGlobal('fetch', fetchMock);

		const downloadResponse = await app.fetch(new Request(info.download_url), env);

		expect(downloadResponse.status).toBe(302);
		expect(downloadResponse.headers.get('Location')).toBe(
			'https://storage.example/report.pdf?signature=abc'
		);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(generatePresignedGetUrl).toHaveBeenLastCalledWith(
			expect.anything(),
			'unisource',
			'default/uploads/report.pdf',
			expect.any(Number),
			'report.pdf'
		);
		expect(incrementDownloadCount).toHaveBeenCalledWith(expect.anything(), 'link-1');
	});
});
