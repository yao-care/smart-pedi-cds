<script lang="ts">
  import type { RiskLevel } from '$lib/db/schema';
  import { db } from '$lib/db/schema';
  import type { WebhookHistoryEntry } from '$lib/db/schema';
  import Button from '../ui/Button.svelte';
  import Badge from '../ui/Badge.svelte';
  import Modal from '../ui/Modal.svelte';
  import Toast from '../ui/Toast.svelte';
  import Accordion from '../ui/Accordion.svelte';

  interface WebhookConfig {
    id: string;
    name: string;
    url: string;
    triggerLevels: RiskLevel[];
    enabled: boolean;
    createdAt: Date;
  }

  const STORAGE_KEY = 'cdss-webhooks';

  function loadWebhooks(): WebhookConfig[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  function persistWebhooks(list: WebhookConfig[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  const TRIGGER_LEVELS: RiskLevel[] = ['advisory', 'warning', 'critical'];

  // State
  let webhooks = $state<WebhookConfig[]>([]);
  let isAddModalOpen = $state(false);
  let editTarget = $state<WebhookConfig | null>(null);
  let toast = $state<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  let isTesting = $state<Record<string, boolean>>({});
  let historyMap = $state<Record<string, WebhookHistoryEntry[]>>({});

  // Form state
  let formName = $state('');
  let formUrl = $state('');
  let formLevels = $state<Set<RiskLevel>>(new Set(['warning', 'critical']));
  let formEnabled = $state(true);
  let formError = $state('');

  $effect(() => {
    webhooks = loadWebhooks();
  });

  function openAddModal() {
    editTarget = null;
    formName = '';
    formUrl = '';
    formLevels = new Set(['warning', 'critical']);
    formEnabled = true;
    formError = '';
    isAddModalOpen = true;
  }

  function openEditModal(wh: WebhookConfig) {
    editTarget = wh;
    formName = wh.name;
    formUrl = wh.url;
    formLevels = new Set(wh.triggerLevels);
    formEnabled = wh.enabled;
    formError = '';
    isAddModalOpen = true;
  }

  function closeModal() {
    isAddModalOpen = false;
    editTarget = null;
    formError = '';
  }

  function toggleLevel(level: RiskLevel) {
    const next = new Set(formLevels);
    if (next.has(level)) {
      next.delete(level);
    } else {
      next.add(level);
    }
    formLevels = next;
  }

  function validateForm(): boolean {
    if (!formName.trim()) {
      formError = '請填寫 Webhook 名稱';
      return false;
    }
    try {
      new URL(formUrl.trim());
    } catch {
      formError = '請輸入有效的 URL（含 http:// 或 https://）';
      return false;
    }
    if (formLevels.size === 0) {
      formError = '請至少選擇一個觸發等級';
      return false;
    }
    return true;
  }

  function handleSave() {
    formError = '';
    if (!validateForm()) return;

    if (editTarget) {
      webhooks = webhooks.map((wh) =>
        wh.id === editTarget!.id
          ? {
              ...wh,
              name: formName.trim(),
              url: formUrl.trim(),
              triggerLevels: Array.from(formLevels),
              enabled: formEnabled,
            }
          : wh
      );
      toast = { message: `Webhook「${formName.trim()}」已更新`, type: 'success' };
    } else {
      const newWh: WebhookConfig = {
        id: crypto.randomUUID(),
        name: formName.trim(),
        url: formUrl.trim(),
        triggerLevels: Array.from(formLevels),
        enabled: formEnabled,
        createdAt: new Date(),
      };
      webhooks = [...webhooks, newWh];
      toast = { message: `Webhook「${formName.trim()}」已新增`, type: 'success' };
    }

    persistWebhooks(webhooks);
    closeModal();
  }

  function handleDelete(id: string) {
    const wh = webhooks.find((w) => w.id === id);
    if (!wh) return;
    if (!confirm(`確定要刪除 Webhook「${wh.name}」嗎？`)) return;
    webhooks = webhooks.filter((w) => w.id !== id);
    persistWebhooks(webhooks);
    toast = { message: `已刪除 Webhook「${wh.name}」`, type: 'info' };
  }

  function toggleEnabled(id: string) {
    webhooks = webhooks.map((wh) =>
      wh.id === id ? { ...wh, enabled: !wh.enabled } : wh
    );
    persistWebhooks(webhooks);
  }

  async function handleTest(wh: WebhookConfig) {
    isTesting = { ...isTesting, [wh.id]: true };
    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      webhook: { id: wh.id, name: wh.name },
      alert: {
        id: 'test-alert-id',
        patientId: 'test-patient',
        riskLevel: 'warning',
        rationale: '這是一條測試 Webhook 請求',
      },
    };

    let status: 'success' | 'failed' = 'failed';
    let statusCode: number | undefined;

    try {
      const res = await fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });
      statusCode = res.status;
      status = res.ok ? 'success' : 'failed';
    } catch {
      status = 'failed';
    }

    // Record in history
    try {
      await db.webhookHistory.add({
        id: crypto.randomUUID(),
        webhookId: wh.id,
        alertId: 'test-alert-id',
        url: wh.url,
        status,
        statusCode,
        createdAt: new Date(),
      });
    } catch {
      // IndexedDB may not be available
    }

    isTesting = { ...isTesting, [wh.id]: false };
    toast = {
      message: status === 'success'
        ? `測試成功（HTTP ${statusCode}）`
        : `測試失敗（HTTP ${statusCode ?? '無回應'}）`,
      type: status === 'success' ? 'success' : 'error',
    };
  }

  async function loadHistory(webhookId: string) {
    try {
      const entries = await db.webhookHistory
        .where('webhookId')
        .equals(webhookId)
        .reverse()
        .limit(10)
        .toArray();
      historyMap = { ...historyMap, [webhookId]: entries };
    } catch {
      // IndexedDB not available
    }
  }

  function formatDate(d: Date) {
    return new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  }

  const levelLabels: Record<RiskLevel, string> = {
    normal: '一般',
    advisory: '建議',
    warning: '警告',
    critical: '危急',
  };
