<script lang="ts">
  import { startGcmUpload } from '$lib/fhir/gcm-submit';

  let { assessmentId, alreadySubmitted = false, caseId = '' }: {
    assessmentId: string;
    alreadySubmitted?: boolean;
    caseId?: string;
  } = $props();

  let nickname = $state('');
  let email = $state('');
  let phone = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  const redirectUri = $derived(
    typeof window !== 'undefined' ? `${window.location.origin}/launch/` : '',
  );

  async function submit() {
    error = null;
    if (!nickname.trim()) {
      error = '請填寫暱稱';
      return;
    }
    submitting = true;
    try {
      await startGcmUpload(redirectUri, {
        assessmentId,
        nickname: nickname.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : '無法開始上傳，請稍後重試';
      submitting = false;
    }
  }
</script>

<section class="gcm-upload" aria-label="上傳到 GCM 收案">
  <h3>上傳到 GCM 預防醫學發展協會</h3>
  {#if alreadySubmitted}
    <p class="gcm-done">已收案，編號 <strong>{caseId}</strong></p>
  {:else}
    <p class="gcm-hint">填寫暱稱即可建立／延續您的病例（email、電話選填，供協會聯繫）。</p>
    <label class="field">
      <span>暱稱（必填）</span>
      <input type="text" bind:value={nickname} autocomplete="off" />
    </label>
    <label class="field">
      <span>Email（選填）</span>
      <input type="email" bind:value={email} autocomplete="off" />
    </label>
    <label class="field">
      <span>電話（選填）</span>
      <input type="tel" bind:value={phone} autocomplete="off" />
    </label>
    {#if error}<p class="gcm-error">{error}</p>{/if}
    <button class="btn-gcm" onclick={submit} disabled={submitting}>
      {submitting ? '前往授權…' : '上傳到 GCM 收案'}
    </button>
  {/if}
</section>

<style>
  .gcm-upload {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .gcm-upload h3 {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
  }
  .gcm-hint {
    font-size: var(--text-sm);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }
  .field input {
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: var(--text-base);
    background: var(--bg);
    color: var(--text);
  }
  .btn-gcm {
    min-height: 48px;
    padding: var(--space-3) var(--space-7);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
  }
  .btn-gcm:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .gcm-error {
    font-size: var(--text-sm);
    color: var(--danger);
  }
  .gcm-done {
    font-size: var(--text-sm);
    color: var(--accent);
    font-weight: var(--font-medium);
  }
</style>
