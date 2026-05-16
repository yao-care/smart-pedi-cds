<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    isOpen: boolean;
    title: string;
    onClose: () => void;
    children: Snippet;
  }

  let { isOpen, title, onClose, children }: Props = $props();

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={isOpen ? handleKeydown : undefined} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={handleBackdropClick} aria-hidden="true">
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div class="modal-header">
        <h2 id="modal-title" class="modal-title">{title}</h2>
        <button
          class="close-btn"
          type="button"
          aria-label="關閉對話框"
          onclick={onClose}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: oklch(0.22 0.015 60 / 0.55);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-4);
  }

  /* Fallback for browsers without oklch support */
  @supports not (color: oklch(0 0 0)) {
    .backdrop {
      background: rgba(51, 41, 29, 0.55);
    }
  }

  .modal {
    background: var(--bg);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    width: 100%;
    max-width: 540px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }

  .modal-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: color-mix(in srgb, var(--bg), var(--text) 5%);
    color: var(--text);
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .modal-body {
    padding: var(--space-6);
    overflow-y: auto;
    flex: 1;
  }
</style>
