<script lang="ts">
  import { handleEhrLaunch } from '$lib/fhir/launch';
  import StandaloneLaunch from './StandaloneLaunch.svelte';

  let mode = $state<'standalone' | 'ehr' | null>(null);
  let ehrLaunching = $state(false);
  let ehrError = $state<string | null>(null);

  async function selectEhr() {
    mode = 'ehr';
    ehrLaunching = true;
    ehrError = null;
    try {
      await handleEhrLaunch();
      // Browser redirects away — execution stops here in practice
    } catch (err) {
      ehrError = err instanceof Error ? err.message : '啟動失敗，請確認 EHR 環境。';
      ehrLaunching = false;
    }
  }

  function selectStandalone() {
    mode = 'standalone';
  }

  function reset() {
    mode = null;
    ehrError = null;
    ehrLaunching = false;
  }
</script>

<div class="launch-selector">
  {#if mode === null}
    <h2 class="title">選擇啟動模式</h2>
    <p class="subtitle">請根據您的使用情境選擇適合的連線方式</p>

    <div class="launch-options">
      <button class="launch-option" onclick={selectEhr}>
        <div class="option-icon ehr-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
        </div>
        <h3 class="option-title">EHR 內嵌啟動</h3>
        <p class="option-desc">從醫院 HIS/EHR 系統內嵌啟動，自動繼承病患上下文</p>
        <span class="option-badge">需 EHR 環境</span>
      </button>

      <button class="launch-option" onclick={selectStandalone}>
        <div class="option-icon standalone-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4l3 3"/>
          </svg>
        </div>
        <h3 class="option-title">獨立啟動</h3>
        <p class="option-desc">輸入 FHIR Server URL，透過 OAuth 2.0 + PKCE 授權連線</p>
        <span class="option-badge">手動設定</span>
      </button>
    </div>
  {:else if mode === 'ehr'}
    <div class="ehr-status">
      <button class="back-btn" onclick={reset}>← 返回</button>
      <h2 class="title">EHR 內嵌啟動</h2>

      {#if ehrLaunching}
        <div class="status-card launching">
          <div class="spinner"></div>
          <p>正在連接 EHR 系統，即將跳轉授權頁面...</p>
        </div>
      {/if}

      {#if ehrError}
        <div class="status-card error">
          <p class="error-msg">{ehrError}</p>
          <button class="retry-btn" onclick={selectEhr}>重試</button>
        </div>
      {/if}
    </div>
  {:else if mode === 'standalone'}
    <div class="standalone-wrapper">
      <button class="back-btn" onclick={reset}>← 返回</button>
      <StandaloneLaunch />
    </div>
  {/if}
</div>

<style>
  .launch-selector {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-4);
  }

  .title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-base);
    margin: 0 0 var(--space-2);
    text-align: center;
  }

  .subtitle {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    text-align: center;
    margin: 0 0 var(--space-7);
  }

  .launch-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }

  @media (max-width: 480px) {
    .launch-options {
      grid-template-columns: 1fr;
    }
  }

  .launch-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-6);
    background: var(--bg-surface);
    border: 2px solid var(--border-default);
    border-radius: var(--radius-lg);
    cursor: pointer;
    text-align: center;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .launch-option:hover {
    border-color: var(--color-accent);
    background: var(--bg-base);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  }

  .launch-option:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .option-icon {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ehr-icon {
    background: var(--color-risk-advisory-bg);
    color: var(--color-risk-advisory);
  }

  .standalone-icon {
    background: var(--color-risk-normal-bg);
    color: var(--color-risk-normal);
  }

  .option-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-base);
    margin: 0;
  }

  .option-desc {
    font-size: 0.82rem;
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  .option-badge {
    font-size: 0.72rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-2);
    background: var(--bg-muted);
    color: var(--color-text-subtle);
    border-radius: var(--radius-full);
    letter-spacing: 0.02em;
  }

  .back-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0;
    margin-bottom: var(--space-4);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .back-btn:hover {
    text-decoration: underline;
  }

  .ehr-status,
  .standalone-wrapper {
    display: flex;
    flex-direction: column;
  }

  .status-card {
    padding: var(--space-6);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    text-align: center;
    margin-top: var(--space-4);
  }

  .status-card.launching {
    background: var(--color-risk-advisory-bg);
    color: var(--color-risk-advisory);
  }

  .status-card.error {
    background: var(--color-risk-critical-bg);
    color: var(--color-risk-critical);
  }

  .error-msg {
    margin: 0;
    font-size: 0.875rem;
  }

  .retry-btn {
    padding: var(--space-2) var(--space-4);
    background: var(--color-risk-critical);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .retry-btn:hover {
    opacity: 0.88;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
