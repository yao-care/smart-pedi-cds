<script lang="ts">
  import { discoverSmartConfig } from '$lib/fhir/client';
  import { db } from '$lib/db/schema';
  import type { ServerConfig } from '$lib/db/schema';

  type FormMode = 'list' | 'add' | 'edit';

  const DEFAULT_SCOPES = 'openid fhirUser launch/patient patient/*.read offline_access';

  let servers = $state<ServerConfig[]>([]);
  let mode = $state<FormMode>('list');
  let editingId = $state<string | null>(null);

  // Form fields
  let formName = $state('');
  let formUrl = $state('');
  let formClientId = $state('');
  let formScopes = $state(DEFAULT_SCOPES);

  // Operation states
  let testStatus = $state<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  let testMsg = $state('');
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  $effect(() => {
    loadServers();
  });

  async function loadServers() {
    const rows = await db.serverConfigs.orderBy('lastUsedAt').reverse().toArray();
    servers = rows;
  }

  function openAdd() {
    editingId = null;
    formName = '';
    formUrl = '';
    formClientId = '';
    formScopes = DEFAULT_SCOPES;
    testStatus = 'idle';
    testMsg = '';
    saveError = null;
    mode = 'add';
  }

  function openEdit(server: ServerConfig) {
    editingId = server.id;
    formName = server.name;
    formUrl = server.fhirBaseUrl;
    formClientId = server.clientId;
    formScopes = server.scopes;
    testStatus = 'idle';
    testMsg = '';
    saveError = null;
    mode = 'edit';
  }

  function cancelForm() {
    mode = 'list';
    editingId = null;
  }

  async function testConnection() {
    if (!formUrl.trim()) {
      testMsg = '請先輸入 FHIR Server URL';
      testStatus = 'fail';
      return;
    }
    testStatus = 'testing';
    testMsg = '';
    try {
      await discoverSmartConfig(formUrl.trim());
      testStatus = 'ok';
      testMsg = 'SMART 設定探索成功';
    } catch (err) {
      testStatus = 'fail';
      testMsg = err instanceof Error ? err.message : '連線測試失敗';
    }
  }

  async function saveForm() {
    if (!formName.trim() || !formUrl.trim() || !formClientId.trim()) {
      saveError = '名稱、URL 與 Client ID 為必填';
      return;
    }
    saveError = null;
    saving = true;
    try {
      const entry: ServerConfig = {
        id: editingId ?? crypto.randomUUID(),
        name: formName.trim(),
        fhirBaseUrl: formUrl.trim(),
        clientId: formClientId.trim(),
        scopes: formScopes.trim() || DEFAULT_SCOPES,
        lastUsedAt: new Date(),
      };
      await db.serverConfigs.put(entry);
      await loadServers();
      mode = 'list';
      editingId = null;
    } catch (err) {
      saveError = err instanceof Error ? err.message : '儲存失敗';
    } finally {
      saving = false;
    }
  }

  async function deleteServer(id: string) {
    await db.serverConfigs.delete(id);
    await loadServers();
  }
</script>

