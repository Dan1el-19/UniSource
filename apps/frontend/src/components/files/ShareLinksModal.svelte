<script lang="ts">
  import { onMount } from 'svelte';
  import { spring } from 'svelte/motion';
  import {
    Check,
    Clock3,
    Copy,
    ExternalLink,
    Eye,
    EyeOff,
    Link2,
    LoaderCircle,
    Lock,
    Plus,
    Power,
    Share2,
    Trash2,
    X,
  } from 'lucide-svelte';
  import type { ShareLink, ShareLinkCreateRequest } from '@unisource/sdk';
  import { apiClient } from '../../lib/api';

  let {
    fileId,
    filename,
    onclose,
  } = $props<{
    fileId: string;
    filename: string;
    onclose: () => void;
  }>();

  const shareBase = `${typeof window !== 'undefined' ? window.location.origin : ''}/s/`;

  let links = $state<ShareLink[]>([]);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let busyLinkId = $state<string | null>(null);
  let copiedLinkId = $state<string | null>(null);

  let showCreateForm = $state(false);
  let createName = $state('');
  let createSlug = $state('');
  let createPassword = $state('');
  let createShowPassword = $state(false);
  let createExpiry = $state('');
  let createMaxDownloads = $state('');
  let isCreating = $state(false);
  let createError = $state<string | null>(null);

  const scale = spring(0.95, { stiffness: 0.12, damping: 0.7 });
  const opacity = spring(0, { stiffness: 0.2, damping: 1 });

  onMount(() => {
    scale.set(1);
    opacity.set(1);
    loadLinks();
  });

  async function loadLinks() {
    isLoading = true;
    loadError = null;
    try {
      const res = await apiClient.shareLinks.list(fileId);
      links = res.items;
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Nie udało się pobrać linków.';
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  function handleClose() {
    scale.set(0.97);
    opacity.set(0);
    setTimeout(() => onclose(), 140);
  }

  function getLinkUrl(link: ShareLink) {
    return `${shareBase}${link.slug}`;
  }

  async function copyLink(link: ShareLink) {
    try {
      await navigator.clipboard.writeText(getLinkUrl(link));
      copiedLinkId = link.id;
      setTimeout(() => {
        if (copiedLinkId === link.id) copiedLinkId = null;
      }, 1800);
    } catch {
      actionError = 'Nie udało się skopiować linku do schowka.';
    }
  }

  function openLink(link: ShareLink) {
    window.open(getLinkUrl(link), '_blank', 'noopener,noreferrer');
  }

  async function toggleActive(link: ShareLink) {
    actionError = null;
    busyLinkId = link.id;
    try {
      const updated = await apiClient.shareLinks.update(link.id, { is_active: !link.is_active });
      links = links.map((item) => (item.id === link.id ? updated.link : item));
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Nie udało się zmienić statusu linku.';
    } finally {
      busyLinkId = null;
    }
  }

  async function deleteLink(link: ShareLink) {
    actionError = null;
    busyLinkId = link.id;
    try {
      await apiClient.shareLinks.delete(link.id);
      links = links.filter((item) => item.id !== link.id);
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Nie udało się usunąć linku.';
    } finally {
      busyLinkId = null;
    }
  }

  function dateToUnix(dateStr: string): number | undefined {
    if (!dateStr) return undefined;
    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? undefined : Math.floor(date.getTime() / 1000);
  }

  async function handleCreate() {
    if (isCreating) return;
    isCreating = true;
    createError = null;
    actionError = null;

    try {
      const body: ShareLinkCreateRequest = {};
      if (createName.trim()) body.name = createName.trim();
      if (createSlug.trim()) body.slug = createSlug.trim();
      if (createPassword.trim()) body.password = createPassword.trim();
      if (createExpiry) {
        const ts = dateToUnix(createExpiry);
        if (ts) body.expires_at = ts;
      }
      if (createMaxDownloads.trim()) {
        const count = parseInt(createMaxDownloads, 10);
        if (!Number.isNaN(count) && count > 0) body.max_downloads = count;
      }

      const res = await apiClient.shareLinks.create(fileId, body);
      links = [res.link, ...links];

      createName = '';
      createSlug = '';
      createPassword = '';
      createExpiry = '';
      createMaxDownloads = '';
      showCreateForm = false;
    } catch (err) {
      createError = err instanceof Error ? err.message : 'Nie udało się utworzyć linku.';
    } finally {
      isCreating = false;
    }
  }

  function formatExpiry(ts: number | null) {
    if (!ts) return 'Bez terminu';
    return new Date(ts * 1000).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function slugPreview(slug: string) {
    return slug.trim() ? `/s/${slug.trim()}` : '/s/…losowy…';
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="modal-backdrop"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) handleClose();
  }}
></div>

<div
  class="modal glass"
  role="dialog"
  aria-modal="true"
  aria-label="Linki udostępniania"
  tabindex="-1"
  style="transform: scale({$scale}); opacity: {$opacity};"
>
  <div class="modal-header">
    <div class="modal-title-row">
      <div class="modal-icon"><Share2 size={18} /></div>
      <div>
        <h2 class="modal-title">Linki udostępniania</h2>
        <p class="modal-sub">{filename}</p>
      </div>
    </div>
    <button class="close-btn" type="button" onclick={handleClose} aria-label="Zamknij">
      <X size={18} />
    </button>
  </div>

  <div class="modal-body">
    <section class="summary-panel glass-inner">
      <div>
        <span class="eyebrow">Public Share</span>
        <h3>{filename}</h3>
        <p>Każdy link ma własny slug, hasło, termin wygaśnięcia i limit pobrań.</p>
      </div>
      <div class="summary-stats">
        <div class="summary-stat">
          <strong>{links.length}</strong>
          <span>linków łącznie</span>
        </div>
        <div class="summary-stat">
          <strong>{links.filter((link) => link.has_password).length}</strong>
          <span>chronionych hasłem</span>
        </div>
      </div>
    </section>

    {#if loadError}
      <div class="banner banner-error" role="alert">{loadError}</div>
    {/if}

    {#if actionError}
      <div class="banner banner-error" role="alert">{actionError}</div>
    {/if}

    {#if isLoading}
      <div class="loading-row">
        <div class="spin"><LoaderCircle size={24} /></div>
      </div>
    {:else}
      {#if links.length > 0}
        <div class="links-stack">
          {#each links as link (link.id)}
            <article class="link-card glass-inner" class:is-inactive={!link.is_active}>
              <div class="card-top">
                <div class="card-copy">
                  <div class="badge-row">
                    <span class="status-pill {link.is_active ? 'is-active' : 'is-muted'}">
                      <Power size={12} />
                      {link.is_active ? 'Aktywny' : 'Nieaktywny'}
                    </span>
                    {#if link.has_password}
                      <span class="status-pill"><Lock size={12} /> Hasło</span>
                    {/if}
                  </div>
                  <h3 class="link-title">{link.name || 'Publiczny link do pliku'}</h3>
                </div>

                <button
                  class="icon-btn"
                  class:is-copied={copiedLinkId === link.id}
                  type="button"
                  onclick={() => copyLink(link)}
                  aria-label="Kopiuj link"
                  disabled={busyLinkId === link.id}
                >
                  {#if copiedLinkId === link.id}
                    <Check size={15} />
                  {:else}
                    <Copy size={15} />
                  {/if}
                </button>
              </div>

              <div class="url-panel">
                <span class="field-caption">Adres publiczny</span>
                <div class="url-box">
                  <Link2 size={14} />
                  <input class="url-input" type="text" readonly value={getLinkUrl(link)} />
                </div>
              </div>

              <div class="stat-grid">
                <div class="stat-card">
                  <span>Pobrania</span>
                  <strong>
                    {link.download_count}
                    {#if link.max_downloads}
                      / {link.max_downloads}
                    {/if}
                  </strong>
                </div>

                <div class="stat-card">
                  <span>Wygasa</span>
                  <strong>{formatExpiry(link.expires_at)}</strong>
                </div>
              </div>

              <div class="card-actions">
                <button class="secondary-btn" type="button" onclick={() => openLink(link)}>
                  <ExternalLink size={15} />
                  Otwórz
                </button>
                <button
                  class="secondary-btn"
                  type="button"
                  onclick={() => toggleActive(link)}
                  disabled={busyLinkId === link.id}
                >
                  <Power size={15} />
                  {link.is_active ? 'Wyłącz' : 'Włącz'}
                </button>
                <button
                  class="danger-btn"
                  type="button"
                  onclick={() => deleteLink(link)}
                  disabled={busyLinkId === link.id}
                >
                  <Trash2 size={15} />
                  Usuń
                </button>
              </div>
            </article>
          {/each}
        </div>
      {:else if !showCreateForm}
        <div class="empty-links glass-inner">
          <Share2 size={28} />
          <p>Brak linków. Utwórz pierwszy link udostępniania.</p>
        </div>
      {/if}

      {#if !showCreateForm}
        <div class="composer-preview glass-inner">
          <div>
            <span class="eyebrow">Nowy link</span>
            <h3>Skonfiguruj własny dostęp</h3>
            <p>Slug, hasło, termin i limit pobrań ustawiasz ręcznie dla każdego odbiorcy.</p>
          </div>
          <button class="add-btn" type="button" onclick={() => (showCreateForm = true)}>
            <Plus size={16} />
            Nowy link
          </button>
        </div>
      {:else}
        <div class="create-form glass-inner">
          <div class="form-header">
            <div>
              <span class="eyebrow">Composer</span>
              <h3 class="form-title">Nowy link udostępniania</h3>
            </div>
            <span class="form-note">Pełna konfiguracja bez presetów.</span>
          </div>

          {#if createError}
            <div class="banner banner-error" role="alert">{createError}</div>
          {/if}

          <div class="field">
            <label class="field-label" for="create-name">Nazwa linku <span class="optional">(opcjonalnie)</span></label>
            <input
              id="create-name"
              class="field-input"
              type="text"
              placeholder="np. Dla klienta ABC"
              maxlength="128"
              bind:value={createName}
            />
          </div>

          <div class="field">
            <label class="field-label" for="create-slug">
              Własny slug <span class="optional">(opcjonalnie)</span>
            </label>
            <input
              id="create-slug"
              class="field-input"
              type="text"
              placeholder="moj-plik"
              maxlength="64"
              bind:value={createSlug}
            />
            <span class="field-hint">{slugPreview(createSlug)}</span>
          </div>

          <div class="field">
            <label class="field-label" for="create-password">
              Hasło <span class="optional">(opcjonalnie)</span>
            </label>
            <div class="password-wrap">
              <input
                id="create-password"
                class="field-input"
                type={createShowPassword ? 'text' : 'password'}
                placeholder="Zostaw puste, by udostępnić bez hasła"
                bind:value={createPassword}
              />
              <button
                class="show-toggle"
                type="button"
                onclick={() => (createShowPassword = !createShowPassword)}
                aria-label={createShowPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
              >
                {#if createShowPassword}
                  <EyeOff size={15} />
                {:else}
                  <Eye size={15} />
                {/if}
              </button>
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label class="field-label" for="create-expiry">Data wygaśnięcia</label>
              <div class="field-inline">
                <Clock3 size={15} />
                <input
                  id="create-expiry"
                  class="field-input is-inline"
                  type="date"
                  bind:value={createExpiry}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="create-max-dl">Limit pobrań</label>
              <input
                id="create-max-dl"
                class="field-input"
                type="number"
                min="1"
                placeholder="∞"
                bind:value={createMaxDownloads}
              />
            </div>
          </div>

          <div class="form-actions">
            <button
              class="btn-secondary"
              type="button"
              onclick={() => {
                showCreateForm = false;
                createError = null;
              }}
              disabled={isCreating}
            >
              Anuluj
            </button>
            <button class="btn-primary" type="button" onclick={handleCreate} disabled={isCreating}>
              {#if isCreating}
                <div class="spin-sm"><LoaderCircle size={14} /></div>
              {/if}
              Utwórz link
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: color-mix(in oklab, #000 52%, transparent);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .modal {
    position: fixed;
    z-index: 71;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    width: min(720px, calc(100vw - 2 * var(--space-3)));
    max-height: min(92dvh, 780px);
    border-radius: var(--radius-xl);
    border-color: var(--color-glass-border);
    display: flex;
    flex-direction: column;
    box-shadow: 0 40px 80px color-mix(in oklab, #000 44%, transparent);
    transform-origin: center;
    will-change: transform, opacity;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .modal-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .modal-icon {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--color-accent-muted) 80%, transparent);
    border: 1px solid var(--color-border-default);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-primary);
    flex-shrink: 0;
  }

  .modal-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-primary);
    line-height: 1.2;
  }

  .modal-sub {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 260px;
  }

  .close-btn,
  .icon-btn,
  .show-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-secondary);
    transition: all var(--duration-fast) var(--ease-in-out);
  }

  .close-btn,
  .icon-btn {
    width: 34px;
    height: 34px;
    border: 1px solid transparent;
  }

  .close-btn:hover,
  .icon-btn:hover:not(:disabled),
  .show-toggle:hover {
    background: var(--color-accent-muted);
    color: var(--color-text-primary);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .glass-inner {
    background: color-mix(in oklab, var(--color-bg-elevated) 70%, transparent);
    border: 1px solid var(--color-border-subtle);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .summary-panel,
  .composer-preview,
  .create-form,
  .link-card {
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .summary-panel {
    background:
      radial-gradient(circle at top right, color-mix(in oklab, var(--color-accent) 16%, transparent), transparent 36%),
      color-mix(in oklab, var(--color-bg-elevated) 72%, transparent);
  }

  .summary-panel h3,
  .link-title,
  .form-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .summary-panel p,
  .composer-preview p,
  .form-note,
  .summary-stat span,
  .stat-card span,
  .field-caption,
  .empty-links {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .eyebrow {
    display: inline-flex;
    width: fit-content;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-tertiary);
  }

  .summary-stats,
  .links-stack,
  .stat-grid,
  .field-row {
    display: grid;
    gap: var(--space-3);
  }

  .summary-stats,
  .stat-grid {
    grid-template-columns: 1fr;
  }

  .summary-stat,
  .stat-card {
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in oklab, var(--color-bg-overlay) 82%, transparent);
    padding: var(--space-3);
    display: grid;
    gap: 4px;
  }

  .summary-stat strong,
  .stat-card strong {
    color: var(--color-text-primary);
    font-size: var(--text-base);
  }

  .banner {
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    font-size: var(--text-sm);
    padding: 10px 12px;
  }

  .banner-error {
    border-color: color-mix(in oklab, var(--color-danger) 30%, transparent);
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    color: color-mix(in oklab, var(--color-danger) 90%, #fff);
  }

  .loading-row {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6) 0;
  }

  .spin,
  .spin-sm {
    animation: spin 900ms linear infinite;
  }

  .spin-sm {
    display: inline-flex;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .card-top,
  .card-actions,
  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .card-top {
    align-items: flex-start;
  }

  .card-copy {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
    padding: 5px 10px;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--color-bg-overlay) 82%, transparent);
    border: 1px solid var(--color-border-subtle);
    color: var(--color-text-secondary);
    font-size: 11px;
  }

  .status-pill.is-active {
    background: color-mix(in oklab, var(--color-success) 14%, transparent);
    color: var(--color-success);
  }

  .status-pill.is-muted {
    background: color-mix(in oklab, var(--color-danger) 12%, transparent);
    color: var(--color-danger);
  }

  .link-card.is-inactive {
    opacity: 0.62;
  }

  .url-panel {
    display: grid;
    gap: 6px;
  }

  .url-box {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: var(--space-2);
    align-items: center;
    padding: 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: color-mix(in oklab, var(--color-bg-surface) 86%, transparent);
  }

  .url-input {
    min-width: 0;
    border: none;
    background: transparent;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    outline: none;
  }

  .icon-btn.is-copied {
    color: var(--color-success);
  }

  .composer-preview {
    align-items: flex-start;
  }

  .empty-links {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-4);
  }

  .field,
  .field-inline {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .optional {
    font-weight: 400;
    color: var(--color-text-tertiary);
  }

  .field-input {
    height: 42px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    padding: 0 var(--space-3);
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .field-input:focus {
    border-color: var(--color-border-strong);
    box-shadow: 0 0 0 3px var(--color-accent-muted);
  }

  .field-inline {
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: var(--color-bg-elevated);
    padding-inline: var(--space-3);
    flex-direction: row;
    align-items: center;
  }

  .field-input.is-inline {
    border: none;
    background: transparent;
    padding-left: 0;
    box-shadow: none;
  }

  .field-hint {
    font-size: 11px;
    color: var(--color-text-tertiary);
    font-family: var(--font-mono);
  }

  .password-wrap {
    position: relative;
  }

  .password-wrap .field-input {
    padding-right: 40px;
  }

  .show-toggle {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    padding: 4px;
  }

  .form-actions,
  .card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .secondary-btn,
  .danger-btn,
  .add-btn,
  .btn-primary,
  .btn-secondary {
    min-height: 40px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    font-size: var(--text-sm);
    font-weight: 600;
    transition: opacity var(--duration-fast) var(--ease-in-out);
  }

  .secondary-btn,
  .btn-secondary {
    background: transparent;
    color: var(--color-text-primary);
  }

  .danger-btn {
    background: color-mix(in oklab, var(--color-danger) 10%, transparent);
    border-color: color-mix(in oklab, var(--color-danger) 24%, transparent);
    color: var(--color-danger);
  }

  .add-btn,
  .btn-primary {
    background: var(--color-accent);
    color: var(--color-text-on-accent);
  }

  .secondary-btn,
  .danger-btn,
  .btn-secondary,
  .btn-primary {
    flex: 1;
  }

  .secondary-btn:disabled,
  .danger-btn:disabled,
  .add-btn:disabled,
  .btn-primary:disabled,
  .btn-secondary:disabled,
  .icon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (min-width: 720px) {
    .summary-stats,
    .stat-grid,
    .field-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .modal {
      width: min(100vw - 12px, 720px);
      max-height: 96dvh;
    }

    .modal-header,
    .modal-body {
      padding-inline: var(--space-3);
    }

    .card-actions {
      flex-direction: column;
    }

    .modal-sub {
      max-width: 180px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin,
    .spin-sm {
      animation: none;
    }
  }
</style>
