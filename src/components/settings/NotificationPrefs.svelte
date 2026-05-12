<script lang="ts">
  import { settingsStore } from '$lib/stores/settings.svelte';
  import Button from '../ui/Button.svelte';
  import Toast from '../ui/Toast.svelte';

  let isSaving = $state(false);
  let toast = $state<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  let notifPermission = $state<NotificationPermission>('default');

  $effect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      notifPermission = Notification.permission;
    }
    settingsStore.load();
  });

  async function requestNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast = { message: '此瀏覽器不支援通知功能', type: 'error' };
      return;
    }
    const permission = await Notification.requestPermission();
    notifPermission = permission;
    if (permission === 'granted') {
      settingsStore.browserNotifications = true;
      toast = { message: '已取得通知權限', type: 'success' };
    } else if (permission === 'denied') {
      settingsStore.browserNotifications = false;
      toast = { message: '通知權限已被拒絕，請在瀏覽器設定中開啟', type: 'error' };
    }
  }

  async function handleToggleNotifications() {
    if (settingsStore.browserNotifications) {
      settingsStore.browserNotifications = false;
    } else {
      if (notifPermission !== 'granted') {
        await requestNotificationPermission();
      } else {
        settingsStore.browserNotifications = true;
      }
    }
  }

  async function handleSave() {
    isSaving = true;
    try {
      await settingsStore.save();
      toast = { message: '通知偏好已儲存', type: 'success' };
    } catch (e: unknown) {
      toast = { message: `儲存失敗：${e instanceof Error ? e.message : String(e)}`, type: 'error' };
    } finally {
      isSaving = false;
    }
  }

  function handleReset() {
    settingsStore.reset();
    toast = { message: '已重設為預設值', type: 'info' };
  }
</script>

{#if toast}
  <div class="toast-container">
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => (toast = null)}
    />
  </div>
{/if}

<div class="notif-prefs">
  <fieldset class="prefs-fieldset">
    <legend class="fieldset-legend">通知設定</legend>

    <!-- Browser Notifications -->
    <div class="pref-row">
      <div class="pref-info">
        <label class="pref-label" for="notif-browser">瀏覽器通知</label>
        <p class="pref-description">
          允許在背景接收警示通知
          {#if notifPermission === 'denied'}
            <span class="perm-warning">（權限已拒絕，請至瀏覽器設定開啟）</span>
          {:else if notifPermission === 'default'}
            <span class="perm-note">（點選開關將請求權限）</span>
          {/if}
        </p>
      </div>
      <button
        id="notif-browser"
        role="switch"
        type="button"
        class="toggle"
        class:on={settingsStore.browserNotifications}
        aria-checked={settingsStore.browserNotifications}
        aria-label="瀏覽器通知"
        onclick={handleToggleNotifications}
        disabled={notifPermission === 'denied'}
      >
        <span class="toggle-thumb"></span>
      </button>
    </div>

    <!-- Sound -->
    <div class="pref-row">
      <div class="pref-info">
        <label class="pref-label" for="notif-sound">音效提示</label>
        <p class="pref-description">收到高風險警示時播放聲音</p>
      </div>
      <button
        id="notif-sound"
        role="switch"
        type="button"
        class="toggle"
        class:on={settingsStore.soundEnabled}
        aria-checked={settingsStore.soundEnabled}
        aria-label="音效提示"
        onclick={() => (settingsStore.soundEnabled = !settingsStore.soundEnabled)}
      >
        <span class="toggle-thumb"></span>
      </button>
    </div>
  </fieldset>

  <fieldset class="prefs-fieldset">
    <legend class="fieldset-legend">時間間隔設定</legend>

    <!-- Advisory Batch Interval -->
    <div class="pref-row pref-row-input">
      <div class="pref-info">
        <label class="pref-label" for="advisory-interval">建議警示批次間隔（分鐘）</label>
        <p class="pref-description">Advisory 等級警示彙整後發送的間隔</p>
      </div>
      <input
        id="advisory-interval"
        type="number"
        class="number-input"
        min="1"
        max="60"
        step="1"
        bind:value={settingsStore.advisoryBatchInterval}
        aria-label="建議警示批次間隔（分鐘）"
      />
    </div>

    <!-- Polling Interval -->
    <div class="pref-row pref-row-input">
      <div class="pref-info">
        <label class="pref-label" for="polling-interval">資料輪詢間隔（秒）</label>
        <p class="pref-description">向 FHIR 伺服器查詢新資料的頻率</p>
      </div>
      <input
        id="polling-interval"
        type="number"
        class="number-input"
        min="5"
        max="300"
        step="5"
        bind:value={settingsStore.pollingInterval}
        aria-label="資料輪詢間隔（秒）"
      />
    </div>

    <!-- No-data alert threshold -->
    <div class="pref-row pref-row-input">
      <div class="pref-info">
        <label class="pref-label" for="no-data-threshold">無資料警示閾值（小時）</label>
        <p class="pref-description">超過此時間未收到新資料時發出警示</p>
      </div>
      <input
        id="no-data-threshold"
        type="number"
        class="number-input"
        min="1"
        max="72"
        step="1"
        bind:value={settingsStore.alertAfterHours}
        aria-label="無資料警示閾值（小時）"
      />
    </div>
  </fieldset>

  <div class="form-actions">
    <Button variant="ghost" size="sm" onclick={handleReset}>重設預設值</Button>
    <Button
      variant="primary"
      size="md"
      onclick={handleSave}
      disabled={isSaving}
    >
      {isSaving ? '儲存中…' : '儲存設定'}
    </Button>
  </div>
</div>

<style>
  .toast-container {
    position: fixed;
    top: var(--space-4);
    right: var(--space-4);
    z-index: 1100;
  }

  .notif-prefs {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .prefs-fieldset {
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .fieldset-legend {
    padding: 0 var(--space-2);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-base);
  }

  .pref-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border-default);
  }

  .pref-row:last-child {
    border-bottom: none;
  }

  .pref-row-input {
    align-items: flex-start;
  }

  .pref-info {
    flex: 1;
    min-width: 0;
  }

  .pref-label {
    display: block;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--color-text-base);
    margin-bottom: var(--space-1);
  }

  .pref-description {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .perm-warning {
    color: var(--color-risk-warning);
  }

  .perm-note {
    color: var(--color-text-subtle);
  }

  /* Toggle switch */
  .toggle {
    position: relative;
    width: 52px;
    height: 28px;
    border-radius: var(--radius-full);
    border: none;
    background: var(--bg-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 0.2s ease;
    /* min 44px touch target via padding */
    padding: 0;
    min-height: 44px;
    min-width: 52px;
    display: flex;
    align-items: center;
    padding-inline: 6px;
  }

  .toggle:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .toggle.on {
    background: var(--color-accent);
  }

  .toggle:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .toggle-thumb {
    position: absolute;
    left: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease;
    pointer-events: none;
  }

  .toggle.on .toggle-thumb {
    transform: translateX(24px);
  }

  .number-input {
    width: 80px;
    height: 44px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--bg-base);
    color: var(--color-text-base);
    font-size: 0.875rem;
    font-family: inherit;
    text-align: right;
    flex-shrink: 0;
    transition: border-color 0.15s ease;
  }

  .number-input:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
  }

  .form-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    flex-wrap: wrap;
  }
</style>
