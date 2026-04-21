import { expect, test, type Page, type Route } from '@playwright/test';

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

function getUnixNow() {
  return Math.floor(Date.now() / 1000);
}

function folderRecord(id: string, name: string, parentId: string | null = null): FolderRecord {
  const now = getUnixNow();
  return {
    id,
    service_id: 'default',
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
    service_id: 'default',
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
  let folders: FolderRecord[] = [folderRecord('folder-strategia', 'Strategia')];
  let files: FileRecord[] = [fileRecord('file-raport', 'raport-q4.pdf')];

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

  await page.route('http://localhost:8787/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;

    if (method === 'GET' && pathname === '/folders') {
      const parentId = url.searchParams.get('parent_id');
      const items = folders.filter((entry) => (entry.parent_id ?? null) === (parentId ?? null));
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

    if (method === 'GET' && pathname === '/my-files') {
      const folderId = url.searchParams.get('folder_id');
      const items = files.filter((entry) => !entry.is_trashed && (entry.folder_id ?? null) === (folderId ?? null));
      return reply(route, {
        items,
        next_cursor: null,
        limit: 100,
      });
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
      files = files.filter((entry) => entry.id !== id);
      return reply(route, {
        success: true,
        id,
        permanent: false,
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

    return reply(route, {
      error: 'NotFound',
      message: `Unhandled route in test mock: ${method} ${pathname}`,
    }, 404);
  });
}

test.beforeEach(async ({ page }) => {
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
