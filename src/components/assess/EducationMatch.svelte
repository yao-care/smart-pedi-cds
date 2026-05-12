<script lang="ts">
  interface Props {
    domains: string[];
  }

  let { domains }: Props = $props();

  // Static mapping: anomaly domain -> education content slugs and descriptions
  const EDUCATION_MAP: Record<string, Array<{ slug: string; title: string; summary: string }>> = {
    gross_motor: [
      { slug: 'exercise-guide', title: '兒童運動建議', summary: '適齡的粗動作發展活動與運動建議' },
    ],
    fine_motor: [
      { slug: 'exercise-guide', title: '精細動作活動建議', summary: '促進手部精細動作發展的居家活動' },
    ],
    language: [
      { slug: 'milestones/1-2y', title: '語言發展里程碑', summary: '各年齡層語言發展的預期進程與促進方式' },
    ],
    language_comprehension: [
      { slug: 'milestones/1-2y', title: '語言理解發展', summary: '促進語言理解能力的親子互動技巧' },
    ],
    language_expression: [
      { slug: 'milestones/2-3y', title: '語言表達發展', summary: '鼓勵語言表達的日常互動建議' },
    ],
    cognition: [
      { slug: 'milestones/3-6y', title: '認知發展活動', summary: '促進認知能力的遊戲與活動建議' },
    ],
    social_emotional: [
      { slug: 'milestones/2-3y', title: '社會情緒發展', summary: '培養社交能力與情緒管理的建議' },
    ],
    behavior: [
      { slug: 'sleep-hygiene', title: '生活作息建議', summary: '建立良好生活習慣以支持整體發展' },
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
