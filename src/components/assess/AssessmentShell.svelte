<script lang="ts">
  import StepIndicator from './StepIndicator.svelte';

  const STEPS = ['基本資料', '問卷', '互動遊戲', '語音互動', '影片錄製', '繪圖測試', '分析中', '評估結果'];
  let currentStep = $state(0);
</script>

<div class="assessment-shell">
  <StepIndicator steps={STEPS} {currentStep} />

  <div class="step-content">
    {#if currentStep === 0}
      <div class="placeholder-step">
        <h2>基本資料</h2>
        <p>請輸入兒童的基本資料以開始評估。</p>
        <p class="dev-note">（ChildProfile 元件將在 B5 實作）</p>
        <button class="btn-next" onclick={() => currentStep++}>下一步</button>
      </div>
    {:else if currentStep < STEPS.length - 1}
      <div class="placeholder-step">
        <h2>{STEPS[currentStep]}</h2>
        <p>此步驟即將實作。</p>
        <div class="step-nav">
          <button class="btn-back" onclick={() => currentStep--}>← 上一步</button>
          <button class="btn-next" onclick={() => currentStep++}>下一步 →</button>
        </div>
      </div>
    {:else}
      <div class="placeholder-step">
        <h2>評估結果</h2>
        <p>評估完成！結果將顯示於此。</p>
        <button class="btn-back" onclick={() => currentStep = 0}>重新開始</button>
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
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder-step {
    text-align: center;
    padding: var(--space-8);
  }

  .placeholder-step h2 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-4);
  }

  .placeholder-step p {
    font-size: var(--text-base);
    color: var(--color-text-muted);
    margin-bottom: var(--space-6);
  }

  .dev-note {
    font-size: var(--text-xs);
    color: var(--color-text-subtle);
    font-style: italic;
  }

  .step-nav {
    display: flex;
    gap: var(--space-4);
    justify-content: center;
  }

  .btn-next, .btn-back {
    padding: var(--space-3) var(--space-7);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    border: none;
    min-height: 56px;
  }

  .btn-next {
    background: var(--color-accent);
    color: #fff;
  }

  .btn-next:hover {
    background: var(--color-accent-hover);
  }

  .btn-back {
    background: var(--bg-surface);
    color: var(--color-text-muted);
    border: 1px solid var(--border-default);
  }

  .btn-back:hover {
    background: var(--bg-muted);
  }
</style>
