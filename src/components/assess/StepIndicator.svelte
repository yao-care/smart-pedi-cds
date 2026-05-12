<script lang="ts">
  interface Props {
    steps: string[];
    currentStep: number;
  }

  let { steps, currentStep }: Props = $props();
</script>

<nav class="step-indicator" aria-label="評估進度">
  <ol>
    {#each steps as step, i}
      <li
        class="step"
        class:completed={i < currentStep}
        class:active={i === currentStep}
        class:pending={i > currentStep}
        aria-current={i === currentStep ? 'step' : undefined}
      >
        <span class="step-dot">{i < currentStep ? '✓' : i + 1}</span>
        <span class="step-label">{step}</span>
      </li>
    {/each}
  </ol>
</nav>

<style>
  .step-indicator {
    margin-bottom: var(--space-8);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  ol {
    display: flex;
    list-style: none;
    padding: 0;
    margin: 0;
    min-width: max-content;
  }

  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    position: relative;
    min-width: 80px;
  }

  /* Connecting line */
  .step:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 16px;
    left: calc(50% + 16px);
    width: calc(100% - 32px);
    height: 2px;
    background: var(--border-default);
  }

  .step.completed:not(:last-child)::after {
    background: var(--color-risk-normal);
  }

  .step-dot {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xs);
    font-weight: var(--font-bold);
    border: 2px solid var(--border-default);
    background: var(--bg-base);
    color: var(--color-text-subtle);
    position: relative;
    z-index: 1;
  }

  .step.completed .step-dot {
    background: var(--color-risk-normal);
    border-color: var(--color-risk-normal);
    color: #fff;
  }

  .step.active .step-dot {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: #fff;
  }

  .step-label {
    margin-top: var(--space-2);
    font-size: 14px;
    color: var(--color-text-subtle);
    text-align: center;
    white-space: nowrap;
  }

  .step.active .step-label {
    color: var(--color-accent);
    font-weight: var(--font-medium);
  }

  .step.completed .step-label {
    color: var(--color-risk-normal);
  }

  @media (max-width: 640px) {
    .step-label {
      display: none;
    }
    .step {
      min-width: 48px;
    }
  }
</style>
