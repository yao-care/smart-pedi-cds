<script lang="ts">
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { recordEvent, saveMedia } from '../../lib/db/assessment-events';
  import { analyzeDrawing } from '../../engine/cdsa/drawing-analysis';

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

  /** 累積所有 submitted shapes 的 event data，最後一張完成時餵 analyzeDrawing。
   *  本模組原本只把 strokes 寫進 IDB assessmentEvents，沒 set
   *  assessmentStore.partialAnalysis.drawingResult；ResultView 因 partial
   *  缺欄位 fallback `{ shapes: [], overallScore: 0 }`，被 triage 餵成假 0 分
   *  拖垮 fine_motor domain（2026-05-28 bug 報告）。本 state 解決該漏接。 */
  let submittedShapesData = $state<Array<Record<string, unknown>>>([]);

  const currentShape = $derived(SHAPES[currentShapeIndex]);
  const progress = $derived(currentShapeIndex / SHAPES.length);

  function getCanvasPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    if (!canvas) return { x: 0, y: 0 };
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

    const ctx = canvas?.getContext('2d');
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

    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  }

  function endStroke() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke.length > 0) {
      allStrokes = [...allStrokes, currentStroke];
    }
  }

  function clearCanvas() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    allStrokes = [];
    currentStroke = [];
  }

  async function submitDrawing() {
    // Export canvas as PNG blob
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas!.toBlob(resolve, 'image/png');
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

      const eventData = {
        shapeId: currentShape.id,
        shapeName: currentShape.name,
        strokeCount: allStrokes.length,
        totalPoints: allStrokes.reduce((sum, s) => sum + s.length, 0),
        strokes: JSON.parse(JSON.stringify(allStrokes)),
        fileSize: blob.size,
      };
      // Record event with stroke data
      await recordEvent({
        assessmentId: assessmentStore.assessment.id,
        childId: assessmentStore.child.id,
        moduleType: 'drawing',
        eventType: 'drawing_complete',
        timestamp: new Date(),
        data: eventData,
      });
      // Push into local accumulator so we can analyze the full set when the
      // user finishes the last shape (see below).
      submittedShapesData = [...submittedShapesData, eventData];
    }

    // Next shape or complete
    clearCanvas();
    if (currentShapeIndex < SHAPES.length - 1) {
      currentShapeIndex++;
    } else {
      // 全部形狀畫完 → 跑 analyzeDrawing 並 set partial.drawingResult。
      // 為什麼在 module 內算而非 ResultView：partialAnalysis 是「即時計算
      // 流」(<1s)，ResultView 進來就要立即 render；若延後到 ResultView 才從
      // IDB 重抓 events 跑 analyzeDrawing 會 race + 慢。同 GameModule 在
      // step 結束時計算 behaviorMetrics 並 addAnalysis 的模式。
      // ONNX classification 不在這層跑（重 + 5+ 秒）；只跑幾何 features，
      // ONNX 若要 enabled 應走 ResultView 背景 enrich。
      try {
        const drawingResult = analyzeDrawing(
          submittedShapesData.map(data => ({ data })),
        );
        assessmentStore.addAnalysis({ drawingResult });
      } catch (err) {
        console.warn('[DrawingModule] analyzeDrawing failed', err);
      }
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
    background: color-mix(in srgb, var(--bg), var(--text) 5%);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin-bottom: var(--space-2);
  }

  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: var(--radius-full);
    transition: width 0.3s;
  }

  .progress-text {
    font-size: var(--text-xs);
    color: color-mix(in srgb, var(--text), var(--bg) 45%);
  }

  .shape-guide {
    margin-bottom: var(--space-4);
  }

  .shape-icon {
    font-size: var(--text-display);
    display: block;
    margin-bottom: var(--space-2);
  }

  .guide-text {
    font-size: var(--text-lg);
    font-weight: var(--font-medium);
    color: var(--text);
  }

  .canvas-area {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-6);
  }

  canvas {
    border: 2px solid var(--line);
    border-radius: var(--radius-lg);
    background: white;
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
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    cursor: pointer;
    font-size: var(--text-sm);
    min-height: 48px;
  }

  .btn-clear:hover {
    background: color-mix(in srgb, var(--bg), var(--text) 5%);
  }

  .btn-submit {
    padding: var(--space-3) var(--space-6);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    min-height: 48px;
  }

  .btn-submit:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .drawing-complete {
    padding: var(--space-10);
  }

  .complete-icon {
    /* design-system-allow: emoji icon, 56px above token scale; no text token suitable */
    font-size: 56px;
    margin-bottom: var(--space-4);
  }

  .drawing-complete h2 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-3);
  }

  .drawing-complete p {
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    margin-bottom: var(--space-6);
  }

  .btn-next {
    padding: var(--space-3) var(--space-7);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    min-height: 56px;
  }

  .btn-next:hover {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }
</style>
