<script lang="ts">
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { recordEvent } from '../../lib/db/assessment-events';
  import { instructionLevel } from '../../lib/utils/age-groups';
  import type { AgeGroupCDSA } from '../../lib/utils/age-groups';

  /** Shape types used in game stimuli. */
  type ShapeType = 'circle' | 'square' | 'triangle' | 'star';

  /** A single shape within a stimulus. */
  interface Shape {
    type: ShapeType;
    color: string;
    x: number;   // percentage 0-100
    y: number;    // percentage 0-100
    size: number; // pixel diameter/side length
    isTarget: boolean;
  }

  /** One game stimulus containing shapes the child must interact with. */
  interface Stimulus {
    id: string;
    domain: string;
    instruction: string;
    shapes: Shape[];
  }

  const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'] as const;
  const SHAPES: ShapeType[] = ['circle', 'square', 'triangle', 'star'];

  const SHAPE_LABELS: Record<ShapeType, string> = {
    circle: '\u5713\u5f62',
    square: '\u6b63\u65b9\u5f62',
    triangle: '\u4e09\u89d2\u5f62',
    star: '\u661f\u661f',
  };

  const COLOR_LABELS: Record<string, string> = {
    '#e74c3c': '\u7d05\u8272',
    '#3498db': '\u85cd\u8272',
    '#2ecc71': '\u7da0\u8272',
    '#f39c12': '\u9ec3\u8272',
    '#9b59b6': '\u7d2b\u8272',
  };

  const FEEDBACKS = ['\u597d\u68d2\uff01', '\u4e0d\u932f\u5594\uff01', '\u5f88\u597d\uff01', '\u592a\u5389\u5bb3\u4e86\uff01', '\u7e7c\u7e8c\u52a0\u6cb9\uff01'];

  /** Maximum duration per game block in milliseconds (3 minutes). */
  const MAX_BLOCK_MS = 3 * 60 * 1000;

  /**
   * Generate stimuli tailored to the child's age group.
   * Younger children see fewer, larger shapes and simpler instructions.
   */
  function generateStimuli(ageGroup: AgeGroupCDSA): Stimulus[] {
    const level = instructionLevel(ageGroup);
    const stimuli: Stimulus[] = [];

    const count = level === 'none' ? 6 : level === 'single_verb' ? 8 : 10;

    for (let i = 0; i < count; i++) {
      const targetShape = SHAPES[i % SHAPES.length];
      const targetColor = COLORS[i % COLORS.length];
      const shapeList: Shape[] = [];

      // More shapes for older children
      const shapeCount = level === 'none' ? 2 : level === 'single_verb' ? 3 : 4;

      for (let j = 0; j < shapeCount; j++) {
        shapeList.push({
          type: j === 0 ? targetShape : SHAPES[(i + j) % SHAPES.length],
          color: j === 0 ? targetColor : COLORS[(i + j + 1) % COLORS.length],
          x: 20 + (j * 60 / (shapeCount - 1 || 1)),
          y: 40 + (Math.random() * 20),
          size: level === 'none' ? 80 : 60,
          isTarget: j === 0,
        });
      }

      // Fisher-Yates shuffle positions (only x/y) so target isn't always first
      for (let k = shapeList.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        [shapeList[k].x, shapeList[r].x] = [shapeList[r].x, shapeList[k].x];
        [shapeList[k].y, shapeList[r].y] = [shapeList[r].y, shapeList[k].y];
      }

      const instructions: Record<string, string> = {
        none: '',
        single_verb: '\u6309\u4e00\u4e0b\uff01',
        verb_object: `\u6309${SHAPE_LABELS[targetShape]}`,
        verb_adj_object: `\u627e${COLOR_LABELS[targetColor] ?? ''}\u7684${SHAPE_LABELS[targetShape]}`,
        compound: `\u5148\u627e${COLOR_LABELS[targetColor] ?? ''}\u7684\u5716\u5f62\uff0c\u518d\u6309\u5b83`,
      };

      stimuli.push({
        id: `game-${i}`,
        domain: i % 2 === 0 ? 'cognition' : 'fine_motor',
        instruction: instructions[level] || '',
        shapes: shapeList,
      });
    }

    return stimuli;
  }

  // ---- Reactive state ----
  const ageGroup = $derived(assessmentStore.ageGroup);
  let stimuli = $state<Stimulus[]>([]);
  let currentIndex = $state(0);
  let showFeedback = $state(false);
  let feedbackText = $state('');
  let stimulusStartTime = $state(0);
  let blockStartTime = $state(0);
  let isComplete = $state(false);
  let canvas: HTMLCanvasElement;

  const currentStimulus = $derived(stimuli[currentIndex] ?? null);
  const progress = $derived(stimuli.length > 0 ? currentIndex / stimuli.length : 0);

  // Initialize stimuli when age group is determined
  $effect(() => {
    if (ageGroup) {
      stimuli = generateStimuli(ageGroup);
      currentIndex = 0;
      isComplete = false;
      blockStartTime = Date.now();
    }
  });

  /**
   * Draw a five-pointed star on a 2d canvas context.
   * The star is centred at (cx, cy) with outer radius `r`.
   */
  function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const innerR = r * 0.38;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const radius = i % 2 === 0 ? r : innerR;
      const method = i === 0 ? 'moveTo' : 'lineTo';
      ctx[method](cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    }
    ctx.closePath();
  }

  /**
   * Draw the given shape on the canvas 2d context.
   */
  function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, w: number, h: number): void {
    const cx = (shape.x / 100) * w;
    const cy = (shape.y / 100) * h;
    const s = shape.size;

    ctx.fillStyle = shape.color;
    ctx.beginPath();

    switch (shape.type) {
      case 'circle':
        ctx.arc(cx, cy, s / 2, 0, Math.PI * 2);
        break;
      case 'square':
        ctx.rect(cx - s / 2, cy - s / 2, s, s);
        break;
      case 'triangle':
        ctx.moveTo(cx, cy - s / 2);
        ctx.lineTo(cx + s / 2, cy + s / 2);
        ctx.lineTo(cx - s / 2, cy + s / 2);
        ctx.closePath();
        break;
      case 'star':
        drawStar(ctx, cx, cy, s / 2);
        break;
    }

    ctx.fill();
  }

  // Render current stimulus on canvas whenever it changes
  $effect(() => {
    if (!canvas || !currentStimulus) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, w, h);

    // Draw each shape
    for (const shape of currentStimulus.shapes) {
      drawShape(ctx, shape, w, h);
    }

    stimulusStartTime = Date.now();
  });

  /**
   * Advance to the next stimulus or mark the game as complete.
   * Also enforces the 3-minute block time limit.
   */
  function advance(): void {
    showFeedback = false;
    const elapsed = Date.now() - blockStartTime;
    if (currentIndex < stimuli.length - 1 && elapsed < MAX_BLOCK_MS) {
      currentIndex++;
    } else {
      isComplete = true;
    }
  }

  /**
   * Handle a click/tap on the canvas. Records the event and shows
   * positive feedback regardless of whether the target was hit.
   */
  function handleCanvasClick(event: MouseEvent): void {
    if (showFeedback || isComplete || !currentStimulus || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;
    const x = (canvasX / canvas.width) * 100;
    const y = (canvasY / canvas.height) * 100;
    const latency = Date.now() - stimulusStartTime;

    // Hit-test: find the shape closest to the click within its bounding radius
    let clickedShape: Shape | null = null;
    let minDist = Infinity;
    for (const shape of currentStimulus.shapes) {
      const shapeCanvasX = (shape.x / 100) * canvas.width;
      const shapeCanvasY = (shape.y / 100) * canvas.height;
      const dist = Math.hypot(canvasX - shapeCanvasX, canvasY - shapeCanvasY);
      const hitRadius = shape.size * 0.6; // slightly generous for small fingers
      if (dist < hitRadius && dist < minDist) {
        minDist = dist;
        clickedShape = shape;
      }
    }

    // Record the interaction event
    if (assessmentStore.assessment) {
      recordEvent({
        assessmentId: assessmentStore.assessment.id,
        childId: assessmentStore.child?.id ?? '',
        moduleType: 'game',
        eventType: 'click',
        timestamp: new Date(),
        data: {
          stimulusId: currentStimulus.id,
          domain: currentStimulus.domain,
          x,
          y,
          latency,
          clickedShape: clickedShape?.type ?? null,
          isTarget: clickedShape?.isTarget ?? false,
          correct: clickedShape?.isTarget ?? false,
        },
      });
    }

    // Always show positive feedback (no error feedback per spec)
    feedbackText = FEEDBACKS[Math.floor(Math.random() * FEEDBACKS.length)];
    showFeedback = true;

    setTimeout(advance, 800);
  }
</script>

<div class="game-module">
  {#if isComplete}
    <div class="game-complete">
      <div class="complete-icon" aria-hidden="true">&#127881;</div>
      <h2>遊戲完成！</h2>
      <p>你做得非常好！</p>
      <button class="btn-next" onclick={() => assessmentStore.nextStep()}>繼續下一步 →</button>
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
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <canvas
        bind:this={canvas}
        width={600}
        height={400}
        onclick={handleCanvasClick}
        role="img"
        aria-label="互動遊戲畫面"
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

  /* ---- Header / progress ---- */
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

  /* ---- Canvas ---- */
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

  /* ---- Feedback overlay ---- */
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
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    60% {
      transform: scale(1.15);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ---- Complete screen ---- */
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

  /* ---- Loading ---- */
  .loading-text {
    text-align: center;
    padding: var(--space-10);
    color: var(--color-text-muted);
    font-size: var(--text-base);
  }
</style>
