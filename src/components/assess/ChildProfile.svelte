<script lang="ts">
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { isEligible, ageInMonths, ageGroupCDSA, AGE_GROUP_LABELS } from '../../lib/utils/age-groups';

  let birthDate = $state('');
  let gender = $state<'male' | 'female' | 'other'>('male');
  let nickName = $state('');
  let validationError = $state<string | null>(null);

  const ageMonths = $derived(birthDate ? ageInMonths(birthDate) : null);
  const eligible = $derived(birthDate ? isEligible(birthDate) : null);
  const ageGroup = $derived(birthDate && eligible ? ageGroupCDSA(birthDate) : null);

  async function handleSubmit() {
    validationError = null;

    if (!birthDate) {
      validationError = '請輸入出生日期';
      return;
    }
    if (!eligible) {
      validationError = '本系統適用於 72 個月（6 歲）以下幼兒';
      return;
    }

    await assessmentStore.startNew({ birthDate, gender, nickName: nickName || undefined });
  }
</script>

<form class="child-profile" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
  <h2>兒童基本資料</h2>
  <p class="form-desc">請填寫以下資料，系統將依據年齡自動調整評估內容。</p>

  <div class="field">
    <label for="birthDate">出生日期 <span class="required">*</span></label>
    <input
      id="birthDate"
      type="date"
      bind:value={birthDate}
      required
      max={new Date().toISOString().split('T')[0]}
    />
    {#if ageMonths !== null && eligible}
      <span class="age-badge">{ageMonths} 個月 — {ageGroup ? AGE_GROUP_LABELS[ageGroup] : ''}</span>
    {/if}
    {#if eligible === false}
      <span class="age-warning">超出適用年齡範圍（0-72 個月）</span>
    {/if}
  </div>

  <fieldset class="field">
    <legend>性別 <span class="required">*</span></legend>
    <div class="gender-pills">
      <label class="pill" class:selected={gender === 'male'}>
        <input type="radio" name="gender" value="male" bind:group={gender} />
        男
      </label>
      <label class="pill" class:selected={gender === 'female'}>
        <input type="radio" name="gender" value="female" bind:group={gender} />
        女
      </label>
      <label class="pill" class:selected={gender === 'other'}>
        <input type="radio" name="gender" value="other" bind:group={gender} />
        其他
      </label>
    </div>
  </fieldset>

  <div class="field">
    <label for="nickName">暱稱（選填）</label>
    <input id="nickName" type="text" bind:value={nickName} placeholder="寶寶的暱稱" />
  </div>

  {#if validationError}
    <p class="error" role="alert">{validationError}</p>
  {/if}
  {#if assessmentStore.error}
    <p class="error" role="alert">{assessmentStore.error}</p>
  {/if}

  <button type="submit" class="btn-start" disabled={assessmentStore.isLoading}>
    {assessmentStore.isLoading ? '準備中…' : '開始評估'}
  </button>
</form>

<style>
  .child-profile {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  h2 {
    font-size: var(--text-2xl);
    text-align: center;
    margin-bottom: var(--space-2);
  }

  .form-desc {
    text-align: center;
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    font-size: var(--text-sm);
    margin-bottom: var(--space-8);
  }

  .field {
    margin: 0 0 var(--space-6);
    padding: 0;
    border: 0;
    min-width: 0;
  }

  label,
  .field > legend {
    display: block;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    margin-bottom: var(--space-2);
    padding: 0;
    color: var(--text);
  }

  .required {
    color: var(--danger);
  }

  input[type="date"],
  input[type="text"] {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    min-height: 48px;
    background: var(--bg);
    color: var(--text);
  }

  input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .age-badge {
    display: inline-block;
    margin-top: var(--space-2);
    padding: var(--space-1) var(--space-3);
    background: var(--color-risk-normal-bg);
    color: var(--accent);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
  }

  .age-warning {
    display: inline-block;
    margin-top: var(--space-2);
    padding: var(--space-1) var(--space-3);
    background: var(--color-risk-warning-bg);
    color: var(--warn);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
  }

  .gender-pills {
    display: flex;
    gap: var(--space-3);
  }

  .pill {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-sm);
    min-height: 48px;
    transition: all 0.15s;
    margin-bottom: 0;
  }

  .pill input[type="radio"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .pill.selected {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .error {
    color: var(--danger);
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
    text-align: center;
  }

  .btn-start {
    width: 100%;
    padding: var(--space-4);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
    cursor: pointer;
    min-height: 56px;
    margin-top: var(--space-4);
  }

  .btn-start:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .btn-start:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
