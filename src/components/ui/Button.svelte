<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    type?: 'button' | 'submit';
    onclick?: () => void;
    children: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    type = 'button',
    onclick,
    children,
  }: Props = $props();
</script>

<button class="btn btn-{variant} btn-{size}" {disabled} {type} {onclick}>
  {@render children()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border: none;
    border-radius: var(--radius-md);
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: background-color 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
    min-height: 44px;
    min-width: 44px;
    white-space: nowrap;
    user-select: none;
  }

  .btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* Variants */
  .btn-primary {
    background: var(--color-accent);
    color: var(--color-text-inverse);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  .btn-secondary {
    background: var(--bg-surface);
    color: var(--color-text-base);
    border: 1px solid var(--border-default);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-muted);
  }

  .btn-danger {
    background: var(--color-risk-critical);
    color: var(--color-text-inverse);
  }
  .btn-danger:hover:not(:disabled) {
    opacity: 0.85;
  }

  .btn-ghost {
    background: transparent;
    color: var(--color-text-base);
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--bg-muted);
  }

  /* Sizes */
  .btn-sm {
    padding: var(--space-1) var(--space-3);
    font-size: 0.75rem;
    min-height: 44px;
  }
  .btn-md {
    padding: var(--space-2) var(--space-4);
    font-size: 0.875rem;
  }
  .btn-lg {
    padding: var(--space-3) var(--space-6);
    font-size: 1rem;
  }
</style>
