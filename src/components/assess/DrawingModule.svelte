<script lang="ts">
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { recordEvent, saveMedia } from '../../lib/db/assessment-events';

  const SHAPES = [
    { id: 'circle', name: '圓形', icon: '⭕', guide: '請畫一個圓形' },
    { id: 'cross', name: '十字', icon: '✚', guide: '請畫一個十字' },
    { id: 'square', name: '正方形', icon: '⬜', guide: '請畫一個正方形' },
    { id: 'triangle', name: '三角形', icon: '△', guide: '請畫一個三角形' },
    { id: 'diamond', name: '菱形', icon: '◇', guide: '請畫一個菱形' },
  ];

  let canvas = $state<HTMLCanvasElement | null>(null);
  let isDrawing = $state(false);
  let currentShapeIndex = $state(0);
  let isComplete = $state(false);
  let strokes = $state<Array<{ x: number; y: number; t: number }>>([]);
  let allStrokes = $state<Array<Array<{ x: number; y: number; t: number }>>>([]);
  let currentStroke: Array<{ x: number; y: number; t: number }> = [];

  const currentShape = $derived(SHAPES[currentShapeIndex]);
  const progress = $derived(currentShapeIndex / SHAPES.length);

  function getCanvasPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function startStroke(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    isDrawing = true;
    currentStroke = [];
    const pos = getCanvasPos(e);
    currentStroke.push({ ...pos, t: Date.now() });

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = '#1e2030';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }

  function moveStroke(e: MouseEvent | TouchEvent) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    currentStroke.push({ ...pos, t: Date.now() });

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  }

  function endStroke() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke.length > 0) {
      allStrokes.push(currentStroke);
    }
  }

  function clearCanvas() {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    allStrokes = [];
    currentStroke = [];
  }

  async function submitDrawing() {
    // Export canvas as PNG blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });

    if (blob && assessmentStore.assessment && assessmentStore.child) {
      // Save media
      await saveMedia({
        assessmentId: assessmentStore.assessment.id,
        childId: assessmentStore.child.id,
        fileType: 'drawing',
        blob,
        mimeType: 'image/png',
        fileSize: blob.size,
      });

      // Record event with stroke data
      await recordEvent({
        assessmentId: assessmentStore.assessment.id,
        childId: assessmentStore.child.id,
        moduleType: 'drawing',
        eventType: 'drawing_complete',
        timestamp: new Date(),
        data: {
          shapeId: currentShape.id,
          shapeName: currentShape.name,
          strokeCount: allStrokes.length,
          totalPoints: allStrokes.reduce((sum, s) => sum + s.length, 0),
          strokes: allStrokes,
          fileSize: blob.size,
        },
      });
    }

    // Next shape or complete
    clearCanvas();
    if (currentShapeIndex < SHAPES.length - 1) {
      currentShapeIndex++;
    } else {
      isComplete = true;
    }
  }
</script>

<div class="drawing-module">
  {#if isComplete}
    <div class="drawing-complete">
      <div class="complete-icon">🎨</div>
      <h2>繪圖完成！</h2>
      <p>你畫得真好！</p>
      <button class="btn-next" onclick={() => assessmentStore.nextStep()}>繼續下一步 →</button>
    </div>
  {:else}
    <div class="drawing-header">
      <div class="progress-bar">
        <div class="progress-fill" style="width: {progress * 100}%"></div>
      </div>
      <p class="progress-text">{currentShapeIndex + 1} / {SHAPES.length}</p>
    </div>

    <div class="shape-guide">
      <span class="shape-icon">{currentShape.icon}</span>
      <p class="guide-text">{currentShape.guide}</p>
    </div>

    <div class="canvas-area">
      <canvas
        bind:this={canvas}
        width={400}
        height={400}
        onmousedown={startStroke}
        onmousemove={moveStroke}
        onmouseup={endStroke}
        onmouseleave={endStroke}
        ontouchstart={startStroke}
        ontouchmove={moveStroke}
        ontouchend={endStroke}
        style="touch-action: none;"
        role="img"
        aria-label="繪圖區域 — {currentShape.guide}"
      ></canvas>
    </div>

    <div class="drawing-actions">
      <button class="btn-clear" onclick={clearCanvas}>清除重畫</button>
      <button class="btn-submit" onclick={submitDrawing} disabled={allStrokes.length === 0}>
        完成此圖 →
      </button>
    </div>
  {/if}
</div>

<style>
  .drawing-module {
    max-width: 500px;
    margin: 0 auto;
    text-align: center;
  }

  .drawing-header {
    margin-bottom: var(--space-4);
  }

  .progress-bar {
    height: 8px;
    background: var(--bg-muted);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin-bottom: var(--space-2);
  }

  .progress-fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: var(--radius-full);
    transition: width 0.3s;
  }

  .progress-text {
    font-size: var(--text-xs);
    color: var(--color-text-subtle);
  }

  .shape-guide {
    margin-bottom: var(--space-4);
  }

  .shape-icon {
    font-size: 48px;
    display: block;
    margin-bottom: var(--space-2);
  }

  .guide-text {
    font-size: var(--text-lg);
    font-weight: var(--font-medium);
    color: var(--color-text-base);
  }

  .canvas-area {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-6);
  }

  canvas {
    border: 2px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: #ffffff;
    cursor: crosshair;
    max-width: 100%;
    height: auto;
  }

  .drawing-actions {
    display: flex;
    gap: var(--space-4);
    justify-content: center;
  }

  .btn-clear {
    padding: var(--space-3) var(--space-6);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--text-sm);
    min-height: 48px;
  }

  .btn-clear:hover {
    background: var(--bg-muted);
  }

  .btn-submit {
    padding: var(--space-3) var(--space-6);
    background: var(--color-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    min-height: 48px;
  }

  .btn-submit:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  .btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .drawing-complete {
    padding: var(--space-10);
  }

  .complete-icon {
    font-size: 56px;
    margin-bottom: var(--space-4);
  }

  .drawing-complete h2 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-3);
  }

  .drawing-complete p {
    color: var(--color-text-muted);
    margin-bottom: var(--space-6);
  }

  .btn-next {
    padding: var(--space-3) var(--space-7);
    background: var(--color-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    min-height: 56px;
  }

  .btn-next:hover {
    background: var(--color-accent-hover);
  }
</style>
