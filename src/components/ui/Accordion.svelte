<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    defaultOpen?: boolean;
    children: Snippet;
  }

  let { title, defaultOpen = false, children }: Props = $props();

  // svelte-ignore state_referenced_locally
  // `defaultOpen` is used as the initial value only; further changes should not
  // re-open the accordion. The warning flags this pattern but it is intended here.
  let open = $state(defaultOpen);

  function toggle() {
    open = !open;
  }
</script>

<details class="accordion" bind:open>
  <summary
    class="accordion-summary"
    onclick={(e) => { e.preventDefault(); toggle(); }}
    aria-expanded={open}
  >
    <span class="accordion-title">{title}</span>
    <span class="accordion-chevron" aria-hidden="true">
      <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        style="transform: rotate({open ? 180 : 0}deg); transition: transform 0.2s ease;"
      >
        <path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
  </summary>
  <div class="accordion-body">
    {@render children()}
  </div>
</details>

<style>
  .accordion {
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--bg-base);
    overflow: hidden;
  }

  .accordion-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    user-select: none;
    list-style: none;
    min-height: 44px;
    background: var(--bg-surface);
    transition: background-color 0.15s ease;
  }

  .accordion-summary::-webkit-details-marker {
    display: none;
  }

  .accordion-summary:hover {
    background: var(--bg-muted);
  }

  .accordion-summary:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .accordion-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-base);
  }

  .accordion-chevron {
    display: flex;
    align-items: center;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .accordion-body {
    padding: var(--space-4);
    border-top: 1px solid var(--border-default);
    color: var(--color-text-base);
  }
</style>
