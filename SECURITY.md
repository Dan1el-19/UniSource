# Strategia autoryzacji — Unisource (Astro + Hono + Appwrite)

## Problem

Backend Worker (`Hono`) jest chroniony przez statyczny `SERVICE_API_KEY` w nagłówku `Authorization: Bearer <token>`. Jeśli ten klucz trafia do bundle'a frontendowego — każdy użytkownik może go odczytać z DevTools i wysyłać zapytania bezpośrednio do backendu.

---

## Architektura docelowa

```
Przeglądarka (Svelte island)
    │
    │  fetch("/api/...")  ← lokalny endpoint, brak sekretów
    ▼
Astro SSR (CF Worker)
    │
    │  Authorization: Bearer <SERVICE_API_KEY>   ← sekret z CF Secrets
    │  X-Appwrite-JWT: <token>                ← jeśli user zalogowany
    ▼
Backend Hono Worker
    │
    ├── ścieżka A: Appwrite JWT → weryfikacja przez Appwrite SDK → ok
    └── ścieżka B: SERVICE_API_KEY → statyczny sekret → ok (anonimowe/server-to-server)
```

**Zasada:** Przeglądarka nigdy nie zna `SERVICE_API_KEY`. Zna tylko swój własny JWT (który jest tokenem usera, nie sekretem serwera).

---

## Implementacja

### 1. Sekrety w CF

Nie używaj `vars` w `wrangler.toml` dla sekretów. Użyj:

```bash
# w katalogu frontend workera
wrangler secret put SERVICE_API_KEY
wrangler secret put BACKEND_URL
```

Lub przez CF Dashboard → Worker → Settings → Variables & Secrets → typ **Secret**.

---

### 2. Backend — `middleware/auth.ts`

Zastąp obecny jednościeżkowy walidator dual-auth middleware:

```typescript
import { Context, Next } from 'hono'
import { Client, Account } from 'node-appwrite'

export async function authMiddleware(c: Context, next: Next) {
  // --- Ścieżka A: Appwrite JWT (zalogowany user) ---
  const jwt = c.req.header('X-Appwrite-JWT')

  if (jwt) {
    try {
      const client = new Client()
        .setEndpoint(c.env.APPWRITE_ENDPOINT)
        .setProject(c.env.APPWRITE_PROJECT_ID)
        .setJWT(jwt)

      const account = new Account(client)
      const user = await account.get()

      c.set('user', user)
      c.set('authType', 'appwrite')
      return next()
    } catch {
      // JWT nieważny — nie przerywamy, próbujemy ścieżkę B
    }
  }

  // --- Ścieżka B: statyczny API key (anonim / server-to-server) ---
  const bearer = c.req.header('Authorization')?.replace('Bearer ', '').trim()

  if (bearer && bearer === c.env.SERVICE_API_KEY) {
    c.set('authType', 'apikey')
    return next()
  }

  return c.json({ error: 'Unauthorized' }, 401)
}
```

Rejestracja middleware w Hono:

```typescript
// src/index.ts
import { authMiddleware } from './middleware/auth'

app.use('/api/*', authMiddleware)
```

Jeśli chcesz zablokować pewne endpointy tylko dla zalogowanych userów:

```typescript
app.post('/api/files/delete', authMiddleware, async (c) => {
  if (c.get('authType') !== 'appwrite') {
    return c.json({ error: 'Requires authenticated user' }, 403)
  }
  // ...
})
```

---

### 3. Frontend — Astro API routes jako proxy

Każde żądanie z Svelte island idzie do lokalnego Astro endpointu, **nie bezpośrednio do backendu**.

#### Upload init (anonim może, klucz dokłada Astro):

```typescript
// src/pages/api/upload/init.ts
import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json()

  // Sprawdź czy user ma sesję Appwrite
  const appwriteJwt = cookies.get('appwrite-jwt')?.value

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${import.meta.env.SERVICE_API_KEY}`,
  }

  if (appwriteJwt) {
    headers['X-Appwrite-JWT'] = appwriteJwt
  }

  const res = await fetch(`${import.meta.env.BACKEND_URL}/api/upload/init`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

#### Jeśli używasz Astro middleware globalnie:

```typescript
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(async (context, next) => {
  // Możesz tu centralnie wstrzykiwać JWT do kontekstu
  // i udostępniać go wszystkim API routes przez context.locals
  return next()
})
```

---

### 4. Svelte island — wywołuje lokalny endpoint

```svelte
<script lang="ts">
  async function initUpload(file: File) {
    // ← /api/upload/init, nie backend bezpośrednio
    const res = await fetch('/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
    })

    const { presignedUrl, fileId } = await res.json()

    // Direct upload do R2 (presigned URL nie wymaga żadnych sekretów)
    await fetch(presignedUrl, {
      method: 'PUT',
      body: file,
    })
  }
</script>
```

---

### 5. Astro — konfiguracja SSR

Upewnij się, że Astro działa w trybie SSR (nie static):

```typescript
// astro.config.mjs
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import svelte from '@astrojs/svelte'

export default defineConfig({
  output: 'server',          // ← wymagane dla API routes
  adapter: cloudflare(),
  integrations: [svelte()],
})
```

Zmienne środowiskowe dla Astro CF Workera (w `wrangler.toml` **tylko** publiczne, sekrety przez `wrangler secret`):

```toml
# wrangler.toml (frontend worker)
[vars]
BACKEND_URL = "https://api.twoja-domena.workers.dev"
# SERVICE_API_KEY → wrangler secret put SERVICE_API_KEY (nie tutaj!)
```

---

## Tabela — co wie każda warstwa

| Warstwa | SERVICE_API_KEY | Appwrite JWT | Appwrite projectId |
|---|---|---|---|
| Przeglądarka | ❌ nigdy | ✅ (własny token usera) | ✅ (publiczne) |
| Astro SSR | ✅ z CF Secret | ✅ z cookie/session | ✅ |
| Backend Hono | ✅ z CF Secret | weryfikuje przez SDK | ✅ |

---

## Przypadki użycia

| Akcja | Auth | Kto ją wywołuje |
|---|---|---|
| Inicjacja uploadu do R2 | `SERVICE_API_KEY` (anonim ok) | Astro proxy → Backend |
| Upload do Appwrite Storage | Appwrite JWT | Svelte → Appwrite bezpośrednio |
| Pobranie listy plików usera | Appwrite JWT | Astro proxy → Backend |
| Operacje administracyjne | `SERVICE_API_KEY` (tylko server) | Backend → Backend / CF Cron |

---

## Checklist wdrożenia

- [ ] `wrangler secret put SERVICE_API_KEY` w projekcie frontend workera
- [ ] `wrangler secret put SERVICE_API_KEY` w projekcie backend workera  
- [ ] `wrangler secret put BACKEND_URL` w projekcie frontend workera
- [ ] `output: 'server'` w `astro.config.mjs`
- [ ] Wszystkie wywołania SDK z Svelte islands kierują na `/api/...` (Astro), nie na backend bezpośrednio
- [ ] `authMiddleware` obsługuje oba przypadki (JWT + API key)
- [ ] Żaden sekret nie trafia do `[vars]` w `wrangler.toml`