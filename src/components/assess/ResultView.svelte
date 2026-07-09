<script lang="ts">
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { authStore } from '../../lib/stores/auth.svelte';
  import { setTriageResult } from '../../lib/db/assessments';
  import { submitAssessmentToFhir } from '../../lib/fhir/cdsa-submit';
  import { computeTriage, type TriageResult } from '../../engine/cdsa/triage';
  import { computeDomainScores } from '../../engine/cdsa/radar-scoring';
  import { analyzeGrossMotorForAssessment } from '../../lib/assessment/active-module-analysis';
  import RadarChart from './RadarChart.svelte';
  import EducationMatch from './EducationMatch.svelte';
  import AssessmentPdfReport from './AssessmentPdfReport.svelte';
  import { deriveCdsaTriggers } from '$lib/education/trigger-derivation';
  import TriggerVideoList from '../education/TriggerVideoList.svelte';
  import GcmUploadForm from './GcmUploadForm.svelte';

  let fhirSubmitting = $state(false);
  let fhirSubmitted = $state(false);
  let fhirError = $state<string | null>(null);
  let triageResult = $state<TriageResult | null>(null);
  let isComputing = $state(true);

  const categoryLabels: Record<string, string> = {
    normal: '正常',
    monitor: '追蹤觀察',
    refer: '建議轉介',
  };

  const categoryColors: Record<string, string> = {
    normal: 'var(--accent)',
    monitor: 'var(--warn)',
    refer: 'var(--danger)',
  };

  const categoryBgColors: Record<string, string> = {
    normal: 'color-mix(in srgb, var(--accent) 12%, var(--bg))',
    monitor: 'color-mix(in srgb, var(--warn) 12%, var(--bg))',
    refer: 'color-mix(in srgb, var(--danger) 14%, var(--bg))',
  };

  // 進入結果頁時，從 partialAnalysis 即時計算分流。
  // 一次性 guard：結果頁是終端狀態、partialAnalysis 已定，但 $effect 可能因讀取
  // reactive proxy 而重觸發，導致昂貴的 gross-motor MediaPipe 分析被重跑（實測跑
  // 兩次）。以純旗標確保只算一次。
  let triageRan = false;
  $effect(() => {
    const ageGroup = assessmentStore.ageGroup;
    if (!ageGroup || triageRan) return;
    triageRan = true;
    const pa = assessmentStore.partialAnalysis;
    const assessmentId = assessmentStore.assessment?.id;
    void runTriage(ageGroup, pa, assessmentId);
  });

  async function runTriage(
    ageGroup: NonNullable<typeof assessmentStore.ageGroup>,
    pa: typeof assessmentStore.partialAnalysis,
    assessmentId: string | undefined,
  ) {
    try {
      // 粗大動作背景 enrich：VideoModule 只存影片、不算分析（MediaPipe 重 ML 不宜
      // 在錄影後的 module 層跑，會拖累接續的 drawing 互動）。這裡在結果頁的 async
      // 載入態下補跑（有 isComputing spinner），逾時 / 失敗 → null → triage 跳過。
      let grossMotor = pa.grossMotorResult ?? null;
      if (!grossMotor && assessmentId) {
        grossMotor = await analyzeGrossMotorForAssessment(assessmentId, ageGroup);
      }

      const result = await computeTriage({
        ageGroup,
        behavior: pa.behaviorMetrics ?? {
          responseTimeDistribution: { p50: 0, p95: 0, std: 0 },
          interactionRhythm: 0, operationConsistency: 0, retryCount: 0,
          interruptionPattern: 0, reactionLatency: 0, completionRate: 0,
        },
        voice: pa.voiceMetrics ?? {
          pitchMean: null, pitchStd: null, intensityMean: null, intensityStd: null,
          speechRate: null, fluencyPauseCount: 0, voiceLatencyMean: null,
          voiceDurationTotal: 0, speechRatio: 0, mfccMean: null, spectralCentroid: null,
        },
        drawing: pa.drawingResult ?? { shapes: [], overallScore: 0, maturityLevel: 'age_appropriate' },
        questionnaireScores: pa.questionnaireScores,
        questionnaireMaxScores: pa.questionnaireMaxScores,
        grossMotor: grossMotor ? {
          classification: grossMotor.classification,
          confidence: grossMotor.confidence,
          features: grossMotor.features as unknown as Record<string, number>,
        } : undefined,
      });
      triageResult = result;
      isComputing = false;
      saveResult(result);
    } catch {
      // 分流計算失敗時用預設結果
      triageResult = {
        category: 'normal', confidence: 0.5,
        summary: '評估資料不足，無法完整分析。建議諮詢專業醫師。',
        anomalyCount: 0, details: [],
      };
      isComputing = false;
    }
  }

  const domainScores = $derived(computeDomainScores(triageResult));

  const anomalyDomains = $derived(
    triageResult?.details.filter(d => d.isAnomaly).map(d => d.domain) ?? []
  );

  const videoTriggers = $derived(
    triageResult && assessmentStore.ageGroup
      ? deriveCdsaTriggers(triageResult, assessmentStore.ageGroup)
      : [],
  );

  async function saveResult(result: TriageResult) {
    if (!assessmentStore.assessment) return;
    // 同一份 persisted triageResult 同時寫 DB 與記憶體，避免 PDF 讀到 undefined。
    const persisted = {
      category: result.category,
      confidence: result.confidence,
      summary: result.summary,
      details: result.details,
      anomalyCount: result.anomalyCount,
    };
    await setTriageResult(assessmentStore.assessment.id, persisted);
    await assessmentStore.complete(persisted);
  }

  async function submitToFhir() {
    if (!assessmentStore.assessment || !assessmentStore.child || !authStore.isAuthenticated || !triageResult) return;
    fhirSubmitting = true;
    fhirError = null;
    try {
      const result = await submitAssessmentToFhir(
        assessmentStore.assessment, assessmentStore.child.id, triageResult,
      );
      fhirSubmitted = result.success;
      if (!result.success) fhirError = result.error ?? '傳送失敗';
    } catch {
      fhirError = '傳送失敗，請稍後重試';
    } finally {
      fhirSubmitting = false;
    }
  }
