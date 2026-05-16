<script lang="ts">
  import type { Snippet } from 'svelte';
  import { authStore } from '../../lib/stores/auth.svelte';
  import StandaloneLaunch from '../fhir/StandaloneLaunch.svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
  let showSetup = $state(false);
  let skipFhir = $state(false);
</script>

{#if authStore.isAuthenticated || skipFhir}
  {@render children()}
{:else}
  <div class="fhir-setup">
    <div class="fhir-prompt">
      <h3>連線醫院系統（選填）</h3>
      <p>連線後評估結果將自動傳送至醫院。您也可以跳過此步驟，評估結果將僅保存在本機。</p>
      <div class="fhir-actions">
        <button class="btn-connect" onclick={() => showSetup = true}>連線 FHIR Server</button>
        <button class="btn-skip" onclick={() => skipFhir = true}>跳過，稍後再連</button>
      </div>
      {#if showSetup}
        <div class="fhir-form">
          <StandaloneLaunch />
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .fhir-setup {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
  }

  .fhir-prompt {
    text-align: center;
    max-width: 480px;
    padding: var(--space-8);
  }

  .fhir-prompt h3 {
    font-size: var(--text-xl);
    margin-bottom: var(--space-3);
  }

  .fhir-prompt p {
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    margin-bottom: var(--space-6);
    font-size: var(--text-sm);
  }

  .fhir-actions {
    display: flex;
    gap: var(--space-4);
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn-connect {
    padding: var(--space-3) var(--space-6);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    min-height: 44px;
  }

  .btn-connect:hover {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .btn-skip {
    padding: var(--space-3) var(--space-6);
    background: var(--surface);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    cursor: pointer;
    min-height: 44px;
  }

  .btn-skip:hover {
    background: var(--bg-muted);
  }

  .fhir-form {
    margin-top: var(--space-6);
    text-align: left;
  }
</style>
