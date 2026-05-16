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
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    line-height: 1.4;
    white-space: nowrap;
  }

  .badge-default {
    background: color-mix(in srgb, var(--bg), var(--text) 5%);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }

  .badge-normal {
    background: color-mix(in srgb, var(--accent) 12%, var(--bg));
    color: var(--accent);
  }

  .badge-advisory {
    background: color-mix(in srgb, var(--warn) 12%, var(--bg));
    color: var(--warn);
  }

  .badge-warning {
    background: color-mix(in srgb, var(--warn) 12%, var(--bg));
    color: var(--warn);
  }

  .badge-critical {
    background: color-mix(in srgb, var(--danger) 14%, var(--bg));
    color: var(--danger);
  }
</style>
