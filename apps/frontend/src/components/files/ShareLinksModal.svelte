<script lang="ts">
  import { onMount } from 'svelte';
  import { spring } from 'svelte/motion';
  import {
    Check,
    Copy,
    Eye,
    EyeOff,
    Link2,
    LoaderCircle,
    Lock,
    Plus,
    Share2,
    ToggleLeft,
    ToggleRight,
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

  // State
  let links = $state<ShareLink[]>([]);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let busyLinkId = $state<string | null>(null);
  let copiedLinkId = $state<string | null>(null);

  // Create form
  let showCreateForm = $state(false);
  let createName = $state('');
  let createSlug = $state('');
  let createPassword = $state('');
  let createShowPassword = $state(false);
  let createExpiry = $state('');
  let createMaxDownloads = $state('');
  let isCreating = $state(false);
  let createError = $state<string | null>(null);

  // Spring animation
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

  async function copyLink(link: ShareLink) {
    const url = `${shareBase}${link.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      copiedLinkId = link.id;
      setTimeout(() => { if (copiedLinkId === link.id) copiedLinkId = null; }, 1800);
    } catch {
      // fallback: select text
    }
  }

  async function toggleActive(link: ShareLink) {
    busyLinkId = link.id;
    try {
      const updated = await apiClient.shareLinks.update(link.id, { is_active: !link.is_active });
      links = links.map((l) => (l.id === link.id ? updated.link : l));
    } catch {
      // silently ignore
    } finally {
      busyLinkId = null;
    }
  }

  async function deleteLink(link: ShareLink) {
    busyLinkId = link.id;
    try {
      await apiClient.shareLinks.delete(link.id);
      links = links.filter((l) => l.id !== link.id);
    } catch {
      // silently ignore
    } finally {
      busyLinkId = null;
    }
  }

  function dateToUnix(dateStr: string): number | undefined {
    if (!dateStr) return undefined;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? undefined : Math.floor(d.getTime() / 1000);
  }

  async function handleCreate() {
    if (isCreating) return;
    isCreating = true;
    createError = null;

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
        const n = parseInt(createMaxDownloads, 10);
        if (!isNaN(n) && n > 0) body.max_downloads = n;
      }

      const res = await apiClient.shareLinks.create(fileId, body);
      links = [res.link, ...links];

      // Reset form
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
    if (!ts) return null;
    return new Date(ts * 1000).toLocaleDateString('pl-PL', { dateStyle: 'medium' });
  }

  function slugPreview(slug: string) {
    return slug.trim() ? `/s/${slug.trim()}` : '/s/…losowy…';
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="modal-backdrop"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
></div>

<div
  class="modal glass"
  role="dialog"
  aria-modal="true"
  aria-label="Udostępnij plik"
  tabindex="-1"
  style="transform: scale({$scale}); opacity: {$opacity};"
>
    <!-- Header -->
    <div class="modal-header">
      <div class="modal-title-row">
        <div class="modal-icon"><Share2 size={18} /></div>
        <div>
          <h2 class="modal-title">Udostępnij plik</h2>
          <p class="modal-sub">{filename}</p>
        </div>
      </div>
      <button class="close-btn" type="button" onclick={handleClose} aria-label="Zamknij">
        <X size={18} />
      </button>
    </div>

    <!-- Body -->
    <div class="modal-body">
      {#if loadError}
        <div class="banner banner-error" role="alert">{loadError}</div>
      {/if}

      {#if isLoading}
        <div class="loading-row">
          <div class="spin"><LoaderCircle size={24} /></div>
        </div>
      {:else}
        <!-- Existing links -->
        {#if links.length > 0}
          <div class="links-list">
            {#each links as link (link.id)}
              <div class="link-card glass-inner" class:is-inactive={!link.is_active}>
                <div class="link-top">
                  <div class="link-info">
                    <div class="link-url-row">
                      <Link2 size={13} />
                      <span class="link-url">{shareBase}{link.slug}</span>
                    </div>
                    {#if link.name}
                      <span class="link-name">„{link.name}"</span>
                    {/if}
                  </div>

                  <div class="link-actions">
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

                    <button
                      class="icon-btn"
                      class:is-active-toggle={link.is_active}
                      type="button"
                      onclick={() => toggleActive(link)}
                      aria-label={link.is_active ? 'Dezaktywuj' : 'Aktywuj'}
                      disabled={busyLinkId === link.id}
                    >
                      {#if link.is_active}
                        <ToggleRight size={15} />
                      {:else}
                        <ToggleLeft size={15} />
                      {/if}
                    </button>

                    <button
                      class="icon-btn is-danger"
                      type="button"
                      onclick={() => deleteLink(link)}
                      aria-label="Usuń link"
                      disabled={busyLinkId === link.id}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div class="link-meta">
                  {#if link.has_password}
                    <span class="meta-badge"><Lock size={10} /> Hasło</span>
                  {/if}
                  {#if link.expires_at}
                    <span class="meta-badge">Wygasa {formatExpiry(link.expires_at)}</span>
                  {/if}
                  {#if link.max_downloads}
                    <span class="meta-badge">{link.download_count}/{link.max_downloads} pobrań</span>
                  {/if}
                  {#if !link.is_active}
                    <span class="meta-badge is-inactive-badge">Nieaktywny</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else if !showCreateForm}
          <div class="empty-links">
            <Share2 size={28} />
            <p>Brak linków. Utwórz pierwszy link udostępniania.</p>
          </div>
        {/if}

        <!-- Create form toggle -->
        {#if !showCreateForm}
          <button
            class="add-btn"
            type="button"
            onclick={() => (showCreateForm = true)}
          >
            <Plus size={16} />
            Nowy link
          </button>
        {:else}
          <div class="create-form glass-inner">
            <h3 class="form-title">Nowy link udostępniania</h3>

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
                  placeholder="Zostaw puste, by bez hasła"
                  bind:value={createPassword}
                />
                <button
                  class="show-toggle"
                  type="button"
                  onclick={() => (createShowPassword = !createShowPassword)}
                  aria-label={createShowPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                >
                  {#if createShowPassword}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
                </button>
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <label class="field-label" for="create-expiry">Data wygaśnięcia</label>
                <input
                  id="create-expiry"
                  class="field-input"
                  type="date"
                  bind:value={createExpiry}
                  min={new Date().toISOString().split('T')[0]}
                />
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
                onclick={() => { showCreateForm = false; createError = null; }}
                disabled={isCreating}
              >
                Anuluj
              </button>
              <button
                class="btn-primary"
                type="button"
                onclick={handleCreate}
                disabled={isCreating}
              >
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
    width: min(520px, calc(100vw - 2 * var(--space-4)));
    max-height: min(88dvh, 680px);
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
    padding: var(--space-4) var(--space-5);
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
    width: 36px;
    height: 36px;
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
    max-width: 240px;
  }

  .close-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) var(--ease-in-out);
  }

  .close-btn:hover {
    background: var(--color-accent-muted);
    border-color: var(--color-border-default);
    color: var(--color-text-primary);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .loading-row {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6) 0;
  }

  .spin {
    animation: spin 900ms linear infinite;
    color: var(--color-text-secondary);
  }

  .spin-sm {
    animation: spin 900ms linear infinite;
    display: inline-flex;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .banner {
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    font-size: var(--text-sm);
    padding: 9px 12px;
  }

  .banner-error {
    border-color: color-mix(in oklab, var(--color-danger) 30%, transparent);
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    color: color-mix(in oklab, var(--color-danger) 90%, #fff);
  }

  .links-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .link-card {
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    transition: opacity var(--duration-fast) var(--ease-in-out);
  }

  .link-card.is-inactive {
    opacity: 0.55;
  }

  .glass-inner {
    background: color-mix(in oklab, var(--color-bg-elevated) 68%, transparent);
    border: 1px solid var(--color-border-subtle);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .link-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .link-info {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .link-url-row {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--color-text-secondary);
  }

  .link-url {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-name {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .link-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .icon-btn {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) var(--ease-in-out);
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--color-accent-muted);
    border-color: var(--color-border-default);
    color: var(--color-text-primary);
  }

  .icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .icon-btn.is-copied {
    color: var(--color-success);
  }

  .icon-btn.is-active-toggle {
    color: var(--color-success);
  }

  .icon-btn.is-danger:hover:not(:disabled) {
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    border-color: color-mix(in oklab, var(--color-danger) 24%, transparent);
    color: var(--color-danger);
  }

  .link-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .meta-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 20px;
    padding: 0 7px;
    border-radius: var(--radius-full);
    font-size: 10px;
    font-weight: 500;
    background: color-mix(in oklab, var(--color-bg-overlay) 80%, transparent);
    border: 1px solid var(--color-border-subtle);
    color: var(--color-text-secondary);
  }

  .meta-badge.is-inactive-badge {
    background: color-mix(in oklab, var(--color-danger) 12%, transparent);
    border-color: color-mix(in oklab, var(--color-danger) 20%, transparent);
    color: var(--color-danger);
  }

  .empty-links {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-5) 0 var(--space-2);
    color: var(--color-text-secondary);
    text-align: center;
    font-size: var(--text-sm);
  }

  .add-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 40px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px dashed var(--color-border-default);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    transition: all var(--duration-fast) var(--ease-in-out);
    width: 100%;
    justify-content: center;
  }

  .add-btn:hover {
    background: var(--color-accent-muted);
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
  }

  .create-form {
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .form-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: 1;
  }

  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
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
    height: 38px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    padding: 0 var(--space-3);
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color var(--duration-fast) var(--ease-in-out),
                box-shadow var(--duration-fast) var(--ease-in-out);
  }

  .field-input:focus {
    border-color: var(--color-border-strong);
    box-shadow: 0 0 0 3px var(--color-accent-muted);
  }

  .field-hint {
    font-size: 10px;
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
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: var(--radius-sm);
  }

  .show-toggle:hover { color: var(--color-text-primary); }

  .form-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    padding-top: var(--space-1);
  }

  .btn-primary,
  .btn-secondary {
    height: 38px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    transition: opacity var(--duration-fast) var(--ease-in-out);
  }

  .btn-primary {
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    border: 1px solid var(--color-border-default);
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.88; }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  .btn-secondary {
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-default);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--color-accent-muted);
    color: var(--color-text-primary);
  }

  .btn-secondary:disabled { opacity: 0.45; cursor: not-allowed; }

  @media (max-width: 480px) {
    .field-row {
      grid-template-columns: 1fr;
    }

    .modal-sub { max-width: 160px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal { transition-duration: 0.01ms; }
    .spin, .spin-sm { animation: none; }
  }
</style>
