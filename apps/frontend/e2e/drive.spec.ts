import { expect, test, type Page, type Route } from '@playwright/test';

const backendBaseUrl = 'http://127.0.0.1:46789';

type FolderRecord = {
  id: string;
  service_id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  color_tag: string | null;
  is_trashed: boolean;
  trashed_at: number | null;
  created_at: number;
  updated_at: number;
};

type FileRecord = {
  id: string;
  service_id: string;
  user_id: string;
  folder_id: string | null;
  upload_id: string | null;
  filename: string;
  size: number;
  mime_type: string;
  storage_destination: 'r2' | 'appwrite';
  is_trashed: boolean;
  trashed_at: number | null;
  created_at: number;
  updated_at: number;
};

type UploadRecord = {
  id: string;
  service_id: string;
  user_id: string | null;
  folder_id: string | null;
  filename: string;
  size: number;
  mime_type: string;
  destination: 'r2' | 'appwrite';
  status: 'pending' | 'completed' | 'failed';
  expires_at: number;
  created_at: number;
  updated_at: number;
};

type ShareInfo =
  | {
      kind: 'open';
      filename: string;
      size: number;
      mime_type: string;
      download_url: string;
      link_name: string | null;
      link_expires_at: number | null;
    }
  | {
      kind: 'locked';
      filename: string;
      size: number;
      mime_type: string;
      password: string;
      link_name: string | null;
    };

function getUnixNow() {
  return Math.floor(Date.now() / 1000);
}

function folderRecord(id: string, name: string, parentId: string | null = null): FolderRecord {
  const now = getUnixNow();
  return {
    id,
    service_id: 'usrc',
    user_id: 'user-e2e',
    parent_id: parentId,
    name,
    color_tag: null,
    is_trashed: false,
    trashed_at: null,
    created_at: now,
    updated_at: now,
  };
}

function fileRecord(id: string, filename: string, folderId: string | null = null): FileRecord {
  const now = getUnixNow();
  return {
    id,
    service_id: 'usrc',
    user_id: 'user-e2e',
    folder_id: folderId,
    upload_id: `upload-${id}`,
    filename,
    size: 420_000,
    mime_type: 'application/pdf',
    storage_destination: 'r2',
    is_trashed: false,
    trashed_at: null,
    created_at: now,
    updated_at: now,
  };
}

