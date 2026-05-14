<script lang="ts">
  import { authStore } from '../../lib/stores/auth.svelte';
  import { getTenantId, getTenantDisplayName } from '../../lib/utils/tenant';
  import {
    DOMAINS,
    CATEGORIES,
    getDefaultRecommendations,
    getOverlay,
    saveOverlay,
    clearOverlay,
  } from '../../lib/db/recommendations';
  import {
    type RecommendationCategory,
    type RecommendationItem,
    type RecommendationSource,
    type CustomEducation,
  } from '../../lib/db/schema';
  import { getCustomEducation } from '../../lib/db/custom-education';

  const DOMAIN_LABELS: Record<string, string> = {
    gross_motor: '粗動作',
    fine_motor: '精細動作',
    language_comp: '語言理解',
    language_expr: '語言表達',
    cognition: '認知',
    social_emotional: '社會情緒',
    behavior: '生活行為',
    diet: '飲食',
  };

  const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
    normal: '正常',
    monitor: '追蹤觀察',
    refer: '建議轉介',
  };

  const SOURCE_LABELS: Record<RecommendationSource, string> = {
    internal: '系統內建衛教',
    custom: '醫院自上傳',
    external: '外部連結',
  };

  // Known system-internal slugs (kept as a flat list for the dropdown)
  const INTERNAL_SLUGS = [
    'gross-motor-activities', 'exercise-guide', 'fine-motor-activities',
    'language-stimulation', 'cognitive-play', 'social-emotional-guide',
    'sleep-hygiene', 'diet-control', 'when-to-seek-help',
    'nutrition-grow-tall', 'nutrition-calcium-tofu', 'nutrition-vitamin-d-mushroom',
    'nutrition-garlic-tip', 'nutrition-okra-cooking', 'respiratory-care',
  ];

  const tenantId = $derived(getTenantId(authStore.fhirBaseUrl));
  const tenantDisplay = $derived(getTenantDisplayName(authStore.fhirBaseUrl));

  let activeCategory = $state<RecommendationCategory>('monitor');
  let customEducation = $state<CustomEducation[]>([]);

  // Per-domain editor state — keyed by domain
  interface CellState {
    hasOverlay: boolean;
    mergeWithDefault: boolean;
    items: RecommendationItem[];
    expanded: boolean;
    dirty: boolean;
    saving: boolean;
  }
  let cells = $state<Record<string, CellState>>({});

  // Load overlays whenever tenant or category changes
  $effect(() => {
    const tid = tenantId;
    const cat = activeCategory;
    (async () => {
      const list = await getCustomEducation(tid);
      customEducation = list;
      const next: Record<string, CellState> = {};
      for (const d of DOMAINS) {
        const overlay = await getOverlay(tid, cat, d);
        next[d] = {
          hasOverlay: !!overlay,
          mergeWithDefault: overlay?.mergeWithDefault ?? true,
          items: overlay
            ? (JSON.parse(JSON.stringify(overlay.items)) as RecommendationItem[])
            : [],
          expanded: false,
          dirty: false,
          saving: false,
        };
      }
      cells = next;
    })();
  });

  function startEdit(domain: string): void {
    const cell = cells[domain];
    if (!cell) return;
    cell.expanded = true;
    if (!cell.hasOverlay) {
      // Seed editor with the default items so the user can tweak instead of starting blank.
      cell.items = JSON.parse(
        JSON.stringify(getDefaultRecommendations(activeCategory, domain)),
      ) as RecommendationItem[];
      cell.dirty = false;
    }
    cells = { ...cells };
  }

  function addItem(domain: string): void {
    const cell = cells[domain];
    if (!cell) return;
    cell.items = [...cell.items, { source: 'internal', slug: INTERNAL_SLUGS[0] }];
    cell.dirty = true;
    cells = { ...cells };
  }

  function removeItem(domain: string, index: number): void {
    const cell = cells[domain];
    if (!cell) return;
    cell.items = cell.items.filter((_, i) => i !== index);
    cell.dirty = true;
    cells = { ...cells };
  }

  function changeSource(domain: string, index: number, source: RecommendationSource): void {
    const cell = cells[domain];
    if (!cell) return;
    const next: RecommendationItem = { source };
    if (source === 'internal') next.slug = INTERNAL_SLUGS[0];
    if (source === 'custom') next.customId = customEducation[0]?.id;
    if (source === 'external') next.url = '';
    cell.items[index] = next;
    cell.dirty = true;
    cells = { ...cells };
  }

  function patchItem(domain: string, index: number, patch: Partial<RecommendationItem>): void {
    const cell = cells[domain];
    if (!cell) return;
    cell.items[index] = { ...cell.items[index], ...patch };
    cell.dirty = true;
    cells = { ...cells };
  }

  function toggleMerge(domain: string): void {
    const cell = cells[domain];
    if (!cell) return;
    cell.mergeWithDefault = !cell.mergeWithDefault;
    cell.dirty = true;
    cells = { ...cells };
  }

  async function save(domain: string): Promise<void> {
    const cell = cells[domain];
    if (!cell) return;
    cell.saving = true;
    cells = { ...cells };
    try {
      await saveOverlay(tenantId, activeCategory, domain, cell.items, cell.mergeWithDefault);
      cell.hasOverlay = true;
      cell.dirty = false;
    } finally {
      cell.saving = false;
      cells = { ...cells };
    }
  }

  async function reset(domain: string): Promise<void> {
    if (!confirm(`確定還原 [${DOMAIN_LABELS[domain]}] 為系統預設？醫院自訂將被刪除。`)) return;
    const cell = cells[domain];
    if (!cell) return;
    cell.saving = true;
    cells = { ...cells };
    try {
      await clearOverlay(tenantId, activeCategory, domain);
      cell.hasOverlay = false;
      cell.mergeWithDefault = true;
      cell.items = [];
      cell.expanded = false;
      cell.dirty = false;
    } finally {
      cell.saving = false;
      cells = { ...cells };
    }
  }

  function cancel(domain: string): void {
    const cell = cells[domain];
    if (!cell) return;
    cell.expanded = false;
    cells = { ...cells };
  }
