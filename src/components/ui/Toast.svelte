<script lang="ts">
  interface Props {
    message: string;
    type?: 'success' | 'error' | 'info';
    duration?: number;
    onClose: () => void;
  }

  let { message, type = 'info', duration = 4000, onClose }: Props = $props();

  $effect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  });

  const iconMap = {
    success: `<path d="M5 10l4 4 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    error: `<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
    info: `<circle cx="10" cy="10" r="1" fill="currentColor"/><path d="M10 7v-1M10 13v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  };
</script>

<div class="toast toast-{type}" role="alert" aria-live="assertive" aria-atomic="true">
  <span class="toast-icon" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html iconMap[type]}
    </svg>
  </span>
  <p class="toast-message">{message}</p>
  <button
    class="toast-close"
    type="button"
    aria-label="關閉通知"
    onclick={onClose}
  >
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>
</div>

<style>
  .toast {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    min-width: 280px;
    max-width: 420px;
    animation: slide-in 0.2s ease-out;
    border-left: 4px solid currentColor;
  }

  @keyframes slide-in {
    from {
      transform: translateX(110%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .toast-success {
    background: var(--color-risk-normal-bg);
    color: var(--color-risk-normal);
  }

  .toast-error {
    background: var(--color-risk-critical-bg);
    color: var(--color-risk-critical);
  }

  .toast-info {
    background: var(--color-risk-advisory-bg);
    color: var(--color-risk-advisory);
  }

  .toast-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding-top: 1px;
  }

  .toast-message {
    flex: 1;
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--color-text-base);
  }

  .toast-close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin: -10px -10px -10px 0;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .toast-close:hover {
    background: var(--bg-muted);
  }

  .toast-close:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
