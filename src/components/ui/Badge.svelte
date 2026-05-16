<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'normal' | 'advisory' | 'warning' | 'critical' | 'default';
    children: Snippet;
  }

  let { variant = 'default', children }: Props = $props();
</script>

<span class="badge badge-{variant}">
  {@render children()}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
  }

  .badge-default {
    background: var(--bg-muted);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }

  .badge-normal {
    background: var(--color-risk-normal-bg);
    color: var(--accent);
  }

  .badge-advisory {
    background: var(--color-risk-advisory-bg);
    color: var(--warn);
  }

  .badge-warning {
    background: var(--color-risk-warning-bg);
    color: var(--warn);
  }

  .badge-critical {
    background: var(--color-risk-critical-bg);
    color: var(--danger);
  }
</style>