</script>

<section class="recs-manager">
  <header class="manager-header">
    <p class="header-tenant">
      目前租戶：<strong>{tenantDisplay}</strong>
      <span class="header-note">（未自訂時，使用系統預設清單）</span>
    </p>
  </header>

  <nav class="category-tabs" aria-label="分流結果分類">
    {#each CATEGORIES as cat}
      <button
        type="button"
        class="cat-tab"
        class:active={activeCategory === cat}
        onclick={() => (activeCategory = cat)}
      >
        {CATEGORY_LABELS[cat]}
      </button>
    {/each}
  </nav>

  <div class="domain-grid">
    {#each DOMAINS as domain}
      {@const cell = cells[domain]}
      {@const defaults = getDefaultRecommendations(activeCategory, domain)}
      <article class="domain-card" class:has-overlay={cell?.hasOverlay}>
        <header class="card-header">
          <h3>{DOMAIN_LABELS[domain]}</h3>
          {#if cell?.hasOverlay}
            <span class="badge badge-override">已自訂</span>
          {:else}
            <span class="badge badge-default">系統預設</span>
          {/if}
        </header>

        {#if !cell || (cell && !cell.expanded)}
          <ul class="preview-list">
            {#if cell?.hasOverlay && !cell.mergeWithDefault}
              {#each cell.items as item}
                <li class="preview-item override">{item.title ?? item.slug ?? item.url ?? '(未命名)'}</li>
              {/each}
            {:else}
              {#each defaults as item}
                <li class="preview-item default-item">{item.title ?? item.slug ?? '(未命名)'}</li>
              {/each}
              {#if cell?.hasOverlay && cell.mergeWithDefault}
                {#each cell.items as item}
                  <li class="preview-item override">{item.title ?? item.slug ?? item.url ?? '(未命名)'}</li>
                {/each}
              {/if}
              {#if defaults.length === 0 && !(cell?.hasOverlay)}
                <li class="preview-empty">（無預設項目）</li>
              {/if}
            {/if}
          </ul>
          <div class="card-actions">
            <button type="button" class="btn-link" onclick={() => startEdit(domain)}>編輯</button>
            {#if cell?.hasOverlay}
              <button type="button" class="btn-link danger" onclick={() => reset(domain)} disabled={cell.saving}>
                還原預設
              </button>
            {/if}
          </div>
        {:else}
          <div class="editor">
            <label class="merge-toggle">
              <input
                type="checkbox"
                checked={cell.mergeWithDefault}
                onchange={() => toggleMerge(domain)}
              />
              合併系統預設（取消勾選代表完全取代預設清單）
            </label>

            <ul class="item-editor">
              {#each cell.items as item, i}
                <li class="item-row">
                  <select
                    class="source-select"
                    value={item.source}
                    onchange={(e) => changeSource(domain, i, (e.currentTarget as HTMLSelectElement).value as RecommendationSource)}
                  >
                    {#each Object.entries(SOURCE_LABELS) as [k, label]}
                      <option value={k}>{label}</option>
                    {/each}
                  </select>

                  {#if item.source === 'internal'}
                    <select
                      class="value-select"
                      value={item.slug}
                      onchange={(e) => patchItem(domain, i, { slug: (e.currentTarget as HTMLSelectElement).value })}
                    >
                      {#each INTERNAL_SLUGS as slug}
                        <option value={slug}>{slug}</option>
                      {/each}
                    </select>
                  {:else if item.source === 'custom'}
                    {#if customEducation.length > 0}
                      <select
                        class="value-select"
                        value={item.customId}
                        onchange={(e) => patchItem(domain, i, { customId: (e.currentTarget as HTMLSelectElement).value })}
                      >
                        {#each customEducation as edu}
                          <option value={edu.id}>{edu.title}</option>
                        {/each}
                      </select>
                    {:else}
                      <span class="hint">尚無自上傳衛教（先到「衛教管理」新增）</span>
                    {/if}
                  {:else if item.source === 'external'}
                    <input
                      type="url"
                      class="value-input"
                      placeholder="https://..."
                      value={item.url ?? ''}
                      oninput={(e) => patchItem(domain, i, { url: (e.currentTarget as HTMLInputElement).value })}
                    />
                  {/if}

                  <input
                    type="text"
                    class="title-input"
                    placeholder="顯示標題（選填，留白時用來源預設）"
                    value={item.title ?? ''}
                    oninput={(e) => patchItem(domain, i, { title: (e.currentTarget as HTMLInputElement).value })}
                  />

                  <button type="button" class="btn-icon danger" aria-label="刪除此項" onclick={() => removeItem(domain, i)}>×</button>
                </li>
              {/each}
            </ul>

            <button type="button" class="btn-add" onclick={() => addItem(domain)}>+ 新增項目</button>

            <div class="editor-actions">
              <button type="button" class="btn-cancel" onclick={() => cancel(domain)}>取消</button>
              <button
                type="button"
                class="btn-save"
                onclick={() => save(domain)}
                disabled={!cell.dirty || cell.saving}
              >
                {cell.saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        {/if}
      </article>
    {/each}
  </div>
</section>

<style>
  .recs-manager {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .manager-header {
    padding: var(--space-3) var(--space-4);
    background: var(--bg-muted);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  .header-note {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    margin-left: var(--space-2);
  }

  .category-tabs {
    display: flex;
    gap: var(--space-2);
    border-bottom: 1px solid var(--border-default);
  }

  .cat-tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--space-3) var(--space-5);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    min-height: 44px;
    font-weight: var(--font-medium);
  }

  .cat-tab.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }

  .domain-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: var(--space-4);
  }

  .domain-card {
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--bg-surface);
    padding: var(--space-4);
  }

  .domain-card.has-overlay {
    border-color: var(--color-accent);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .card-header h3 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: var(--font-bold);
  }

  .badge {
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-weight: var(--font-bold);
  }

  .badge-default {
    background: var(--bg-muted);
    color: var(--color-text-muted);
  }

  .badge-override {
    background: var(--color-risk-advisory-bg);
    color: var(--color-risk-advisory);
  }

  .preview-list {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-xs);
  }

  .preview-item {
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-muted);
    color: var(--color-text-base);
  }

  .preview-item.override {
    background: var(--color-risk-advisory-bg);
    color: var(--color-risk-advisory);
  }

  .preview-empty {
    color: var(--color-text-subtle);
    font-style: italic;
  }

  .card-actions {
    display: flex;
    gap: var(--space-3);
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--color-accent);
    cursor: pointer;
    font-size: var(--text-sm);
    padding: 0;
    min-height: 32px;
  }

  .btn-link.danger {
    color: var(--color-risk-critical);
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .merge-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-base);
  }

  .item-editor {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .item-row {
    display: grid;
    grid-template-columns: 110px 1fr 1fr 32px;
    gap: var(--space-2);
    align-items: center;
  }

  .source-select,
  .value-select,
  .value-input,
  .title-input {
    min-height: 36px;
    padding: 4px 8px;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    background: var(--bg-base);
    font-size: var(--text-xs);
  }

  .btn-icon {
    min-height: 32px;
    min-width: 32px;
    background: none;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-base);
    line-height: 1;
  }

  .btn-icon.danger {
    color: var(--color-risk-critical);
    border-color: var(--color-risk-critical);
  }

  .btn-add {
    align-self: flex-start;
    background: none;
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    cursor: pointer;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    min-height: 36px;
  }

  .btn-add:hover {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }

  .editor-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .btn-cancel,
  .btn-save {
    min-height: 36px;
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-default);
    cursor: pointer;
    font-size: var(--text-xs);
  }

  .btn-cancel {
    background: none;
    color: var(--color-text-muted);
  }

  .btn-save {
    background: var(--color-accent);
    color: #fff;
    border-color: var(--color-accent);
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    grid-column: 2 / 4;
  }
</style>
