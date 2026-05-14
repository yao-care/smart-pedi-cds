<script lang="ts">
  import StepIndicator from './StepIndicator.svelte';
  import ChildProfile from './ChildProfile.svelte';
  import QuestionnaireModule from './QuestionnaireModule.svelte';
  import GameModule from './GameModule.svelte';
  import VoiceModule from './VoiceModule.svelte';
  import VideoModule from './VideoModule.svelte';
  import DrawingModule from './DrawingModule.svelte';
  import ResultView from './ResultView.svelte';
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { getIncompleteAssessments } from '../../lib/db/assessments';
  import type { Assessment } from '../../lib/db/schema';
  import type { CardItem } from '../../engine/cdsa/card-selector';

  interface Props {
    cards?: CardItem[];
  }

  let { cards = [] }: Props = $props();

  const STEP_LABELS = ['基本資料', '問卷', '互動遊戲', '語音互動', '影片錄製', '繪圖測試', '評估結果'];

  let incompleteAssessments = $state<Assessment[]>([]);
  let showResume = $state(true);

  $effect(() => {
    getIncompleteAssessments().then(list => {
      incompleteAssessments = list;
    });
  });

  async function handleResume(id: string) {
    await assessmentStore.resume(id);
    showResume = false;
  }

  function handleStartNew() {
    assessmentStore.reset();
    showResume = false;
  }
</script>

<div class="assessment-shell">
  <StepIndicator steps={STEP_LABELS} currentStep={assessmentStore.currentStepIndex} />

  <div class="step-content">
    {#if showResume && incompleteAssessments.length > 0 && !assessmentStore.assessment}
      <div class="resume-prompt">
        <h2>您有未完成的評估</h2>
        <p>是否要繼續上次的評估？</p>
        <div class="resume-list">
          {#each incompleteAssessments as a}
            <button class="resume-card" onclick={() => handleResume(a.id)}>
              <span class="resume-date">{new Date(a.startedAt).toLocaleDateString('zh-TW')}</span>
              <span class="resume-status">步驟 {a.currentStep + 1} / {STEP_LABELS.length}</span>
              <span class="resume-action">繼續 →</span>
            </button>
          {/each}
        </div>
        <button class="btn-new" onclick={handleStartNew}>開始新的評估</button>
        <a href="/smart-pedi-cds/history/" class="history-link">查看過去的評估紀錄</a>
      </div>

    {:else if assessmentStore.currentStep === 'profile'}
      <ChildProfile />

    {:else if assessmentStore.currentStep === 'questionnaire'}
      <QuestionnaireModule />

    {:else if assessmentStore.currentStep === 'game'}
      <GameModule {cards} />

    {:else if assessmentStore.currentStep === 'voice'}
      <VoiceModule />

    {:else if assessmentStore.currentStep === 'video'}
      <VideoModule />

    {:else if assessmentStore.currentStep === 'drawing'}
      <DrawingModule />

    {:else if assessmentStore.currentStep === 'result'}
      <ResultView />
    {/if}

    <!-- Bottom navigation -->
    {#if assessmentStore.assessment && assessmentStore.currentStep !== 'profile' && assessmentStore.currentStep !== 'result'}
      <div class="bottom-nav">
        <button class="btn-back" onclick={() => assessmentStore.prevStep()}>← 上一步</button>
        <button class="btn-pause" onclick={() => assessmentStore.pause()}>暫停評估</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .assessment-shell {
    max-width: 800px;
    margin: 0 auto;
  }

  .step-content {
    min-height: 400px;
    padding-bottom: var(--space-12);
  }

  .resume-prompt {
    text-align: center;
    padding: var(--space-8);
  }

  .resume-prompt h2 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-2);
  }

  .resume-prompt p {
    color: var(--color-text-muted);
    margin-bottom: var(--space-6);
  }

  .resume-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
  }

  .resume-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    cursor: pointer;
    min-height: 56px;
    font-size: var(--text-sm);
    color: var(--color-text-base);
    text-align: left;
    width: 100%;
  }

  .resume-card:hover {
    border-color: var(--color-accent);
  }

  .resume-status {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .resume-action {
    color: var(--color-accent);
    font-weight: var(--font-medium);
  }

  .btn-new {
    padding: var(--space-3) var(--space-6);
    background: none;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--text-sm);
    min-height: 44px;
  }

  .history-link {
    display: inline-block;
    margin-top: var(--space-4);
    font-size: var(--text-sm);
    color: var(--color-accent);
    text-decoration: none;
  }

  .history-link:hover {
    text-decoration: underline;
  }

  .bottom-nav {
    display: flex;
    justify-content: space-between;
    padding: var(--space-4) 0;
    margin-top: var(--space-6);
    border-top: 1px solid var(--border-default);
  }

  .btn-back {
    padding: var(--space-2) var(--space-5);
    background: none;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--text-sm);
    min-height: 44px;
  }

  .btn-pause {
    padding: var(--space-2) var(--space-5);
    background: none;
    border: none;
    color: var(--color-text-subtle);
    cursor: pointer;
    font-size: var(--text-xs);
    min-height: 44px;
  }

  .btn-pause:hover {
    color: var(--color-risk-warning);
  }
</style>