function reply(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installApiMocks(page: Page) {
  let folders: FolderRecord[] = [
    folderRecord('folder-strategia', 'Strategia'),
    { ...folderRecord('folder-trash', 'Archiwum'), is_trashed: true, trashed_at: getUnixNow() - 300 },
  ];
  let files: FileRecord[] = [
    fileRecord('file-raport', 'raport-q4.pdf'),
    { ...fileRecord('file-trash', 'stary-projekt.pdf'), is_trashed: true, trashed_at: getUnixNow() - 120 },
  ];
  let uploads: UploadRecord[] = [];
  const publicShares = new Map<string, ShareInfo>([
    [
      'otwarty-link',
      {
        kind: 'open',
        filename: 'publiczny-raport.pdf',
        size: 2_048,
        mime_type: 'application/pdf',
        download_url: `${backendBaseUrl}/download/publiczny-raport.pdf`,
        link_name: 'Dla klienta',
        link_expires_at: null,
      },
    ],
    [
      'zamkniety-link',
      {
        kind: 'locked',
        filename: 'tajny-raport.pdf',
        size: 4_096,
        mime_type: 'application/pdf',
        password: 'sekret123',
        link_name: 'Hasło wymagane',
      },
    ],
  ]);

  await page.route('**/v1/account**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname.endsWith('/account')) {
      const nowIso = new Date().toISOString();
      return reply(route, {
        $id: 'user-e2e',
        $createdAt: nowIso,
        $updatedAt: nowIso,
        accessedAt: nowIso,
        name: 'E2E User',
        registration: Math.floor(Date.now() / 1000),
        status: true,
        labels: [],
        passwordUpdate: Math.floor(Date.now() / 1000),
        email: 'e2e@example.com',
        phone: '',
        emailVerification: true,
        phoneVerification: false,
        prefs: {},
      });
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/jwts')) {
      return reply(route, {
        jwt: 'e2e.header.payload',
      }, 201);
    }

    return reply(route, { error: 'Unauthorized', message: 'Unauthorized' }, 401);
  });

  const backendRouteHandler = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;

    if (method === 'GET' && pathname === '/folders') {
      const parentId = url.searchParams.get('parent_id');
      const trashedOnly = url.searchParams.get('trashed') === 'true' || url.searchParams.get('is_trashed') === 'true';
      const items = trashedOnly
        ? folders.filter((entry) => entry.is_trashed)
        : folders.filter((entry) => !entry.is_trashed && (entry.parent_id ?? null) === (parentId ?? null));
      return reply(route, {
        items,
        next_cursor: null,
        limit: 100,
      });
    }

    if (method === 'GET' && /^\/folders\/[^/]+$/.test(pathname)) {
      const id = pathname.split('/')[2];
      const folder = folders.find((entry) => entry.id === id);
      if (!folder) {
        return reply(route, { error: 'NotFound', message: 'Folder not found' }, 404);
      }

      return reply(route, { folder });
    }

    if (method === 'POST' && pathname === '/folders') {
      const payload = request.postDataJSON() as { name?: string; parent_id?: string | null };
      const created = folderRecord(`folder-${Date.now()}`, payload.name ?? 'Nowy folder', payload.parent_id ?? null);
      folders = [...folders, created];
      return reply(route, { folder: created }, 201);
    }

    if (method === 'PATCH' && /^\/folders\/[^/]+$/.test(pathname)) {
      const id = pathname.split('/')[2];
      const payload = request.postDataJSON() as { name?: string };
      const existing = folders.find((entry) => entry.id === id);
      if (!existing) {
        return reply(route, { error: 'NotFound', message: 'Folder not found' }, 404);
      }

      if (payload.name) {
        existing.name = payload.name;
      }
      existing.updated_at = getUnixNow();
      return reply(route, { folder: existing });
    }

    if (method === 'POST' && /^\/folders\/[^/]+\/restore$/.test(pathname)) {
      const id = pathname.split('/')[2];
      const existing = folders.find((entry) => entry.id === id);
      if (!existing) {
        return reply(route, { error: 'NotFound', message: 'Folder not found' }, 404);
      }

      existing.is_trashed = false;
      existing.trashed_at = null;
      existing.updated_at = getUnixNow();
      return reply(route, { success: true, id });
    }

    if (method === 'DELETE' && /^\/folders\/[^/]+$/.test(pathname)) {
      const id = pathname.split('/')[2];
      const permanent = url.searchParams.get('permanent') === 'true';
      const existing = folders.find((entry) => entry.id === id);
      if (!existing) {
        return reply(route, { error: 'NotFound', message: 'Folder not found' }, 404);
      }

      if (permanent) {
        folders = folders.filter((entry) => entry.id !== id);
      } else {
        existing.is_trashed = true;
        existing.trashed_at = getUnixNow();
        existing.updated_at = getUnixNow();
      }

      return reply(route, { success: true, id, permanent, folders_deleted: permanent ? 1 : undefined });
    }

    if (method === 'GET' && pathname === '/my-files') {
      const folderId = url.searchParams.get('folder_id');
      const items = files.filter((entry) => !entry.is_trashed && (entry.folder_id ?? null) === (folderId ?? null));
      return reply(route, {
        items,
        next_cursor: null,
        limit: 100,
      });
    }

    if (method === 'GET' && pathname === '/my-files/trash') {
      return reply(route, {
        items: files.filter((entry) => entry.is_trashed),
        next_cursor: null,
        limit: 100,
      });
    }

    if (method === 'POST' && /^\/my-files\/[^/]+\/restore$/.test(pathname)) {
      const id = pathname.split('/')[2];
      const existing = files.find((entry) => entry.id === id);
      if (!existing) {
        return reply(route, { error: 'NotFound', message: 'File not found' }, 404);
      }

      existing.is_trashed = false;
      existing.trashed_at = null;
      existing.updated_at = getUnixNow();
      return reply(route, { success: true, id });
    }

    if (method === 'PATCH' && /^\/my-files\/[^/]+\/move$/.test(pathname)) {
      const id = pathname.split('/')[2];
      const payload = request.postDataJSON() as { folder_id?: string | null };
      const existing = files.find((entry) => entry.id === id);
      if (!existing) {
        return reply(route, { error: 'NotFound', message: 'File not found' }, 404);
      }

      existing.folder_id = payload.folder_id ?? null;
      existing.updated_at = getUnixNow();
      return reply(route, { file: existing });
    }

    if (method === 'DELETE' && /^\/my-files\/[^/]+$/.test(pathname)) {
      const id = pathname.split('/')[2];
      const permanent = url.searchParams.get('permanent') === 'true';
      const existing = files.find((entry) => entry.id === id);
      if (!existing) {
        return reply(route, { error: 'NotFound', message: 'File not found' }, 404);
      }

      if (permanent) {
        files = files.filter((entry) => entry.id !== id);
      } else {
        existing.is_trashed = true;
        existing.trashed_at = getUnixNow();
        existing.updated_at = getUnixNow();
      }
      return reply(route, {
        success: true,
        id,
        permanent,
      });
    }

    if (method === 'GET' && /^\/my-files\/[^/]+\/download-url$/.test(pathname)) {
      const id = pathname.split('/')[2];
      const target = files.find((entry) => entry.id === id);
      return reply(route, {
        upload_id: target?.upload_id ?? 'upload-missing',
        destination: 'r2',
        download_url: 'https://example.com/download/report.pdf',
        expires_at: getUnixNow() + 3600,
      });
    }

    if (method === 'POST' && pathname === '/upload/r2/init') {
      const payload = request.postDataJSON() as {
        filename: string;
        size: number;
        mime_type: string;
        folder_id?: string;
      };
      const uploadId = `upload-${Date.now()}`;
      uploads = [
        {
          id: uploadId,
          service_id: 'usrc',
          user_id: 'user-e2e',
          folder_id: payload.folder_id ?? null,
          filename: payload.filename,
          size: payload.size,
          mime_type: payload.mime_type,
          destination: 'r2',
          status: 'pending',
          expires_at: getUnixNow() + 3600,
          created_at: getUnixNow(),
          updated_at: getUnixNow(),
        },
        ...uploads,
      ];

      return reply(route, {
        upload_id: uploadId,
        destination: 'r2',
        presigned_url: `https://storage.example.com/upload/${uploadId}`,
        storage_key: `usrc/uploads/${uploadId}`,
        bucket: 'unisource',
        expires_at: getUnixNow() + 3600,
      }, 201);
    }

    if (method === 'POST' && pathname === '/upload/complete') {
      const payload = request.postDataJSON() as { upload_id: string };
      const existing = uploads.find((entry) => entry.id === payload.upload_id);
      if (!existing) {
        return reply(route, { error: 'NotFound', message: 'Upload not found' }, 404);
      }

      existing.status = 'completed';
      existing.updated_at = getUnixNow();
      files = [
        {
          id: `file-${existing.id}`,
          service_id: 'usrc',
          user_id: 'user-e2e',
          folder_id: existing.folder_id,
          upload_id: existing.id,
          filename: existing.filename,
          size: existing.size,
          mime_type: existing.mime_type,
          storage_destination: existing.destination,
          is_trashed: false,
          trashed_at: null,
          created_at: getUnixNow(),
          updated_at: getUnixNow(),
        },
        ...files,
      ];

      return reply(route, { success: true, upload_id: existing.id, status: 'completed' });
    }

    if (method === 'POST' && pathname === '/upload/fail') {
      const payload = request.postDataJSON() as { upload_id: string };
      const existing = uploads.find((entry) => entry.id === payload.upload_id);
      if (!existing) {
        return reply(route, { error: 'NotFound', message: 'Upload not found' }, 404);
      }

      existing.status = 'failed';
      existing.updated_at = getUnixNow();
      return reply(route, { success: true, upload_id: existing.id, status: 'failed' });
    }

    if (method === 'GET' && pathname === '/admin/service') {
      return reply(route, {
        service: {
          id: 'usrc',
          name: 'UniSource',
          max_storage_bytes: 10_000_000,
          current_used_bytes: 1_500_000,
          max_file_size_bytes: 5_000_000,
          created_at: getUnixNow() - 86_400,
        },
      });
    }

    if (method === 'GET' && pathname === '/admin/service/usage') {
      return reply(route, {
        service_id: 'usrc',
        max_storage_bytes: 10_000_000,
        current_used_bytes: 1_500_000,
        used_percent: 15,
      });
    }

    if (method === 'GET' && pathname === '/admin/audit-log') {
      return reply(route, {
        items: [
          {
            id: 'audit-1',
            service_id: 'usrc',
            user_id: 'user-e2e',
            action: 'upload_completed',
            resource_type: 'file',
            resource_id: 'file-raport',
            metadata: null,
            ip_address: null,
            created_at: getUnixNow(),
          },
        ],
        next_cursor: null,
        limit: 25,
      });
    }

    if (method === 'GET' && pathname === '/files') {
      return reply(route, {
        items: uploads.slice(0, 20),
        next_cursor: null,
        limit: 20,
      });
    }

    if (method === 'GET' && /^\/public\/[^/]+$/.test(pathname)) {
      const slug = pathname.split('/')[2];
      const share = publicShares.get(slug);
      if (!share) {
        return reply(route, { error: 'NotFound', message: 'Link not found' }, 404);
      }

      if (share.kind === 'locked') {
        return reply(route, {
          filename: share.filename,
          size: share.size,
          mime_type: share.mime_type,
          requires_password: true,
          link_name: share.link_name,
        });
      }

      return reply(route, {
        file_id: `file-${slug}`,
        filename: share.filename,
        size: share.size,
        mime_type: share.mime_type,
        requires_password: false,
        download_url: share.download_url,
        url_expires_at: getUnixNow() + 3600,
        link_name: share.link_name,
        link_expires_at: share.link_expires_at,
      });
    }

    if (method === 'POST' && /^\/public\/[^/]+\/unlock$/.test(pathname)) {
      const slug = pathname.split('/')[2];
      const share = publicShares.get(slug);
      const payload = request.postDataJSON() as { password: string };
      if (!share || share.kind !== 'locked') {
        return reply(route, { error: 'NotFound', message: 'Link not found' }, 404);
      }
      if (payload.password !== share.password) {
        return reply(route, { error: 'Unauthorized', message: 'Incorrect password' }, 401);
      }

      return reply(route, {
        file_id: `file-${slug}`,
        filename: share.filename,
        size: share.size,
        mime_type: share.mime_type,
        requires_password: false,
        download_url: `${backendBaseUrl}/download/tajny-raport.pdf`,
        url_expires_at: getUnixNow() + 3600,
        link_name: share.link_name,
        link_expires_at: null,
      });
    }

    if (method === 'GET' && pathname.startsWith('/download/')) {
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pathname.split('/').at(-1) ?? 'download.pdf'}"`,
        },
        body: 'PDF',
      });
    }

    return reply(route, {
      error: 'NotFound',
      message: `Unhandled route in test mock: ${method} ${pathname}`,
    }, 404);
  };

  await page.route(`${backendBaseUrl}/**`, backendRouteHandler);
  await page.route('http://localhost:8787/**', backendRouteHandler);

  await page.route('https://storage.example.com/**', async (route) => {
    if (route.request().method() === 'PUT') {
      return route.fulfill({ status: 200, body: '' });
    }

    return route.fulfill({ status: 404, body: '' });
  });
}

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([
    {
      name: 'unisource_auth',
      value: '1',
      url: 'http://127.0.0.1:4321',
    },
  ]);
  await installApiMocks(page);
});

