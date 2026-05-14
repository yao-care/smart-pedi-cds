<script lang="ts">
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { recordEvent, getEventsByModule } from '../../lib/db/assessment-events';
  import { analyzeBehavior } from '../../engine/cdsa/behavior-analysis';
  import { instructionLevel } from '../../lib/utils/age-groups';
  import type { AgeGroupCDSA } from '../../lib/utils/age-groups';
  import { selectCardsForGame, type CardItem } from '../../engine/cdsa/card-selector';

  interface Props {
    cards: CardItem[];
  }

  let { cards }: Props = $props();

  interface Stimulus {
    id: string;
    cardId: string;
    domain: string;
    instruction: string;
    imageUrl: string;
    description: string;
  }

  const FEEDBACKS = ['好棒！', '不錯喔！', '很好！', '太厲害了！', '繼續加油！'];
  const MIN_CARDS_REQUIRED = 6;
  const MAX_BLOCK_MS = 3 * 60 * 1000;

  function buildInstruction(level: string, description: string): string {
    switch (level) {
      case 'none':
        return '';
      case 'single_verb':
        return '按一下！';
      case 'verb_object':
        return `找出${description}`;
      case 'verb_adj_object':
      case 'compound':
        return `看到${description}就按一下`;
      default:
        return '';
    }
  }

  function generateStimuliFromCards(pool: CardItem[], ageGroup: AgeGroupCDSA): Stimulus[] {
    const level = instructionLevel(ageGroup);
    const count = level === 'none' ? 6 : level === 'single_verb' ? 8 : 10;
    const picks = selectCardsForGame(pool, ageGroup, count);
    return picks.map((card, i) => ({
      id: `game-${i}`,
      cardId: card.id,
      domain: card.domain,
      imageUrl: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/cards/${card.filename}`,
      description: card.description,
      instruction: buildInstruction(level, card.description),
    }));
  }

  // ---- Reactive state ----
  const ageGroup = $derived(assessmentStore.ageGroup);
  const hasEnoughCards = $derived(cards.filter((c) => c.reviewStatus === 'approved').length >= MIN_CARDS_REQUIRED);

  let stimuli = $state<Stimulus[]>([]);
  let currentIndex = $state(0);
  let showFeedback = $state(false);
  let feedbackText = $state('');
  let stimulusStartTime = $state(0);
  let blockStartTime = $state(0);
  let isComplete = $state(false);
  let canvasEl: HTMLCanvasElement | null = $state(null);
  let imageCache = new Map<string, HTMLImageElement>();

  const currentStimulus = $derived(stimuli[currentIndex] ?? null);
  const progress = $derived(stimuli.length > 0 ? currentIndex / stimuli.length : 0);

  $effect(() => {
    if (ageGroup && hasEnoughCards) {
      stimuli = generateStimuliFromCards(cards, ageGroup);
      currentIndex = 0;
      isComplete = false;
      blockStartTime = Date.now();
    }
  });

  async function preloadImage(url: string): Promise<HTMLImageElement> {
    if (imageCache.has(url)) return imageCache.get(url)!;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { imageCache.set(url, img); resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function renderStimulus(): Promise<void> {
    if (!canvasEl) return;
    const stim = stimuli[currentIndex];
    if (!stim) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const w = canvasEl.width;
    const h = canvasEl.height;
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, w, h);

    try {
      const img = await preloadImage(stim.imageUrl);
      const scale = Math.min(w / img.width, h / img.height) * 0.85;
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } catch {
      ctx.fillStyle = '#888';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('（圖片載入失敗）', w / 2, h / 2);
    }
    stimulusStartTime = Date.now();
  }

  $effect(() => {
    const _idx = currentIndex;
    const _len = stimuli.length;
    requestAnimationFrame(() => { renderStimulus(); });
  });

  function onCanvasMount(el: HTMLCanvasElement) {
    canvasEl = el;
    renderStimulus();
  }

  function advance(): void {
    showFeedback = false;
    const elapsed = Date.now() - blockStartTime;
    if (currentIndex < stimuli.length - 1 && elapsed < MAX_BLOCK_MS) {
      currentIndex++;
    } else {
      isComplete = true;
    }
  }

  function handleCanvasClick(): void {
    if (showFeedback || isComplete || !currentStimulus) return;
    const latency = Date.now() - stimulusStartTime;

    if (assessmentStore.assessment) {
      recordEvent({
        assessmentId: assessmentStore.assessment.id,
        childId: assessmentStore.child?.id ?? '',
        moduleType: 'game',
        eventType: 'click',
        timestamp: new Date(),
        data: {
          stimulusId: currentStimulus.id,
          cardId: currentStimulus.cardId,
          domain: currentStimulus.domain,
          latency,
          correct: true,
        },
      });
    }

    feedbackText = FEEDBACKS[Math.floor(Math.random() * FEEDBACKS.length)];
    showFeedback = true;
    setTimeout(advance, 800);
  }

  async function finishAndContinue() {
    if (assessmentStore.assessment) {
      const events = await getEventsByModule(assessmentStore.assessment.id, 'game');
      const metrics = analyzeBehavior(events);
      assessmentStore.addAnalysis({ behaviorMetrics: metrics });
    }
    assessmentStore.nextStep();
  }
</script>

<div class="game-module">
  {#if !hasEnoughCards}
    <div class="game-complete">
      <div class="complete-icon" aria-hidden="true">🎨</div>
      <h2>圖卡準備中</h2>
      <p>遊戲評估暫時略過。後續版本將提供完整圖卡庫。</p>
      <button class="btn-next" onclick={() => assessmentStore.nextStep()}>跳過遊戲評估 →</button>
    </div>
  {:else if isComplete}
    <div class="game-complete">
      <div class="complete-icon" aria-hidden="true">🎉</div>
      <h2>遊戲完成！</h2>
      <p>你做得非常好！</p>
      <button class="btn-next" onclick={finishAndContinue}>繼續下一步 →</button>
    </div>
  {:else if currentStimulus}
    <div class="game-header">
      <div class="game-progress">
        <div class="progress-bar" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={stimuli.length}>
          <div class="progress-fill" style="width: {progress * 100}%"></div>
        </div>
        <span class="progress-text">{currentIndex + 1} / {stimuli.length}</span>
      </div>
      {#if currentStimulus.instruction}
        <p class="instruction">{currentStimulus.instruction}</p>
      {/if}
    </div>

    <div class="canvas-container">
      <canvas
        use:onCanvasMount
        width={600}
        height={400}
        onclick={handleCanvasClick}
        aria-label={currentStimulus.description}
      ></canvas>

      {#if showFeedback}
        <div class="feedback-overlay" aria-live="polite">
          <span class="feedback-text">{feedbackText}</span>
        </div>
      {/if}
    </div>
  {:else}
    <p class="loading-text">正在準備遊戲…</p>
  {/if}
</div>

<style>
  .game-module {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--space-4);
  }

  .game-header {
    margin-bottom: var(--space-4);
  }

  .game-progress {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: var(--bg-muted);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: var(--radius-full);
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .instruction {
    font-size: var(--text-xl);
    line-height: var(--lh-xl);
    text-align: center;
    color: var(--color-text-base);
    font-weight: var(--font-medium);
    margin: 0;
  }

  .canvas-container {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--border-default);
    background: #fafafa;
  }

  canvas {
    display: block;
    width: 100%;
    height: auto;
    touch-action: none;
    cursor: pointer;
  }

  .feedback-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.7);
    pointer-events: none;
    animation: fadeIn 0.15s ease-out;
  }

  .feedback-text {
    font-size: var(--text-3xl);
    font-weight: var(--font-bold);
    color: var(--color-accent);
    animation: pop 0.4s ease-out;
  }

  @keyframes pop {
    0% { transform: scale(0.5); opacity: 0; }
    60% { transform: scale(1.15); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .game-complete {
    text-align: center;
    padding: var(--space-10) var(--space-4);
  }

  .complete-icon {
    font-size: 64px;
    margin-bottom: var(--space-4);
  }

  .game-complete h2 {
    font-size: var(--text-2xl);
    line-height: var(--lh-2xl);
    margin-bottom: var(--space-3);
  }

  .game-complete p {
    font-size: var(--text-base);
    color: var(--color-text-muted);
    margin-bottom: var(--space-6);
  }

  .btn-next {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    padding: var(--space-3) var(--space-7);
    background: var(--color-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
  }

  .btn-next:hover {
    background: var(--color-accent-hover);
  }

  .loading-text {
    text-align: center;
    padding: var(--space-10);
    color: var(--color-text-muted);
    font-size: var(--text-base);
  }
</style>
