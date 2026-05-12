<script lang="ts">
  import PatientList from '../dashboard/PatientList.svelte';
  import RiskSummary from '../dashboard/RiskSummary.svelte';
  import PatientView from '../patient/PatientView.svelte';
  import AlertFeed from '../dashboard/AlertFeed.svelte';
  import AlertManager from '../alerts/AlertManager.svelte';
  import { patientStore } from '../../lib/stores/patients.svelte';
  import StandaloneLaunch from '../fhir/StandaloneLaunch.svelte';
  import { authStore } from '../../lib/stores/auth.svelte';

  let activeTab = $state<'overview' | 'patient' | 'alerts'>('overview');
  let sidebarOpen = $state(true);

  const hasSelectedPatient = $derived(patientStore.selectedPatientId !== null);

  // Auto-switch to patient tab when a patient is selected
  $effect(() => {
    if (hasSelectedPatient) {
      activeTab = 'patient';
    }
  });
</script>

<div class="workspace">
  {#if !authStore.isAuthenticated}
    <div class="fhir-connect-prompt">
      <h2>連線 FHIR Server</h2>
      <p>請先連線至醫院 FHIR Server 以載入病患資料。</p>
      <StandaloneLaunch />
    </div>
  {:else}
    <button
      class="sidebar-toggle"
      onclick={() => sidebarOpen = !sidebarOpen}
      aria-label={sidebarOpen ? '收合側邊欄' : '展開側邊欄'}
    >
      {sidebarOpen ? '◀' : '▶'}
    </button>

    {#if sidebarOpen}
      <aside class="workspace-sidebar">
        <RiskSummary />
        <div class="sidebar-patients">
          <PatientList />
        </div>
      </aside>
    {/if}

    <main class="workspace-main">
      <nav class="workspace-tabs" aria-label="工作區域切換">
        <button
          class="tab-btn"
          class:active={activeTab === 'overview'}
          onclick={() => activeTab = 'overview'}
        >
          總覽
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === 'patient'}
          onclick={() => activeTab = 'patient'}
          disabled={!hasSelectedPatient}
        >
          個案
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === 'alerts'}
          onclick={() => activeTab = 'alerts'}
        >
          預警
        </button>
      </nav>

      <div class="workspace-content">
        {#if activeTab === 'overview'}
          <AlertFeed />
        {:else if activeTab === 'patient' && hasSelectedPatient}
          <PatientView />
        {:else if activeTab === 'alerts'}
          <AlertManager />
        {/if}
      </div>
    </main>
  {/if}
</div>

<style>
  .workspace {
    display: flex;
    height: 100%;
    position: relative;
  }

  .fhir-connect-prompt {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    text-align: center;
  }

  .fhir-connect-prompt h2 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-3);
  }

  .fhir-connect-prompt p {
    color: var(--color-text-muted);
    margin-bottom: var(--space-6);
  }

  .sidebar-toggle {
    position: absolute;
    top: var(--space-3);
    left: var(--space-2);
    z-index: 10;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    padding: var(--space-1);
    cursor: pointer;
    min-height: 44px;
    min-width: 44px;
    display: none;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }

  .workspace-sidebar {
    width: 320px;
    flex-shrink: 0;
    border-right: 1px solid var(--border-default);
    background: var(--bg-surface);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .sidebar-patients {
    flex: 1;
    overflow-y: auto;
  }

  .workspace-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .workspace-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-default);
    padding: 0 var(--space-4);
    flex-shrink: 0;
  }

  .tab-btn {
    padding: var(--space-3) var(--space-5);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-muted);
    cursor: pointer;
    min-height: 44px;
  }

  .tab-btn:hover:not(:disabled) {
    color: var(--color-text-base);
  }

  .tab-btn.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }

  .tab-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .workspace-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
  }

  @media (max-width: 768px) {
    .sidebar-toggle {
      display: flex;
    }

    .workspace-sidebar {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 5;
      box-shadow: 4px 0 12px rgba(0, 0, 0, 0.1);
    }

    .workspace-content {
      padding: var(--space-3);
    }
  }
</style>