test('drive renders mocked data and supports search plus view switch', async ({ page }) => {
  await page.goto('/drive');

  await expect(page.locator('[role="grid"]')).toBeVisible();
  await expect(page.locator('[role="grid"]').getByText('Strategia')).toBeVisible();
  await expect(page.locator('[role="grid"]').getByText('raport-q4.pdf')).toBeVisible();

  await page.locator('button.icon-only').click();
  await expect(page.locator('[role="list"]')).toBeVisible();

  const searchInput = page.getByRole('searchbox', { name: /Szukaj/i });
  await searchInput.fill('missing-item');
  await expect(page.getByRole('heading', { name: /Brak wynik/i })).toBeVisible();

  await searchInput.fill('raport');
  await expect(page.locator('[role="list"]').getByText('raport-q4.pdf')).toBeVisible();
});

test('drive creates folder and opens context menu actions', async ({ page }) => {
  await page.goto('/drive');

  await expect(page.locator('[role="grid"]').getByText('Strategia')).toBeVisible();

  await page.getByRole('button', { name: /Nowy folder/i }).click();
  const createDialog = page.getByRole('dialog', { name: /Tworzenie folderu/i });
  await expect(createDialog).toBeVisible();

  await createDialog.getByPlaceholder('Nazwa folderu').fill('Roadmap');
  await createDialog.getByRole('button', { name: /Utw/i }).click();

  await expect(page.getByText('Utworzono folder: Roadmap')).toBeVisible();
  await expect(page.locator('[role="grid"]').getByText('Roadmap')).toBeVisible();

  await page.locator('[role="grid"]').getByText('raport-q4.pdf').click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Pobierz/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Zmien|Zmień/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Przenies|Przenieś/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Usu/i })).toBeVisible();
});

