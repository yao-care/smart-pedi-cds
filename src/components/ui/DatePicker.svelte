<script lang="ts">
  interface Props {
    value: string;
    onchange: (value: string) => void;
    label?: string;
    id?: string;
    disabled?: boolean;
    min?: string;
    max?: string;
  }

  let {
    value,
    onchange,
    label,
    id = `date-${Math.random().toString(36).slice(2, 8)}`,
    disabled = false,
    min,
    max,
  }: Props = $props();

  function handleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    onchange(target.value);
  }
</script>

<div class="date-picker-wrapper">
  {#if label}
    <label class="date-label" for={id}>{label}</label>
  {/if}
  <input
    {id}
    type="date"
    class="date-input"
    {value}
    {disabled}
    {min}
    {max}
    onchange={handleChange}
  />
</div>

<style>
  .date-picker-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .date-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
  }

  .date-input {
    height: 44px;
    padding: 0 var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
    font-size: 0.875rem;
    font-family: inherit;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .date-input:hover:not(:disabled) {
    border-color: var(--border-strong);
  }

  .date-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .date-input:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    background: color-mix(in srgb, var(--bg), var(--text) 5%);
  }
</style>