<div class="server-config">
  {#if mode === 'list'}
    <div class="list-header">
      <h2 class="title">FHIR 伺服器設定</h2>
      <button class="add-btn" onclick={openAdd}>+ 新增伺服器</button>
    </div>

    {#if servers.length === 0}
      <p class="empty-msg">尚未設定任何伺服器。點擊「新增伺服器」開始設定。</p>
    {:else}
      <ul class="server-list">
        {#each servers as server (server.id)}
          <li class="server-row">
            <div class="server-info">
              <span class="server-name">{server.name}</span>
              <span class="server-url">{server.fhirBaseUrl}</span>
              <span class="server-client">Client: {server.clientId}</span>
            </div>
            <div class="server-actions">
              <button class="action-btn edit-btn" onclick={() => openEdit(server)}>編輯</button>
              <button
                class="action-btn delete-btn"
                onclick={() => deleteServer(server.id)}
              >刪除</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <div class="form-header">
      <h2 class="title">{mode === 'add' ? '新增伺服器' : '編輯伺服器'}</h2>
      <button class="cancel-link" onclick={cancelForm}>取消</button>
    </div>

    <form class="config-form" onsubmit={(e) => { e.preventDefault(); saveForm(); }}>
      <div class="field">
        <label for="sc-name" class="field-label">顯示名稱 <span class="required">*</span></label>
        <input
          id="sc-name"
          type="text"
          class="field-input"
          placeholder="Hospital FHIR Server"
          bind:value={formName}
          required
        />
      </div>

      <div class="field">
        <label for="sc-url" class="field-label">FHIR Base URL <span class="required">*</span></label>
        <input
          id="sc-url"
          type="url"
          class="field-input"
          placeholder="https://your-fhir-server/fhir"
          bind:value={formUrl}
          required
        />
      </div>

      <div class="field">
        <label for="sc-client" class="field-label">Client ID <span class="required">*</span></label>
        <input
          id="sc-client"
          type="text"
          class="field-input"
          placeholder="your-client-id"
          bind:value={formClientId}
          required
          autocomplete="off"
        />
      </div>

      <div class="field">
        <label for="sc-scopes" class="field-label">Scopes</label>
        <textarea
          id="sc-scopes"
          class="field-input field-textarea"
          rows="2"
          bind:value={formScopes}
        ></textarea>
      </div>

      <!-- Test connection -->
      <div class="test-row">
        <button
          type="button"
          class="test-btn"
          onclick={testConnection}
          disabled={testStatus === 'testing'}
        >
          {testStatus === 'testing' ? '測試中...' : '測試連線'}
        </button>
        {#if testMsg}
          <span class="test-msg" class:ok={testStatus === 'ok'} class:fail={testStatus === 'fail'}>
            {testMsg}
          </span>
        {/if}
      </div>

      {#if saveError}
        <p class="error-msg" role="alert">{saveError}</p>
      {/if}

      <div class="form-actions">
        <button type="submit" class="save-btn" disabled={saving}>
          {saving ? '儲存中...' : '儲存'}
        </button>
        <button type="button" class="cancel-btn" onclick={cancelForm}>取消</button>
      </div>
    </form>
  {/if}
</div>

<style>
  .server-config {
    max-width: 600px;
  }

  .list-header,
  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-5);
  }

  .title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text);
    margin: 0;
  }

  .add-btn {
    padding: var(--space-2) var(--space-4);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .add-btn:hover {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .cancel-link {
    background: none;
    border: none;
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    cursor: pointer;
    font-size: 0.875rem;
    text-decoration: underline;
  }

  .empty-msg {
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    font-size: 0.9rem;
    padding: var(--space-8) 0;
    text-align: center;
  }

  .server-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .server-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
  }

  .server-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .server-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
  }

  .server-url,
  .server-client {
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    word-break: break-all;
  }

  .server-actions {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .action-btn {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--text);
    transition: background 0.12s ease;
  }

  .edit-btn:hover {
    background: var(--color-risk-advisory-bg);
    border-color: var(--warn);
    color: var(--warn);
  }

  .delete-btn:hover {
    background: var(--color-risk-critical-bg);
    border-color: var(--danger);
    color: var(--danger);
  }

  /* Form */
  .config-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
  }

  .required {
    color: var(--danger);
  }

  .field-input {
    padding: var(--space-2) var(--space-3);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    color: var(--text);
    font-family: inherit;
    transition: border-color 0.12s ease;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .field-textarea {
    resize: vertical;
    min-height: 56px;
  }

  .test-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .test-btn {
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    color: var(--text);
    transition: background 0.12s ease;
  }

  .test-btn:hover:not(:disabled) {
    background: var(--bg-muted);
  }

  .test-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .test-msg {
    font-size: 0.82rem;
    font-weight: 500;
  }

  .test-msg.ok {
    color: var(--accent);
  }

  .test-msg.fail {
    color: var(--danger);
  }

  .error-msg {
    font-size: 0.875rem;
    color: var(--danger);
    background: var(--color-risk-critical-bg);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    margin: 0;
  }

  .form-actions {
    display: flex;
    gap: var(--space-3);
    padding-top: var(--space-2);
  }

  .save-btn {
    padding: var(--space-2) var(--space-6);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .save-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .save-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .cancel-btn {
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    color: var(--text);
    transition: background 0.12s ease;
  }

  .cancel-btn:hover {
    background: var(--bg-muted);
  }
</style>