</script>

{#if isComputing || !triageResult}
  <div class="computing">
    <p>正在產生評估結果…</p>
  </div>
{:else}
<div class="result-view">
  <div class="disclaimer" role="alert">
    本評估結果僅供參考，不構成醫療診斷。如有疑慮，請諮詢專業兒科醫師。
  </div>

  <div
    class="triage-card"
    style="background: {categoryBgColors[triageResult.category]}; border-color: {categoryColors[triageResult.category]};"
  >
    <h2 style="color: {categoryColors[triageResult.category]};">
      {categoryLabels[triageResult.category]}
    </h2>
    <p class="screening-note">此為初步篩檢結果，非診斷</p>
    <p class="summary">{triageResult.summary}</p>
  </div>

  {#if domainScores.length > 0}
    <section class="radar-section" aria-label="各面向評估結果">
      <h3>各面向評估</h3>
      <RadarChart data={domainScores} />
    </section>
  {/if}

  {#if triageResult && assessmentStore.ageGroup && (anomalyDomains.length > 0 || triageResult.category !== 'normal')}
    <section class="education-section" aria-label="衛教建議">
      <h3>建議閱讀</h3>
      <EducationMatch
        category={triageResult.category}
        domains={anomalyDomains.length > 0 ? [...new Set(anomalyDomains)] : ['behavior']}
        ageGroup={assessmentStore.ageGroup}
      />
    </section>
  {/if}

  {#if videoTriggers.length > 0}
    <section class="recommended-videos" aria-label="建議參考影片">
      <h2>建議參考影片</h2>
      <TriggerVideoList triggers={videoTriggers} />
    </section>
  {/if}

  <div class="result-actions">
    {#if authStore.isAuthenticated && !fhirSubmitted}
      <button class="btn-fhir" onclick={submitToFhir} disabled={fhirSubmitting}>
        {fhirSubmitting ? '傳送中…' : '傳送結果至醫院'}
      </button>
    {:else if fhirSubmitted}
      <p class="fhir-success">已傳送至醫院 FHIR Server</p>
    {/if}

    {#if fhirError}
      <p class="fhir-error">{fhirError}</p>
    {/if}

    {#if assessmentStore.assessment}
      <GcmUploadForm
        assessmentId={assessmentStore.assessment.id}
        alreadySubmitted={!!assessmentStore.assessment.gcmCaseId}
        caseId={assessmentStore.assessment.gcmCaseId ?? ''}
      />
    {/if}

    {#if assessmentStore.assessment && assessmentStore.child}
      <AssessmentPdfReport assessment={assessmentStore.assessment} child={assessmentStore.child} />
    {/if}

    <a href="/history/" class="btn-history">查看評估紀錄</a>
    <a href="/assess/" class="btn-home">開始新評估</a>
  </div>
</div>
{/if}

<style>
  .result-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  /* Disclaimer banner */
  .disclaimer {
    padding: var(--space-3) var(--space-4);
    background: color-mix(in srgb, var(--warn) 12%, var(--bg));
    border: 1px solid var(--warn);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    color: var(--warn);
    text-align: center;
    font-weight: var(--font-medium);
  }

  /* Triage card */
  .triage-card {
    padding: var(--space-7);
    border: 2px solid;
    border-radius: var(--radius-lg);
    text-align: center;
  }

  .triage-card h2 {
    font-size: var(--text-3xl);
    margin-bottom: var(--space-2);
  }

  .screening-note {
    font-size: var(--text-sm);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    margin-bottom: var(--space-3);
  }

  .summary {
    font-size: var(--text-base);
    color: var(--text);
    line-height: var(--lh-base);
  }

  /* Radar section */
  .radar-section {
    text-align: center;
  }

  .radar-section h3 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-4);
  }

  /* (Detail-table CSS removed — raw metric section moved to physician detail view.) */

  /* Education section */
  .education-section h3 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-4);
  }

  /* Recommended videos */
  .recommended-videos {
    margin-top: var(--space-7);
  }

  .recommended-videos h2 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-md, 16px);
  }

  /* Action buttons */
  .result-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--line);
  }

  .btn-fhir {
    padding: var(--space-3) var(--space-7);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    min-height: 48px;
    min-width: 200px;
    transition: background 0.2s;
  }

  .btn-fhir:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .btn-fhir:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .fhir-success {
    font-size: var(--text-sm);
    color: var(--accent);
    font-weight: var(--font-medium);
  }

  .fhir-error {
    font-size: var(--text-sm);
    color: var(--danger);
    font-weight: var(--font-medium);
  }

  .btn-history {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-7);
    background: var(--surface);
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    text-decoration: none;
    min-height: 48px;
    min-width: 200px;
    transition: background 0.2s, color 0.2s;
  }

  .btn-history:hover {
    background: var(--accent);
    color: white;
  }

  .btn-home {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-7);
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    text-decoration: none;
    min-height: 48px;
    min-width: 200px;
    transition: border-color 0.2s;
  }

  .btn-home:hover {
    border-color: var(--accent);
  }
</style>
