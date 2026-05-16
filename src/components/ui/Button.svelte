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
    border-radius: var(--radius-lg);
    font-family: inherit;
    font-weight: var(--font-medium);
    cursor: pointer;
    text-decoration: none;
    transition:
      background-color 0.18s ease,
      color 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.1s ease,
      opacity 0.15s ease;
    min-height: 44px;
    min-width: 44px;
    white-space: nowrap;
    user-select: none;
  }

  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px var(--state-focus-ring);
  }

  .btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* Primary — rose fill, white text, shadow rest, hover darkens + lifts */
  .btn-primary {
    background: var(--accent);
    color: white;
    box-shadow: var(--shadow-sm);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
    box-shadow: var(--shadow-md);
  }

  /* Secondary — transparent fill with strong border, becomes accent on hover */
  .btn-secondary {
    background: transparent;
    color: var(--text);
    border: 1.5px solid var(--border-strong);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--state-hover-surface);
    border-color: var(--accent);
    color: var(--accent);
  }

  /* Danger — risk-critical fill */
  .btn-danger {
    background: var(--danger);
    color: white;
    box-shadow: var(--shadow-sm);
  }
  .btn-danger:hover:not(:disabled) {
    box-shadow: var(--shadow-md);
    opacity: 0.92;
  }

  /* Ghost — invisible by default, accent text + soft hover bg */
  .btn-ghost {
    background: transparent;
    color: var(--accent);
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--state-hover-surface);
  }

  /* Sizes */
  .btn-sm {
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-xs);
    min-height: 44px;
  }
  .btn-md {
    padding: var(--space-3) var(--space-5);
    font-size: var(--text-sm);
  }
  .btn-lg {
    padding: var(--space-4) var(--space-7);
    font-size: var(--text-base);
    min-height: 56px;
  }
</style>
