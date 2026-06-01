<script lang="ts">
  import { completeGcmUpload, detectLaunchCallbackMode } from '$lib/fhir/gcm-submit';
  import { handleCallback } from '$lib/fhir/launch';
  import { authStore } from '$lib/stores/auth.svelte';

  type View = 'loading' | 'gcm-success' | 'error';
  let view = $state<View>('loading');
  let caseId = $state('');
  let message = $state('');

  $effect(() => {
    void run();
  });

  async function run() {
    const hasGcmFlow = sessionStorage.getItem('gcm.flow') !== null;
    const mode = detectLaunchCallbackMode(window.location.search, hasGcmFlow);

    if (mode === 'gcm') {
      try {
        const { caseId: id } = await completeGcmUpload();
        caseId = id;
        view = 'gcm-success';
      } catch (err) {
        message = err instanceof Error ? err.message : '上傳失敗，請稍後重試';
        view = 'error';
      }
      return;
    }

    if (mode === 'fhir') {
      try {
        const { serverUrl, accessToken, fhirUser, scopes } = await handleCallback();
        authStore.setAuth(accessToken, serverUrl, fhirUser, scopes);
        authStore.persistToSession();
        window.location.assign('/workspace/');
      } catch (err) {
        message = err instanceof Error ? err.message : '醫院連線失敗，請重試';
        view = 'error';
      }
      return;
    }

    message = '沒有可處理的授權回呼。';
    view = 'error';
  }
</script>

<div class="launch-callback">
  {#if view === 'loading'}
    <p class="status">正在處理…請稍候</p>
  {:else if view === 'gcm-success'}
    <div class="success-box" role="status">
      <h2>已收案</h2>
      <p>收案編號：<strong>{caseId}</strong></p>
      <p class="muted">請保留此編號，複診時以相同暱稱上傳會歸入同一病例。</p>
      <a href="/history/" class="btn">查看評估紀錄</a>
    </div>
  {:else}
    <div class="error-box" role="alert">
      <p>{message}</p>
      <a href="/history/" class="btn">返回評估紀錄</a>
    </div>
  {/if}
</div>

<style>
  .launch-callback {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-4);
    text-align: center;
  }
  .status {
    font-size: var(--text-base);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }
  .success-box h2 {
    font-size: var(--text-2xl);
    color: var(--accent);
    margin-bottom: var(--space-3);
  }
  .success-box p,
  .error-box p {
    font-size: var(--text-base);
    margin-bottom: var(--space-3);
  }
  .muted {
    font-size: var(--text-sm);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    min-width: 200px;
    padding: var(--space-3) var(--space-7);
    background: var(--accent);
    color: white;
    border-radius: var(--radius-md);
    text-decoration: none;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }
</style>
