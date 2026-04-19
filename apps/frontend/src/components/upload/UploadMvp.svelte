<script lang="ts">
  import { Account, Client, Storage } from 'appwrite';
  import {
    apiErrorSchema,
    filesListResponseSchema,
    type FileRecord,
    uploadAppwriteInitRequestSchema,
    uploadAppwriteInitResponseSchema,
    uploadCompleteResponseSchema,
    uploadFailResponseSchema,
    uploadLifecycleRequestSchema,
    uploadR2InitRequestSchema,
    uploadR2InitResponseSchema,
  } from 'usrc-sdk';
  import { uploadUiState } from '../../state/upload.svelte';

  type Destination = 'r2' | 'appwrite';
  type SourceFilter = 'all' | Destination;
  type OAuthProviderName = 'google' | 'github';
  type ToastTone = 'success' | 'error' | 'info';
  type ToastState = { tone: ToastTone; message: string } | null;
  type AppwriteSessionUser = {
    id: string;
    name: string;
    email: string;
  };

  let token = $state('');
  let destination = $state<Destination>('r2');
  let filesSourceFilter = $state<SourceFilter>('all');
  let isFilesSectionOpen = $state(true);
  let selectedFile = $state<File | null>(null);
  let isSubmitting = $state(false);
  let isRefreshingFiles = $state(false);
  let appwriteEmail = $state('');
  let appwritePassword = $state('');
  let isAppwriteAuthenticating = $state(false);
  let appwriteSessionUser = $state<AppwriteSessionUser | null>(null);
  let intentionallyInvalidPayload = $state(false);
  let intentionallyMissingAuth = $state(false);
  let toast = $state<ToastState>(null);
  let files = $state<FileRecord[]>([]);
  let lastUploadId = $state('');
  let lastMode = $state('');

  const authorization = $derived(token.trim().length > 0 ? `Bearer ${token.trim()}` : '');
  const isAppwriteAuthenticated = $derived(Boolean(appwriteSessionUser));
  const canSubmit = $derived(
    (authorization.length > 0 || intentionallyMissingAuth) &&
      !isSubmitting &&
      (destination !== 'appwrite' || isAppwriteAuthenticated)
  );

  $effect(() => {
    if (!toast) return;

    const timeout = setTimeout(() => {
      toast = null;
    }, 4200);

    return () => {
      clearTimeout(timeout);
    };
  });

  function setToast(tone: ToastTone, message: string): void {
    toast = { tone, message };
  }

  function normalizeAppwriteEndpoint(endpoint: string): string {
    const trimmed = endpoint.trim();
    if (trimmed.length === 0) {
      return trimmed;
    }

    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  }

  function createAppwriteClient(endpoint = uploadUiState.appwriteEndpoint, projectId = uploadUiState.appwriteProjectId): Client {
    return new Client()
      .setEndpoint(normalizeAppwriteEndpoint(endpoint))
      .setProject(projectId.trim());
  }

  async function loginToAppwrite(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!uploadUiState.appwriteEndpoint.trim() || !uploadUiState.appwriteProjectId.trim()) {
      setToast('error', 'Uzupelnij endpoint oraz project ID Appwrite.');
      return;
    }

    if (!appwriteEmail.trim() || !appwritePassword) {
      setToast('error', 'Podaj email i haslo Appwrite.');
      return;
    }

    isAppwriteAuthenticating = true;

    try {
      const account = new Account(createAppwriteClient());

      await account.createEmailPasswordSession({
        email: appwriteEmail.trim(),
        password: appwritePassword,
      });

      const profile = await account.get();
      appwriteSessionUser = {
        id: profile.$id,
        name: profile.name || profile.email || profile.$id,
        email: profile.email,
      };

      setToast('success', 'Sesja Appwrite aktywna. Mozesz wysylac direct upload.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logowanie Appwrite nie powiodlo sie.';
      setToast('error', message);
    } finally {
      isAppwriteAuthenticating = false;
    }
  }

  async function logoutFromAppwrite(): Promise<void> {
    if (!appwriteSessionUser) {
      return;
    }

    isAppwriteAuthenticating = true;

    try {
      const account = new Account(createAppwriteClient());
      await account.deleteSession({ sessionId: 'current' });
      appwriteSessionUser = null;
      setToast('info', 'Wylogowano z Appwrite.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie wylogowac z Appwrite.';
      setToast('error', message);
    } finally {
      isAppwriteAuthenticating = false;
    }
  }

  function onOauthPlaceholderClick(provider: OAuthProviderName): void {
    const providerLabel = provider === 'google' ? 'Google' : 'GitHub';
    setToast('info', `Placeholder OAuth ${providerLabel}: podlaczymy to w kolejnym kroku.`);
  }

  function onFileChange(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    selectedFile = target.files?.[0] ?? null;
  }

  async function onSourceFilterChange(event: Event): Promise<void> {
    const target = event.currentTarget as HTMLSelectElement;
    const nextFilter = target.value as SourceFilter;
    filesSourceFilter = nextFilter;

    if (!isFilesSectionOpen) {
      return;
    }

    await refreshFiles();
  }

  function toggleFilesSection(): void {
    isFilesSectionOpen = !isFilesSectionOpen;
  }

  function buildJsonRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (!intentionallyMissingAuth && authorization.length > 0) {
      headers.Authorization = authorization;
    }

    return headers;
  }

  async function readApiError(response: Response): Promise<string> {
    const fallback = `Błąd ${response.status}`;

    try {
      const payload = await response.json();
      const parsed = apiErrorSchema.safeParse(payload);
      if (parsed.success) {
        return `${parsed.data.error}: ${parsed.data.message}`;
      }
    } catch {
      return fallback;
    }

    return fallback;
  }

  async function uploadThroughR2(file: File): Promise<string> {
    const parsedPayload = uploadR2InitRequestSchema.safeParse({
      filename: file.name,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
    });

    if (!parsedPayload.success) {
      throw new Error('Walidacja frontendu odrzucila payload R2 przed wysylka.');
    }

    const body = intentionallyInvalidPayload
      ? {
          filename: parsedPayload.data.filename,
          size: parsedPayload.data.size,
        }
      : parsedPayload.data;

    const initResponse = await fetch(`${uploadUiState.apiBaseUrl}/upload/r2/init`, {
      method: 'POST',
      headers: buildJsonRequestHeaders(),
      body: JSON.stringify(body),
    });

    if (!initResponse.ok) {
      const message = await readApiError(initResponse);
      throw new Error(message);
    }

    const parsedInit = uploadR2InitResponseSchema.safeParse(await initResponse.json());
    if (!parsedInit.success) {
      throw new Error('Backend zwrocil nieprawidlowy kontrakt odpowiedzi dla R2.');
    }

    const putResponse = await fetch(parsedInit.data.presigned_url, {
      method: 'PUT',
      headers: {
        'Content-Type': parsedPayload.data.mime_type,
      },
      body: file,
    });

    if (!putResponse.ok) {
      throw new Error(`Przesyl danych do R2 nie powiodl sie (${putResponse.status}).`);
    }

    return parsedInit.data.upload_id;
  }

  async function uploadThroughAppwrite(file: File): Promise<string> {
    if (!appwriteSessionUser) {
      throw new Error('Tryb Appwrite wymaga aktywnej sesji Appwrite (login email + haslo).');
    }

    const parsedPayload = uploadAppwriteInitRequestSchema.safeParse({
      filename: file.name,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
    });

    if (!parsedPayload.success) {
      throw new Error('Walidacja frontendu odrzucila payload Appwrite przed wysylka.');
    }

    const initResponse = await fetch(`${uploadUiState.apiBaseUrl}/upload/appwrite/init`, {
      method: 'POST',
      headers: buildJsonRequestHeaders(),
      body: JSON.stringify(parsedPayload.data),
    });

    if (!initResponse.ok) {
      const message = await readApiError(initResponse);
      throw new Error(message);
    }

    const parsedInit = uploadAppwriteInitResponseSchema.safeParse(await initResponse.json());
    if (!parsedInit.success) {
      throw new Error('Backend zwrocil nieprawidlowy kontrakt odpowiedzi dla Appwrite.');
    }

    const configuredEndpoint = normalizeAppwriteEndpoint(uploadUiState.appwriteEndpoint);
    const initEndpoint = normalizeAppwriteEndpoint(parsedInit.data.appwrite_endpoint);
    const configuredProjectId = uploadUiState.appwriteProjectId.trim();

    if (configuredEndpoint !== initEndpoint || configuredProjectId !== parsedInit.data.appwrite_project_id) {
      throw new Error(
        'Konfiguracja Appwrite we froncie nie zgadza sie z backendem. Ustaw endpoint/project i zaloguj sie ponownie.'
      );
    }

    const client = createAppwriteClient(parsedInit.data.appwrite_endpoint, parsedInit.data.appwrite_project_id);

    const storage = new Storage(client);

    await storage.createFile({
      bucketId: parsedInit.data.appwrite_bucket_id,
      fileId: parsedInit.data.file_id,
      file,
    });

    return parsedInit.data.upload_id;
  }

  async function markUploadAsComplete(uploadId: string): Promise<void> {
    const payload = uploadLifecycleRequestSchema.parse({ upload_id: uploadId });

    const response = await fetch(`${uploadUiState.apiBaseUrl}/upload/complete`, {
      method: 'POST',
      headers: buildJsonRequestHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await readApiError(response);
      throw new Error(message);
    }

    const parsed = uploadCompleteResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error('Niepoprawna odpowiedz /upload/complete.');
    }
  }

  async function markUploadAsFailed(uploadId: string): Promise<void> {
    const payload = uploadLifecycleRequestSchema.parse({ upload_id: uploadId });

    const response = await fetch(`${uploadUiState.apiBaseUrl}/upload/fail`, {
      method: 'POST',
      headers: buildJsonRequestHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return;
    }

    uploadFailResponseSchema.safeParse(await response.json());
  }

  async function refreshFiles(): Promise<void> {
    if (authorization.length === 0) {
      setToast('info', 'Wprowadz token, aby pobierac liste plikow.');
      return;
    }

    isRefreshingFiles = true;

    try {
      const query = new URLSearchParams({
        limit: '8',
      });

      if (filesSourceFilter !== 'all') {
        query.set('destination', filesSourceFilter);
      }

      const response = await fetch(`${uploadUiState.apiBaseUrl}/files?${query.toString()}`, {
        headers: {
          Authorization: authorization,
        },
      });

      if (!response.ok) {
        const message = await readApiError(response);
        throw new Error(message);
      }

      const parsed = filesListResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error('Niepoprawna odpowiedz /files.');
      }

      files = parsed.data.items;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany blad listowania plikow.';
      setToast('error', message);
    } finally {
      isRefreshingFiles = false;
    }
  }

  async function onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!intentionallyMissingAuth && authorization.length === 0) {
      setToast('error', 'Token Bearer jest wymagany.');
      return;
    }

    const frontendValidationPayload = {
      filename: selectedFile?.name ?? '',
      size: selectedFile?.size ?? 0,
      mime_type: selectedFile?.type || 'application/octet-stream',
    };

    const frontendValidation = destination === 'r2'
      ? uploadR2InitRequestSchema.safeParse(frontendValidationPayload)
      : uploadAppwriteInitRequestSchema.safeParse(frontendValidationPayload);

    if (!frontendValidation.success) {
      const firstIssue = frontendValidation.error.issues[0];
      const issuePath = firstIssue?.path.length ? `${firstIssue.path.join('.')}: ` : '';
      const issueMessage = firstIssue?.message ?? 'Nieprawidlowe dane formularza.';
      setToast('error', `Walidacja frontendu: ${issuePath}${issueMessage}`);
      return;
    }

    if (!selectedFile) {
      setToast('error', 'Wybierz plik przed wysylka.');
      return;
    }

    if (destination === 'appwrite' && !appwriteSessionUser) {
      setToast('error', 'Aby wysylac do Appwrite, najpierw zaloguj sie w sekcji Appwrite Auth.');
      return;
    }

    isSubmitting = true;
    let startedUploadId = '';

    try {
      const uploadId = destination === 'r2'
        ? await uploadThroughR2(selectedFile)
        : await uploadThroughAppwrite(selectedFile);

      startedUploadId = uploadId;
      await markUploadAsComplete(uploadId);

      lastUploadId = uploadId;
      lastMode = destination.toUpperCase();
      setToast('success', `Upload zakonczony sukcesem (${destination.toUpperCase()}).`);
      await refreshFiles();
    } catch (error) {
      if (startedUploadId) {
        await markUploadAsFailed(startedUploadId);
      }

      const message = error instanceof Error ? error.message : 'Nieznany blad podczas uploadu.';
      setToast('error', message);
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#snippet statusChip(status: FileRecord['status'])}
  <span
    class={`badge badge-soft ${status === 'completed'
      ? 'badge-success'
      : status === 'pending'
      ? 'badge-warning'
      : 'badge-error'}`}
  >
    {status}
  </span>
{/snippet}

<div class="space-y-6 enter-rise">
  <div class="surface-glass rounded-3xl p-6 md:p-8">
    <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <p class="text-xs uppercase tracking-[0.25em] text-teal-700/70">Laboratorium Integracji</p>
        <h2 class="text-3xl font-semibold leading-tight text-slate-900">Upload MVP: R2 + Appwrite</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-700">
          Formularz testuje caly flow E2E z walidacja kontraktu po stronie frontendu (`safeParse`) oraz
          backendu (`zValidator`).
        </p>
      </div>
      <button class="btn btn-outline btn-accent" onclick={refreshFiles} disabled={isRefreshingFiles}>
        {isRefreshingFiles ? 'Odswiezanie...' : 'Odswiez pliki'}
      </button>
    </div>

    <div class="mt-6 grid gap-5 rounded-2xl border border-teal-900/10 bg-white/60 p-5 md:grid-cols-[2fr_1fr]">
      <div class="space-y-4">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-teal-700/70">Appwrite Auth</p>
          <h3 class="text-xl font-semibold text-slate-900">Logowanie email + haslo</h3>
          <p class="mt-1 text-sm text-slate-700">
            Bucket pozostaje prywatny. Direct upload Appwrite jest dostepny dopiero po zalogowaniu sesji
            Appwrite po stronie klienta.
          </p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <label class="form-control gap-2">
            <span class="label-text font-medium">Appwrite Endpoint</span>
            <input
              class="input input-bordered w-full"
              type="url"
              bind:value={uploadUiState.appwriteEndpoint}
              placeholder="https://fra.cloud.appwrite.io/v1"
              required
            />
          </label>

          <label class="form-control gap-2">
            <span class="label-text font-medium">Appwrite Project ID</span>
            <input
              class="input input-bordered w-full"
              type="text"
              bind:value={uploadUiState.appwriteProjectId}
              placeholder="Wpisz Appwrite Project ID"
              required
            />
          </label>
        </div>

        <form class="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end" onsubmit={loginToAppwrite}>
          <label class="form-control gap-2">
            <span class="label-text font-medium">Email Appwrite</span>
            <input
              class="input input-bordered w-full"
              type="email"
              bind:value={appwriteEmail}
              placeholder="user@example.com"
              required
            />
          </label>

          <label class="form-control gap-2">
            <span class="label-text font-medium">Haslo Appwrite</span>
            <input
              class="input input-bordered w-full"
              type="password"
              bind:value={appwritePassword}
              placeholder="Wpisz haslo"
              required
            />
          </label>

          <button class="btn btn-secondary" type="submit" disabled={isAppwriteAuthenticating}>
            {isAppwriteAuthenticating ? 'Logowanie...' : 'Zaloguj do Appwrite'}
          </button>
        </form>

        <div class="flex flex-wrap gap-2">
          <button class="btn btn-outline btn-sm" type="button" onclick={() => onOauthPlaceholderClick('google')}>
            OAuth Google (placeholder)
          </button>
          <button class="btn btn-outline btn-sm" type="button" onclick={() => onOauthPlaceholderClick('github')}>
            OAuth GitHub (placeholder)
          </button>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Status sesji</p>

        {#if appwriteSessionUser}
          <p class="mt-2 text-sm text-slate-800">Zalogowany: {appwriteSessionUser.name}</p>
          <p class="text-xs text-slate-600">{appwriteSessionUser.email}</p>
          <button class="btn btn-error btn-soft mt-4 w-full" onclick={logoutFromAppwrite} disabled={isAppwriteAuthenticating}>
            Wyloguj z Appwrite
          </button>
        {:else}
          <p class="mt-2 text-sm text-slate-700">Brak aktywnej sesji Appwrite.</p>
          <p class="mt-1 text-xs text-slate-500">
            Upload do Appwrite bedzie aktywny po zalogowaniu.
          </p>
        {/if}
      </div>
    </div>

    <form class="mt-8 grid gap-5" onsubmit={onSubmit}>
      <div class="grid gap-5 md:grid-cols-2">
        <label class="form-control gap-2">
          <span class="label-text font-medium">Adres backendu</span>
          <input
            class="input input-bordered w-full"
            type="url"
            bind:value={uploadUiState.apiBaseUrl}
            placeholder="http://127.0.0.1:8787"
            required
          />
        </label>

        <label class="form-control gap-2">
          <span class="label-text font-medium">Token Bearer bramki backendu</span>
          <input
            class="input input-bordered w-full"
            type="password"
            bind:value={token}
            placeholder="Wklej USRC_API_KEY"
            required
          />
        </label>
      </div>

      <div class="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
        <label class="form-control gap-2">
          <span class="label-text font-medium">Wybierz plik</span>
          <input class="file-input file-input-bordered w-full" type="file" onchange={onFileChange} />
        </label>

        <label class="form-control gap-2">
          <span class="label-text font-medium">Tryb uploadu</span>
          <select class="select select-bordered" bind:value={destination}>
            <option value="r2">R2 (presigned URL)</option>
            <option value="appwrite">Appwrite SDK</option>
          </select>
        </label>
      </div>

      <label class="label cursor-pointer justify-start gap-3 px-0">
        <input
          type="checkbox"
          class="checkbox checkbox-error"
          bind:checked={intentionallyMissingAuth}
        />
        <span class="label-text text-sm text-slate-700">
          Tryb testowy 401: wyslij bez naglowka Authorization
        </span>
      </label>

      <label class="label cursor-pointer justify-start gap-3 px-0">
        <input
          type="checkbox"
          class="checkbox checkbox-warning"
          bind:checked={intentionallyInvalidPayload}
          disabled={destination !== 'r2'}
        />
        <span class="label-text text-sm text-slate-700">
          Tryb testowy 400: wyslij zapytanie R2 bez `mime_type`
        </span>
      </label>

      <div class="flex flex-wrap items-center gap-3">
        <button class="btn btn-primary" type="submit" disabled={!canSubmit}>
          {isSubmitting ? 'Wysylanie...' : 'Uruchom upload'}
        </button>
        <p class="mono-data text-xs text-slate-600">
          {selectedFile
            ? `${selectedFile.name} | ${(selectedFile.size / 1024).toFixed(1)} KB`
            : 'Brak wybranego pliku'}
        </p>
      </div>

      {#if destination === 'appwrite' && !appwriteSessionUser}
        <p class="text-sm text-amber-700">
          Tryb Appwrite jest zablokowany do czasu zalogowania sesji Appwrite.
        </p>
      {/if}
    </form>
  </div>

  <div class="surface-glass grid-soft rounded-3xl p-6 md:p-8">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="flex flex-wrap items-center gap-3">
        <h3 class="text-2xl font-semibold text-slate-900">Ostatnie pliki</h3>
        <button class="btn btn-ghost btn-xs" onclick={toggleFilesSection}>
          {isFilesSectionOpen ? 'Ukryj liste' : 'Pokaz liste'}
        </button>
      </div>

      <label class="form-control gap-1">
        <span class="label-text text-xs uppercase tracking-[0.18em] text-slate-500">Filtr zrodla</span>
        <select class="select select-bordered select-sm" value={filesSourceFilter} onchange={onSourceFilterChange}>
          <option value="all">Wszystko</option>
          <option value="r2">R2</option>
          <option value="appwrite">Appwrite</option>
        </select>
      </label>

      {#if lastUploadId}
        <p class="mono-data text-xs text-teal-800/80">
          Ostatni sukces: {lastUploadId} ({lastMode})
        </p>
      {/if}
    </div>

    {#if !isFilesSectionOpen}
      <p class="mt-4 text-sm text-slate-600">Lista jest aktualnie zwinieta.</p>
    {:else if files.length === 0}
      <p class="mt-4 text-sm text-slate-600">
        Lista jest pusta dla wybranego filtra. Wykonaj upload albo kliknij "Odswiez pliki".
      </p>
    {:else}
      <div class="mt-4 overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Nazwa</th>
              <th>Docelowy storage</th>
              <th>Status</th>
              <th>Rozmiar</th>
            </tr>
          </thead>
          <tbody>
            {#each files as item (item.id)}
              <tr>
                <td class="font-medium text-slate-800">{item.filename}</td>
                <td class="uppercase tracking-wide text-slate-700">{item.destination}</td>
                <td>{@render statusChip(item.status)}</td>
                <td class="mono-data text-xs text-slate-700">{(item.size / 1024).toFixed(1)} KB</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  {#if toast}
    <div class="toast toast-top toast-end z-50 enter-fade">
      <div
        class={`alert ${toast.tone === 'success'
          ? 'alert-success'
          : toast.tone === 'error'
          ? 'alert-error'
          : 'alert-info'}`}
      >
        <span>{toast.message}</span>
      </div>
    </div>
  {/if}
</div>
