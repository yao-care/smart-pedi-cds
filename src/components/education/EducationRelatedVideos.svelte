<script lang="ts">
  import TriggerVideoList from './TriggerVideoList.svelte';

  interface Props { slug: string; }
  const { slug }: Props = $props();

  let triggers = $state<string[]>([]);

  $effect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(`${base}/data/video-index.json`)
      .then(r => r.ok ? r.json() : null)
      .then(idx => {
        if (idx) triggers = idx.educationSlugToTriggers?.[slug] ?? [];
      })
      .catch(err => {
        console.error('[education] fetch video-index failed', err);
      });
  });
</script>

{#if triggers.length > 0}
  <section class="related-videos" aria-label="相關影片">
    <h2>相關影片</h2>
    <TriggerVideoList {triggers} />
  </section>
{/if}

<style>
  .related-videos {
    margin-top: var(--space-7);
  }

  .related-videos h2 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-md, 16px);
  }
</style>
