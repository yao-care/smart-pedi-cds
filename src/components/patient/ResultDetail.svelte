<script lang="ts">
  import { resolveAssessment, type ResolveError, type Source } from '../../lib/db/assessment-resolver';
  import { isAuthorized } from '../../lib/fhir/client';
  import type { Assessment } from '../../lib/db/schema';
  import { db } from '../../lib/db/schema';

  // Physician-facing detail view. Loads assessment via the cross-device
  // resolver (IDB first, FHIR fallback), enforces auth gate before
  // rendering any clinical data, and surfaces explicit error states.

  let loading = $state(true);
  let error = $state<ResolveError | 'invalid' | null>(null);
  let assessment = $state<Assessment | null>(null);
  let source = $state<Source | null>(null);
  let returnUrl = $state<string>('');

  $effect(() => {
    (async () => {
      try {
        const search = new URLSearchParams(window.location.search);
        const id = search.get('id');
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
          error = 'invalid';
          return;
        }
        returnUrl = `/workspace/result/?id=${encodeURIComponent(id)}`;

        if (!isAuthorized()) {
          // Redirect parent-style view; do not render any medical data here.
          window.location.replace(`/result/?id=${encodeURIComponent(id)}`);
          return; // loading stays true until redirect lands
        }

        const result = await resolveAssessment(id);
        if (result.ok) {
          assessment = result.assessment;
          source = result.source;
        } else {
          error = result.error;
        }
      } finally {
        // Stay in loading until redirect navigates away — only switch off
        // when we actually have data or an error to show.
        if (assessment || error) loading = false;
      }
    })();
  });

  const triage = $derived(assessment?.triageResult ?? null);

  let note = $state('');
  let noteSaveTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (assessment?.physicianNote && note === '') {
      note = assessment.physicianNote;
    }
  });

  function onNoteInput(e: Event) {
    note = (e.target as HTMLTextAreaElement).value;
    if (!assessment) return;
    if (noteSaveTimer) clearTimeout(noteSaveTimer);
    const id = assessment.id;
    const value = note;
    noteSaveTimer = setTimeout(async () => {
      await db.assessments.update(id, {
        physicianNote: value,
        physicianNoteUpdatedAt: new Date(),
      });
    }, 500);
  }

  function relaunchLink(): string {
    return `/workspace/?return=${encodeURIComponent(returnUrl)}`;
  }
</script>

{#if loading}
  <p class="status">載入中…</p>
{:else if error === 'invalid'}
  <div class="error-box"><p>網址無效。</p></div>
{:else if error === 'token_expired'}
  <div class="error-box">
    <p>Session 過期，請重新登入醫院 FHIR Server。</p>
    <a href={relaunchLink()} class="relaunch-link">回工作台登入 →</a>
  </div>
{:else if error === 'forbidden'}
  <div class="error-box"><p>沒有檢視此評估的權限。</p></div>
{:else if error === 'not_found'}
  <div class="error-box"><p>找不到此評估紀錄。</p></div>
{:else if error === 'network'}
  <div class="error-box"><p>連線失敗，請稍後再試。</p></div>
{:else if assessment && triage}
  <article class="detail">
    <header class="summary-bar">
      <div>
        <span class="label">兒童識別碼</span>
        <span class="value">{assessment.childId.slice(0, 8)}…</span>
      </div>
      <div>
        <span class="label">評估日期</span>
        <span class="value">
          {(assessment.startedAt instanceof Date ? assessment.startedAt : new Date(assessment.startedAt)).toLocaleDateString('zh-TW')}
        </span>
      </div>
      <div>
        <span class="label">分類</span>
        <span class="value">{triage.category}</span>
      </div>
      <div class="source-badge" class:source-fhir={source === 'fhir'}>
        {source === 'fhir' ? '來自 FHIR Server' : '本地紀錄'}
      </div>
    </header>

    <section aria-label="完整指標">
      <h3>完整指標</h3>
      {#if triage.details && triage.details.length > 0}
        <table class="metric-table">
          <thead>
            <tr>
              <th>領域</th>
              <th>指標</th>
              <th>數值</th>
              <th>Z-score</th>
              <th>方向 Z</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {#each triage.details as d}
              <tr class:anomaly={d.isAnomaly}>
                <td>{d.domain}</td>
                <td>{d.metric}</td>
                <td class="num">{typeof d.value === 'number' ? d.value.toFixed(2) : d.value}</td>
                <td class="num">{d.zScore !== null ? d.zScore.toFixed(2) : '—'}</td>
                <td class="num">{d.directionalZ !== null && d.directionalZ !== undefined ? d.directionalZ.toFixed(2) : '—'}</td>
                <td>{d.isAnomaly ? '偏離' : '正常'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="muted">此評估未保留 metric 細節，可能來自舊版或精簡 FHIR 紀錄。</p>
      {/if}
    </section>

    <section aria-label="事件時序">
      <h3>事件時序</h3>
      {#if source === 'fhir'}
        <p class="muted">此資料來自 FHIR Server，無原始事件紀錄。</p>
      {:else}
        <p class="muted">事件 timeline 渲染待後續迭代加上。</p>
      {/if}
    </section>

    <section aria-label="醫師備註">
      <h3>醫師備註</h3>
      <textarea
        class="note-input"
        rows="4"
        placeholder="輸入備註（自動暫存到本地，點下方按鈕儲存到 FHIR）"
        value={note}
        oninput={onNoteInput}
      ></textarea>
      <p class="muted small">草稿自動暫存；提交到 FHIR 為下次迭代功能。</p>
    </section>
  </article>
{/if}

<style>
  .status,
  .error-box {
    text-align: center;
    padding: var(--space-8);
    color: var(--color-text-muted);
  }

  .relaunch-link {
    display: inline-block;
    margin-top: var(--space-3);
    color: var(--color-accent);
    text-decoration: none;
    font-weight: var(--font-medium);
  }

  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .summary-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    align-items: center;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  .summary-bar .label {
    display: block;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .summary-bar .value {
    font-weight: var(--font-medium);
  }

  .source-badge {
    margin-left: auto;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--bg-muted);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .source-badge.source-fhir {
    background: var(--color-risk-advisory-bg);
    color: var(--color-risk-advisory);
  }

  section h3 {
    font-size: var(--text-base);
    margin-bottom: var(--space-2);
  }

  .metric-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
  }

  .metric-table th,
  .metric-table td {
    padding: var(--space-2);
    border-bottom: 1px solid var(--border-default);
    text-align: left;
  }

  .metric-table td.num {
    font-family: var(--font-mono);
    text-align: right;
  }

  .metric-table tr.anomaly {
    background: var(--color-risk-critical-bg);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .muted.small {
    font-size: var(--text-xs);
  }

  .note-input {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font: inherit;
  }
</style>