test('drive uploads a file directly into the current folder without move workaround', async ({ page }) => {
  await page.goto('/drive');

  await page.locator('[role="grid"]').getByText('Strategia').dblclick();
  await expect(page).toHaveURL(/\/drive\/folder-strategia$/);

  await page.setInputFiles('#drive-upload-input', {
    name: 'brief.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('brief content'),
  });

  await expect(page.getByText('Wgrano 1 plik.')).toBeVisible();
  await expect(page.locator('[role="grid"]').getByText('brief.txt')).toBeVisible();
});

test('trash shows files and folders and allows restoring both kinds', async ({ page }) => {
  await page.goto('/trash');

  await expect(page.getByRole('heading', { name: 'Kosz' })).toBeVisible();
  await expect(page.getByText('stary-projekt.pdf')).toBeVisible();
  await expect(page.getByText('Archiwum')).toBeVisible();

  await page.getByRole('button', { name: /Przywróć/i }).first().click();
  await expect(page.getByText(/Przywrócono:/i)).toBeVisible();
});

test('admin page loads service overview, audit log, and upload list', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: /Panel Administratora/i })).toBeVisible();
  await expect(page.getByRole('main').getByText('UniSource')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Ostatnie zdarzenia/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Ostatnie uploady/i })).toBeVisible();
});
