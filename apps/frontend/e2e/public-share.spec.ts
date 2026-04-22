import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const apiHost = '127.0.0.1';
const apiPort = 46789;
const apiBaseUrl = `http://${apiHost}:${apiPort}`;

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'http://127.0.0.1:4321',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(body));
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

let server: Awaited<ReturnType<typeof createMockApiServer>>;

async function createMockApiServer() {
  const serverInstance = createServer(async (request, response) => {
    const { method = 'GET', url = '/' } = request;
    const currentUrl = new URL(url, apiBaseUrl);

    if (method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:4321',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      response.end();
      return;
    }

    if (method === 'GET' && currentUrl.pathname === '/public/open-link') {
      return sendJson(response, 200, {
        file_id: 'file-open',
        filename: 'publiczny-raport.pdf',
        size: 2_048,
        mime_type: 'application/pdf',
        requires_password: false,
        download_url: `${apiBaseUrl}/download/publiczny-raport.pdf`,
        url_expires_at: Math.floor(Date.now() / 1000) + 3600,
        link_name: 'Dla klienta',
        link_expires_at: null,
      });
    }

    if (method === 'GET' && currentUrl.pathname === '/public/locked-link') {
      return sendJson(response, 200, {
        filename: 'tajny-raport.pdf',
        size: 4_096,
        mime_type: 'application/pdf',
        requires_password: true,
        link_name: 'Hasło wymagane',
      });
    }

    if (method === 'POST' && currentUrl.pathname === '/public/locked-link/unlock') {
      const payload = (await readJson(request)) as { password?: string };
      if (payload.password !== 'sekret123') {
        return sendJson(response, 401, { error: 'Unauthorized', message: 'Incorrect password' });
      }

      return sendJson(response, 200, {
        file_id: 'file-locked',
        filename: 'tajny-raport.pdf',
        size: 4_096,
        mime_type: 'application/pdf',
        requires_password: false,
        download_url: `${apiBaseUrl}/download/tajny-raport.pdf`,
        url_expires_at: Math.floor(Date.now() / 1000) + 3600,
        link_name: 'Hasło wymagane',
        link_expires_at: null,
      });
    }

    if (method === 'GET' && currentUrl.pathname.startsWith('/download/')) {
      response.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${currentUrl.pathname.split('/').at(-1) ?? 'download.pdf'}"`,
        'Access-Control-Allow-Origin': 'http://127.0.0.1:4321',
      });
      response.end('PDF');
      return;
    }

    sendJson(response, 404, { error: 'NotFound', message: 'Route not mocked' });
  });

  await new Promise<void>((resolve) => serverInstance.listen(apiPort, apiHost, resolve));
  return serverInstance;
}

test.beforeAll(async () => {
  server = await createMockApiServer();
});

test.afterAll(async () => {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('public share without password renders download CTA', async ({ page }) => {
  await page.goto('/s/open-link');

  await expect(page.getByRole('heading', { name: 'publiczny-raport.pdf' })).toBeVisible();
  await expect(page.getByText('Dla klienta')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pobierz plik/i })).toBeVisible();
});

test('public share with password unlocks after valid secret', async ({ page }) => {
  await page.goto('/s/locked-link');

  await expect(page.getByRole('heading', { name: 'tajny-raport.pdf' })).toBeVisible();
  await page.getByPlaceholder('Wpisz hasło').fill('sekret123');
  await page.getByRole('button', { name: /Odblokuj/i }).click();
  await expect(page.getByRole('button', { name: /Pobierz plik/i })).toBeVisible();
});
