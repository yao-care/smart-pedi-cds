<script lang="ts">
  import PatientList from '../dashboard/PatientList.svelte';
  import RiskSummary from '../dashboard/RiskSummary.svelte';
  import PatientView from '../patient/PatientView.svelte';
  import AlertFeed from '../dashboard/AlertFeed.svelte';
  import AlertManager from '../alerts/AlertManager.svelte';
  import AssessmentsTab from './AssessmentsTab.svelte';
  import GuideTab from './GuideTab.svelte';
  import { patientStore } from '../../lib/stores/patients.svelte';
  import StandaloneLaunch from '../fhir/StandaloneLaunch.svelte';
  import { authStore } from '../../lib/stores/auth.svelte';

  // Demo mode: the workspace stays usable without FHIR auth so a clinician
  // can browse the assessment surface + guide before integrating with their
  // hospital server. FHIR-dependent tabs show an inline prompt instead.
  let activeTab = $state<'overview' | 'patient' | 'alerts' | 'assessments' | 'guide'>('assessments');
  let sidebarOpen = $state(true);
  let showLaunch = $state(false);

  const hasSelectedPatient = $derived(patientStore.selectedPatientId !== null);
  const isAuth = $derived(authStore.isAuthenticated);

  $effect(() => {
    if (isAuth) {
      // First load after auth → drop the guide-first stance for an actual feed.
      if (activeTab === 'guide') activeTab = 'overview';
    }
  });

  // Auto-switch to patient tab when a patient is selected
  $effect(() => {
    if (hasSelectedPatient && isAuth) {
      activeTab = 'patient';
    }
  });
</script>

<div class="workspace">
  {#if isAuth && sidebarOpen}
    <aside class="workspace-sidebar">
      <RiskSummary />
      <div class="sidebar-patients">
        <PatientList />
      </div>
    </aside>
  {/if}

  {#if isAuth}
    <button
      class="sidebar-toggle"
      onclick={() => sidebarOpen = !sidebarOpen}
      aria-label={sidebarOpen ? '收合側邊欄' : '展開側邊欄'}
    >
      {sidebarOpen ? '◀' : '▶'}
    </button>
  {/if}

  <main class="workspace-main">
    {#if !isAuth}
      <div class="auth-banner">
        <span class="banner-icon" aria-hidden="true">💡</span>
        <span class="banner-text">
          目前是<strong>示範模式</strong>，顯示本機 IndexedDB 內的測試資料。
          需要醫院實際資料請先連線 FHIR Server。
        </span>
        <button class="banner-cta" onclick={() => (showLaunch = !showLaunch)}>
          {showLaunch ? '收合' : '連線 FHIR'}
        </button>
      </div>

      {#if showLaunch}
        <div class="launch-panel">
          <StandaloneLaunch />
        </div>
      {/if}
    {/if}

    <nav class="workspace-tabs" aria-label="工作區域切換">
      <button
        class="tab-btn"
        class:active={activeTab === 'overview'}
        onclick={() => activeTab = 'overview'}
        disabled={!isAuth}
        title={isAuth ? '' : '需 FHIR 連線'}
      >
        總覽
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'patient'}
        onclick={() => activeTab = 'patient'}
        disabled={!isAuth || !hasSelectedPatient}
      >
        個案
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'alerts'}
        onclick={() => activeTab = 'alerts'}
        disabled={!isAuth}
        title={isAuth ? '' : '需 FHIR 連線'}
      >
        預警
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'assessments'}
        onclick={() => activeTab = 'assessments'}
      >
        評估
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'guide'}
        onclick={() => activeTab = 'guide'}
      >
        使用說明
      </button>
    </nav>

    <div class="workspace-content">
      {#if activeTab === 'overview'}
        {#if isAuth}<AlertFeed />{:else}{@render fhirRequiredHint('總覽')}{/if}
      {:else if activeTab === 'patient'}
        {#if isAuth && hasSelectedPatient}<PatientView />{:else}{@render fhirRequiredHint('個案')}{/if}
      {:else if activeTab === 'alerts'}
        {#if isAuth}<AlertManager />{:else}{@render fhirRequiredHint('預警')}{/if}
      {:else if activeTab === 'assessments'}
        <AssessmentsTab />
      {:else if activeTab === 'guide'}
        <GuideTab />
      {/if}
    </div>
  </main>
</div>

{#snippet fhirRequiredHint(label: string)}
  <div class="fhir-required">
    <h3>「{label}」需要 FHIR Server 連線</h3>
    <p>此 tab 依賴醫院 FHIR Server 的 Patient / Observation 資料。請先連線。</p>
    <p class="muted">「評估」與「使用說明」可在示範模式下使用，從本機 IndexedDB 讀取資料。</p>
  </div>
{/snippet}

<style>
  .workspace {
    display: flex;
    height: 100%;
    position: relative;
  }

  .auth-banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-risk-advisory-bg);
    border-bottom: 1px solid var(--color-risk-advisory);
    font-size: var(--text-sm);
  }

  .banner-icon {
    font-size: 1.3rem;
  }

  .banner-text {
    flex: 1;
    color: var(--color-text-base);
  }

  .banner-cta {
    padding: 4px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-risk-advisory);
    background: white;
    color: var(--color-risk-advisory);
    cursor: pointer;
    font-size: var(--text-xs);
    min-height: 32px;
  }

  .launch-panel {
    padding: var(--space-4);
    border-bottom: 1px solid var(--border-default);
    background: var(--bg-surface);
  }

  .fhir-required {
    padding: var(--space-8);
    text-align: center;
    color: var(--color-text-muted);
  }

  .fhir-required h3 {
    color: var(--color-text-base);
    margin-bottom: var(--space-2);
  }

  .fhir-required .muted {
    font-size: var(--text-xs);
    margin-top: var(--space-3);
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
      box-shadow: var(--shadow-lg);
    }

    .workspace-content {
      padding: var(--space-3);
    }
  }
</style>
