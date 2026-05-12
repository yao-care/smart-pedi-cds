<script lang="ts">
  import { db } from '$lib/db/schema';

  interface Props {
    recommendedSlugs: string[];
  }

  let { recommendedSlugs }: Props = $props();

  // Static metadata map — in production this would come from a CMS / API.
  // Keys are content slugs; values provide display metadata.
  interface ContentMeta {
    title: string;
    summary: string;
    format: 'article' | 'video' | 'questionnaire';
  }

  const CONTENT_META: Record<string, ContentMeta> = {
    'fever-management': {
      title: '兒童發燒處置指南',
      summary: '說明退燒藥使用時機、劑量計算及返診指徵，適合家長閱讀。',
      format: 'article',
    },
    'nutrition-infant': {
      title: '嬰兒營養補充建議',
      summary: '涵蓋母乳哺育、副食品引入時間與常見營養缺乏的預防策略。',
      format: 'article',
    },
    'vaccination-schedule': {
      title: '兒童疫苗接種時程',
      summary: '台灣公費疫苗完整時程表及注意事項說明。',
      format: 'article',
    },
    'growth-chart-tutorial': {
      title: '生長曲線圖解讀教學',
      summary: '示範如何判讀身高體重百分位，識別生長遲滯警示。',
      format: 'video',
    },
    'developmental-milestones': {
      title: '發展里程碑自我評估',
      summary: '互動式問卷幫助家長評估兒童認知、語言與動作發展。',
      format: 'questionnaire',
    },
  };

  const FORMAT_LABEL: Record<string, string> = {
    article: '文章',
    video: '影片',
    questionnaire: '問卷',
  };

  let readSlugs = $state<Set<string>>(new Set());

  $effect(() => {
    if (recommendedSlugs.length === 0) return;

    db.educationInteractions
      .where('contentSlug')
      .anyOf(recommendedSlugs)
      .filter((r) => r.action === 'complete')
      .toArray()
      .then((rows) => {
        readSlugs = new Set(rows.map((r) => r.contentSlug));
      })
      .catch(() => {});
  });

  let cards = $derived(
    recommendedSlugs.map((slug) => ({
      slug,
      meta: CONTENT_META[slug] ?? {
        title: slug,
        summary: '教育內容',
        format: 'article' as const,
      },
      isRead: readSlugs.has(slug),
    }))
  );
</script>

{#if cards.length > 0}
  <section class="edu-recommend">
    <h3 class="section-title">建議閱讀教育資源</h3>
    <ul class="card-list">
      {#each cards as card (card.slug)}
        <li class="edu-card" class:read={card.isRead}>
          <div class="card-top">
            <span class="format-tag format-tag--{card.meta.format}">
              {FORMAT_LABEL[card.meta.format]}
            </span>
            {#if card.isRead}
              <span class="read-tag">已讀</span>
            {/if}
          </div>
          <h4 class="card-title">{card.meta.title}</h4>
          <p class="card-summary">{card.meta.summary}</p>
          <a
            href="/education/{card.slug}"
            class="read-link"
            aria-label="閱讀：{card.meta.title}"
          >閱讀 →</a>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .edu-recommend {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .section-title {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-subtle);
    margin: 0;
  }

  .card-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .edu-card {
    padding: var(--space-4);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    transition: border-color 0.12s ease;
  }

  .edu-card:hover {
    border-color: var(--color-accent);
  }

  .edu-card.read {
    opacity: 0.75;
  }

  .card-top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .format-tag {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
  }

  .format-tag--article {
    background: var(--color-risk-advisory-bg);
    color: var(--color-risk-advisory);
  }

  .format-tag--video {
    background: var(--color-risk-critical-bg);
    color: var(--color-risk-critical);
  }

  .format-tag--questionnaire {
    background: var(--color-risk-warning-bg);
    color: var(--color-risk-warning);
  }

  .read-tag {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-risk-normal-bg);
    color: var(--color-risk-normal);
  }

  .card-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-base);
    margin: 0;
    line-height: 1.4;
  }

  .card-summary {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  .read-link {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--color-accent);
    text-decoration: none;
    align-self: flex-start;
    margin-top: var(--space-1);
  }

  .read-link:hover {
    text-decoration: underline;
  }
</style>
