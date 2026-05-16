<script lang="ts">
  import { resolveAssessment, type ResolveError, type Source } from '../../lib/db/assessment-resolver';
  import { isAuthorized } from '../../lib/fhir/client';
  import type { Assessment } from '../../lib/db/schema';
  import { db } from '../../lib/db/schema';

  const DOMAIN_LABELS: Record<string, string> = {
    behavior: '行為',
    gross_motor: '粗動作',
    fine_motor: '細動作',
    language: '語言',
    language_comprehension: '語言理解',
    language_expression: '語言表達',
    cognition: '認知',
    social_emotional: '社交情緒',
    diet: '飲食',
  };

  const METRIC_LABELS: Record<string, string> = {
    completionRate: '完成率',
    operationConsistency: '操作一致性',
    reactionLatency: '反應延遲 (ms)',
    interactionRhythm: '互動節奏',
    drawingScore: '繪圖總分',
    voiceDuration: '發聲總時長 (秒)',
    questionnaireScore: '問卷得分',
    poseClassification: '動作分類信心',
  };

  const CATEGORY_LABELS: Record<string, string> = {
    normal: '正常',
    monitor: '追蹤觀察',
    refer: '建議轉介',
  };

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

    <section aria-label="分流判定">
      <h3>分流判定</h3>
      <div class="triage-summary">
        <span class="triage-cat triage-{triage.category}">{CATEGORY_LABELS[triage.category]}</span>
        <span class="muted">信心度 {Math.round(triage.confidence * 100)}%</span>
        <span class="muted">·</span>
        <span class="muted">異常 metric {triage.details?.filter((d) => d.isAnomaly).length ?? 0} 項 / {triage.details?.length ?? 0} 項</span>
      </div>
      <details class="rule-detail">
        <summary>分流判定規則</summary>
        <ul>
          <li><strong>refer</strong>：≥ 3 個異常 metric 且 ≥ 2 個 domain 受影響</li>
          <li><strong>monitor</strong>：≥ 1 個異常 metric（未達轉介門檻）</li>
          <li><strong>normal</strong>：無任何異常 metric</li>
          <li>異常 metric 判定：z-score ≤ -1.5（反向 metric 則 ≥ 1.5）；問卷得分 / 上限 &lt; 50%</li>
        </ul>
      </details>
    </section>

    <section aria-label="完整指標">
      <h3>完整指標</h3>
      {#if triage.details && triage.details.length > 0}
        <table class="metric-table">
          <thead>
            <tr>
              <th>領域</th>
              <th>指標</th>
              <th>數值</th>
              <th>常模 / 上限</th>
              <th>Z-score</th>
              <th>方向 Z</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {#each triage.details as d}
              <tr class:anomaly={d.isAnomaly}>
                <td>{DOMAIN_LABELS[d.domain] ?? d.domain}</td>
                <td>{METRIC_LABELS[d.metric] ?? d.metric}</td>
                <td class="num">{typeof d.value === 'number' ? d.value.toFixed(2) : d.value}</td>
                <td class="num norm">
                  {#if d.normMean != null && d.normStd != null}
                    {d.normMean.toFixed(2)} ± {d.normStd.toFixed(2)}
                  {:else if d.maxScore != null}
                    上限 {d.maxScore}
                  {:else}
                    —
                  {/if}
                </td>
                <td class="num">{d.zScore !== null ? d.zScore.toFixed(2) : '—'}</td>
                <td class="num">{d.directionalZ !== null && d.directionalZ !== undefined ? d.directionalZ.toFixed(2) : '—'}</td>
                <td><span class="status-pill status-{d.isAnomaly ? 'anomaly' : 'normal'}">{d.isAnomaly ? '偏離' : '正常'}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="muted small">
          常模 = 該年齡層該指標的平均值 ± 標準差，目前使用內建預設值。可在「設定 → 常模管理」改為醫院本地常模。
        </p>
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
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }

  .relaunch-link {
    display: inline-block;
    margin-top: var(--space-3);
    color: var(--accent);
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
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  .summary-bar .label {
    display: block;
    font-size: var(--text-xs);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }

  .summary-bar .value {
    font-weight: var(--font-medium);
  }

  .source-badge {
    margin-left: auto;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--bg-muted);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    font-size: var(--text-xs);
  }

  .source-badge.source-fhir {
    background: var(--color-risk-advisory-bg);
    color: var(--warn);
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
    border-bottom: 1px solid var(--line);
    text-align: left;
  }

  .metric-table td.num {
    font-family: var(--font-mono);
    text-align: right;
  }

  .metric-table tr.anomaly {
    background: var(--color-risk-critical-bg);
  }

  .metric-table td.norm {
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    font-size: 0.75rem;
  }

  .triage-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    font-size: var(--text-sm);
  }

  .triage-cat {
    padding: 4px 10px;
    border-radius: var(--radius-full);
    font-weight: var(--font-bold);
    font-size: var(--text-sm);
  }

  .triage-normal { background: var(--color-risk-normal-bg); color: var(--accent); }
  .triage-monitor { background: var(--color-risk-warning-bg); color: var(--warn); }
  .triage-refer { background: var(--color-risk-critical-bg); color: var(--danger); }

  .rule-detail {
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }

  .rule-detail summary {
    cursor: pointer;
    color: var(--accent);
    margin-bottom: var(--space-1);
  }

  .rule-detail ul {
    margin: var(--space-2) 0 0;
    padding-left: var(--space-5);
    line-height: 1.6;
  }

  .status-pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.7rem;
    font-weight: var(--font-medium);
  }

  .status-pill.status-normal { background: var(--color-risk-normal-bg); color: var(--accent); }
  .status-pill.status-anomaly { background: var(--color-risk-critical-bg); color: var(--danger); }

  .muted {
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    font-size: var(--text-sm);
  }

  .muted.small {
    font-size: var(--text-xs);
  }

  .note-input {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font: inherit;
  }
</style>
