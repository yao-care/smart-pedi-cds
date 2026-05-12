<script lang="ts">
  interface Props {
    domains: string[];
  }

  let { domains }: Props = $props();

  // Static mapping: anomaly domain -> education content slugs and descriptions
  const EDUCATION_MAP: Record<string, Array<{ slug: string; title: string; summary: string }>> = {
    gross_motor: [
      { slug: 'gross-motor-activities', title: '粗動作發展促進活動', summary: '各年齡層的粗動作訓練遊戲與居家活動' },
      { slug: 'exercise-guide', title: '兒童運動建議', summary: '適齡運動與活動建議' },
    ],
    fine_motor: [
      { slug: 'fine-motor-activities', title: '精細動作發展促進活動', summary: '手部精細動作與手眼協調居家活動' },
    ],
    language: [
      { slug: 'language-stimulation', title: '語言發展促進技巧', summary: '親子互動促進語言能力的方法' },
    ],
    language_comprehension: [
      { slug: 'language-stimulation', title: '語言發展促進技巧', summary: '促進語言理解的親子互動方式' },
    ],
    language_expression: [
      { slug: 'language-stimulation', title: '語言發展促進技巧', summary: '鼓勵語言表達的日常互動' },
    ],
    cognition: [
      { slug: 'cognitive-play', title: '認知發展遊戲建議', summary: '分類、配對、因果理解遊戲' },
    ],
    social_emotional: [
      { slug: 'social-emotional-guide', title: '社會情緒發展引導', summary: '社交互動與情緒管理建議' },
    ],
    behavior: [
      { slug: 'sleep-hygiene', title: '生活作息建議', summary: '良好生活習慣支持整體發展' },
    ],
  };

  const recommendations = $derived.by(() => {
    const seen = new Set<string>();
    const results: Array<{ slug: string; title: string; summary: string }> = [];
    for (const domain of domains) {
      const items = EDUCATION_MAP[domain] ?? [];
      for (const item of items) {
        if (!seen.has(item.slug)) {
          seen.add(item.slug);
          results.push(item);
        }
      }
    }
    // Always add "when to seek help" when there are anomaly domains
    if (domains.length > 0) {
      results.push({ slug: 'when-to-seek-help', title: '何時該尋求專業協助', summary: '發展警訊與轉介流程說明' });
    }
    return results;
  });
</script>

{#if recommendations.length > 0}
  <div class="education-match">
    {#each recommendations as rec}
      <a href="/smart-pedi-cds/education/{rec.slug}/" class="edu-card">
        <h4>{rec.title}</h4>
        <p>{rec.summary}</p>
        <span class="read-link">閱讀 →</span>
      </a>
    {/each}
  </div>
{:else}
  <p class="no-recommendations">目前無特別建議。持續關注孩子的發展即可。</p>
{/if}

<style>
  .education-match {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  .edu-card {
    display: block;
    padding: var(--space-5);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    text-decoration: none;
    color: inherit;
    transition: border-color 0.2s;
  }

  .edu-card:hover {
    border-color: var(--color-accent);
  }

  .edu-card h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    margin-bottom: var(--space-2);
    color: var(--color-text-base);
  }

  .edu-card p {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-bottom: var(--space-3);
  }

  .read-link {
    font-size: var(--text-xs);
    color: var(--color-accent);
    font-weight: var(--font-medium);
  }

  .no-recommendations {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-align: center;
    padding: var(--space-4);
  }
</style>
