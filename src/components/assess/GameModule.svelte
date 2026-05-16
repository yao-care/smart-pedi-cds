<script lang="ts">
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { recordEvent, getEventsByModule } from '../../lib/db/assessment-events';
  import { analyzeBehavior } from '../../engine/cdsa/behavior-analysis';
  import { instructionLevel } from '../../lib/utils/age-groups';
  import type { AgeGroupCDSA } from '../../lib/utils/age-groups';
  import {
    selectCardsForGame,
    selectDistractors,
    type CardItem,
  } from '../../engine/cdsa/card-selector';

  interface Props {
    cards: CardItem[];
  }

  let { cards }: Props = $props();

  interface StimulusOption {
    cardId: string;
    imageUrl: string;
    isTarget: boolean;
  }

  interface Stimulus {
    id: string;
    targetCardId: string;
    domain: string;
    instruction: string;
    description: string;        // target's description
    options: StimulusOption[];  // shuffled — target sits anywhere in the array
  }

  const FEEDBACKS = ['好棒！', '不錯喔！', '很好！', '太厲害了！', '繼續加油！'];
  const MIN_CARDS_REQUIRED = 6;
  const MAX_BLOCK_MS = 3 * 60 * 1000;

  /** Parse a card description into shape + modifier parts for graded prompts.
   *  Placeholder format: "領域：形狀（變體）" → shape "圓形", modifier "亮"
   *  Real-illustration format: "小朋友跑步" → shape = whole string, modifier = ''
   *  The compound-instruction levels only render the modifier when available;
   *  cards without one fall through to a simpler shape-only prompt. */
  function parseCardParts(description: string): { shape: string; modifier: string } {
    const afterPrefix = description.includes('：')
      ? description.slice(description.indexOf('：') + 1)
      : description;
    const m = afterPrefix.match(/^(.+?)（(.+?)）$/);
    return m ? { shape: m[1], modifier: m[2] } : { shape: afterPrefix, modifier: '' };
  }

  /** Build a graded instruction:
   *    none           → ''                              (2-12m)
   *    single_verb    → 按一下！                         (13-24m)
   *    verb_object    → 按{shape}                        (25-36m)
   *    verb_adj_object→ 按{modifier}的{shape}             (37-48m)
   *    compound       → 先找{modifier}的{shape}，再按一下 (49-72m)
   *  Falls back to simpler forms when modifier or shape is missing. */
  function buildInstruction(level: string, description: string): string {
    const { shape, modifier } = parseCardParts(description);
    switch (level) {
      case 'none':
        return '';
      case 'single_verb':
        return '按一下！';
      case 'verb_object':
        return shape ? `按${shape}` : '按一下！';
      case 'verb_adj_object':
        return modifier && shape
          ? `按${modifier}的${shape}`
          : (shape ? `按${shape}` : '按一下！');
      case 'compound':
        return modifier && shape
          ? `先找${modifier}的${shape}，再按一下`
          : (shape ? `先找${shape}，再按一下` : '按一下！');
      default:
        return '';
    }
  }

  /** Web Speech API: speak the instruction. Cancels any pending utterance
   *  so the next stimulus's prompt isn't queued behind the previous one. */
  function speak(text: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }

  /** Map instruction level → number of options shown per stimulus.
   *  none / single_verb: 1 option (passive observation / pure reaction).
   *  verb_object: 2-choice, verb_adj_object: 3-choice, compound: 4-choice. */
  function optionsForLevel(level: string): number {
    switch (level) {
      case 'verb_object': return 2;
      case 'verb_adj_object': return 3;
      case 'compound': return 4;
      default: return 1;
    }
  }

  function cardImageUrl(card: CardItem): string {
    return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/cards/${card.filename}`;
  }

  function shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function generateStimuliFromCards(pool: CardItem[], ageGroup: AgeGroupCDSA): Stimulus[] {
    const level = instructionLevel(ageGroup);
    const stimulusCount = level === 'none' ? 6 : level === 'single_verb' ? 8 : 10;
    const optsPerStim = optionsForLevel(level);
    const targets = selectCardsForGame(pool, ageGroup, stimulusCount);
    const approved = pool.filter((c) => c.reviewStatus === 'approved');

    return targets.map((target, i) => {
      const distractors = optsPerStim > 1
        ? selectDistractors(approved, target, optsPerStim - 1)
        : [];
      const options: StimulusOption[] = shuffle([
        { cardId: target.id, imageUrl: cardImageUrl(target), isTarget: true },
        ...distractors.map((d) => ({
          cardId: d.id,
          imageUrl: cardImageUrl(d),
          isTarget: false,
        })),
      ]);
      return {
        id: `game-${i}`,
        targetCardId: target.id,
        domain: target.domain,
        description: target.description,
        instruction: buildInstruction(level, target.description),
        options,
      };
    });
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

  /** Grid layout for N options on the canvas.
   *  1 → 1×1, 2 → 1×2, 3 → 1×3, 4 → 2×2. Returns the per-cell bounding box. */
  function layoutFor(count: number, w: number, h: number) {
    let cols = 1, rows = 1;
    if (count === 2) { cols = 2; rows = 1; }
    else if (count === 3) { cols = 3; rows = 1; }
    else if (count === 4) { cols = 2; rows = 2; }
    const cellW = w / cols;
    const cellH = h / rows;
    const cells: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (let i = 0; i < count; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      cells.push({ x: c * cellW, y: r * cellH, w: cellW, h: cellH });
    }
    return cells;
  }

  let optionCells = $state<Array<{ x: number; y: number; w: number; h: number }>>([]);

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

    const cells = layoutFor(stim.options.length, w, h);
    optionCells = cells;

    for (let i = 0; i < stim.options.length; i++) {
      const opt = stim.options[i];
      const cell = cells[i];
      // Cell background + subtle separator
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
      try {
        const img = await preloadImage(opt.imageUrl);
        const padding = 8;
        const maxW = cell.w - padding * 2;
        const maxH = cell.h - padding * 2;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = cell.x + (cell.w - dw) / 2;
        const dy = cell.y + (cell.h - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      } catch {
        ctx.fillStyle = '#888';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('（載入失敗）', cell.x + cell.w / 2, cell.y + cell.h / 2);
      }
    }
    stimulusStartTime = Date.now();
  }

  $effect(() => {
    const _idx = currentIndex;
    const _len = stimuli.length;
    requestAnimationFrame(() => { renderStimulus(); });
    const stim = stimuli[currentIndex];
    if (stim?.instruction) speak(stim.instruction);
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

  /** Hit-test the click against the option grid cells. Returns the clicked
   *  option index, or -1 when the click landed in a gap (treated as miss). */
  function hitTest(clientX: number, clientY: number): number {
    if (!canvasEl) return -1;
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return optionCells.findIndex(
      (c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h,
    );
  }

  function handleCanvasClick(ev: MouseEvent): void {
    if (showFeedback || isComplete || !currentStimulus) return;
    const latency = Date.now() - stimulusStartTime;
    const idx = hitTest(ev.clientX, ev.clientY);
    const clickedOption = idx >= 0 ? currentStimulus.options[idx] : null;
    // For pure-reaction levels (single option) every click is correct.
    // For multi-choice, correct only when the click lands on the target cell.
    const isMultiChoice = currentStimulus.options.length > 1;
    const correct = isMultiChoice
      ? clickedOption?.isTarget === true
      : true;

    if (assessmentStore.assessment) {
      recordEvent({
        assessmentId: assessmentStore.assessment.id,
        childId: assessmentStore.child?.id ?? '',
        moduleType: 'game',
        eventType: 'click',
        timestamp: new Date(),
        data: {
          stimulusId: currentStimulus.id,
          cardId: currentStimulus.targetCardId,
          clickedCardId: clickedOption?.cardId ?? null,
          domain: currentStimulus.domain,
          latency,
          correct,
          optionCount: currentStimulus.options.length,
        },
      });
    }

    // Always-positive feedback per CDSA spec — never tell the child they
    // were wrong. behavior-analysis still records correctness for triage.
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

    {#if currentStimulus.options.length === 1}
      <p class="card-label" aria-hidden="true">{currentStimulus.description}</p>
    {/if}
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
    background: var(--accent);
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
    color: var(--text);
    font-weight: var(--font-medium);
    margin: 0;
  }

  .card-label {
    margin-top: var(--space-2);
    text-align: center;
    font-size: var(--text-base);
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .canvas-container {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--line);
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
    color: var(--accent);
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
    background: var(--accent);
    color: white;
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