</script>

{#if toast}
  <div class="toast-container">
    <Toast message={toast.message} type={toast.type} onClose={() => (toast = null)} />
  </div>
{/if}

<Modal isOpen={isAddModalOpen} title={editTarget ? '編輯 Webhook' : '新增 Webhook'} onClose={closeModal}>
  <div class="modal-form">
    <div class="form-group">
      <label class="form-label" for="wh-name">名稱</label>
      <input id="wh-name" type="text" class="form-input" bind:value={formName} placeholder="例：Slack 通知" aria-required="true" />
    </div>
    <div class="form-group">
      <label class="form-label" for="wh-url">URL</label>
      <input id="wh-url" type="url" class="form-input" bind:value={formUrl} placeholder="https://..." aria-required="true" />
    </div>
    <fieldset class="form-fieldset">
      <legend class="form-legend">觸發等級</legend>
      <div class="level-checkboxes">
        {#each TRIGGER_LEVELS as level}
          <label class="checkbox-label">
            <input
              type="checkbox"
              class="checkbox-input"
              checked={formLevels.has(level)}
              onchange={() => toggleLevel(level)}
            />
            <Badge variant={level}>{levelLabels[level]}</Badge>
          </label>
        {/each}
      </div>
    </fieldset>
    <div class="form-group form-group-toggle">
      <span class="form-label">啟用</span>
      <button
        role="switch"
        type="button"
        class="toggle"
        class:on={formEnabled}
        aria-checked={formEnabled}
        aria-label="啟用此 Webhook"
        onclick={() => (formEnabled = !formEnabled)}
      >
        <span class="toggle-thumb"></span>
      </button>
    </div>
    {#if formError}
      <p class="form-error" role="alert">{formError}</p>
    {/if}
    <div class="modal-actions">
      <Button variant="secondary" onclick={closeModal}>取消</Button>
      <Button variant="primary" onclick={handleSave}>
        {editTarget ? '更新' : '新增'}
      </Button>
    </div>
  </div>
</Modal>

<div class="webhook-config">
  <div class="section-header">
    <h3>已設定的 Webhooks</h3>
    <Button variant="primary" size="sm" onclick={openAddModal}>新增 Webhook</Button>
  </div>

  {#if webhooks.length === 0}
    <div class="empty-state" role="status">
      <p>尚未設定任何 Webhook</p>
      <Button variant="secondary" size="sm" onclick={openAddModal}>新增第一個 Webhook</Button>
    </div>
  {:else}
    <ul class="webhook-list" aria-label="Webhook 列表">
      {#each webhooks as wh (wh.id)}
        <li class="webhook-item" class:disabled={!wh.enabled}>
          <div class="webhook-main">
            <div class="webhook-info">
              <div class="webhook-name-row">
                <span class="webhook-name">{wh.name}</span>
                {#if !wh.enabled}
                  <Badge variant="default">已停用</Badge>
                {/if}
              </div>
              <span class="webhook-url">{wh.url}</span>
              <div class="webhook-levels">
                {#each wh.triggerLevels as level}
                  <Badge variant={level}>{levelLabels[level]}</Badge>
                {/each}
              </div>
            </div>
            <div class="webhook-actions">
              <Button
                variant="ghost"
                size="sm"
                onclick={() => handleTest(wh)}
                disabled={isTesting[wh.id]}
              >
                {isTesting[wh.id] ? '測試中…' : '測試'}
              </Button>
              <Button variant="ghost" size="sm" onclick={() => toggleEnabled(wh.id)}>
                {wh.enabled ? '停用' : '啟用'}
              </Button>
              <Button variant="ghost" size="sm" onclick={() => openEditModal(wh)}>編輯</Button>
              <Button variant="danger" size="sm" onclick={() => handleDelete(wh.id)}>刪除</Button>
            </div>
          </div>

          <Accordion
            title="發送歷史"
            defaultOpen={false}
          >
            {#if !historyMap[wh.id]}
              <Button variant="ghost" size="sm" onclick={() => loadHistory(wh.id)}>載入歷史紀錄</Button>
            {:else if historyMap[wh.id].length === 0}
              <p class="empty-history">尚無發送紀錄</p>
            {:else}
              <ul class="history-list" aria-label="Webhook 發送歷史">
                {#each historyMap[wh.id] as entry}
                  <li class="history-entry">
                    <span class="history-time">{formatDate(entry.createdAt)}</span>
                    <Badge variant={entry.status === 'success' ? 'normal' : 'critical'}>
                      {entry.status === 'success' ? '成功' : '失敗'}
                      {#if entry.statusCode} ({entry.statusCode}){/if}
                    </Badge>
                    <span class="history-url">{entry.url}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </Accordion>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .toast-container {
    position: fixed;
    top: var(--space-4);
    right: var(--space-4);
    z-index: 1100;
  }

  .webhook-config {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .section-header h3 {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-8);
    border: 1px dashed var(--line);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .empty-state p {
    margin: 0;
  }

  .webhook-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .webhook-item {
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .webhook-item.disabled {
    opacity: 0.6;
  }

  .webhook-main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4);
    flex-wrap: wrap;
  }

  .webhook-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .webhook-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .webhook-name {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text);
  }

  .webhook-url {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
    word-break: break-all;
  }

  .webhook-levels {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    margin-top: var(--space-1);
  }

  .webhook-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  /* Modal form */
  .modal-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .form-group-toggle {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .form-label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text);
  }

  .form-input {
    height: 44px;
    padding: 0 var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
    font-size: var(--text-xs);
    font-family: inherit;
    transition: border-color 0.15s ease;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .form-fieldset {
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    margin: 0;
  }

  .form-legend {
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text);
  }

  .level-checkboxes {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding-top: var(--space-2);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    min-height: 44px;
  }

  .checkbox-input {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--accent);
  }

  .form-error {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--danger);
    background: var(--color-risk-critical-bg);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
  }

  .modal-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  /* Toggle */
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
    padding: 0;
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  .toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .toggle.on {
    background: var(--accent);
  }

  .toggle-thumb {
    position: absolute;
    left: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    box-shadow: var(--shadow-sm);
    transition: transform 0.2s ease;
    pointer-events: none;
  }

  .toggle.on .toggle-thumb {
    transform: translateX(24px);
  }

  /* History */
  .history-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .history-entry {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-xs);
    flex-wrap: wrap;
  }

  .history-time {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .history-url {
    color: var(--color-text-subtle);
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
    word-break: break-all;
  }

  .empty-history {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--color-text-subtle);
  }
</style>
