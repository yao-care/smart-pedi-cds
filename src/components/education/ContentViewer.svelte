<script lang="ts">
  import { db } from '$lib/db/schema';
  import { toEmbedUrl } from '$lib/utils/youtube';
  import InteractionTracker from './InteractionTracker.svelte';

  interface Props {
    slug: string;
    title: string;
    format: 'article' | 'video' | 'questionnaire';
    videoUrl?: string;
  }

  let { slug, title, format, videoUrl = '' }: Props = $props();
  const embedUrl = $derived(format === 'video' ? toEmbedUrl(videoUrl) : null);

  let isRead = $state(false);
  let markingRead = $state(false);

  // Check existing completion on mount
  $effect(() => {
    db.educationInteractions
      .where('contentSlug')
      .equals(slug)
      .filter((r) => r.action === 'complete')
      .count()
      .then((count) => {
        isRead = count > 0;
      })
      .catch(() => {});
  });

  async function markAsRead() {
    if (isRead || markingRead) return;
    markingRead = true;
    try {
      await db.educationInteractions.add({
        id: crypto.randomUUID(),
        contentSlug: slug,
        action: 'complete',
        createdAt: new Date(),
      });
      isRead = true;
    } catch {
      // Non-critical
    } finally {
      markingRead = false;
    }
  }
</script>

<!-- InteractionTracker runs in background and records view + duration automatically -->
<InteractionTracker contentSlug={slug} />

<article class="content-viewer">
  <header class="viewer-header">
    <div class="header-top">
      <span class="format-badge format-badge--{format}">
        {format === 'article' ? '文章' : format === 'video' ? '影片' : '問卷'}
      </span>
      {#if isRead}
        <span class="read-badge">已讀</span>
      {/if}
    </div>
    <h1 class="viewer-title">{title}</h1>
  </header>

  <div class="viewer-body">
    {#if format === 'video'}
      <div class="video-container">
        {#if embedUrl}
          <iframe
            src={embedUrl}
            title={title}
            class="video-iframe"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
        {:else}
          <div class="video-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <p>{videoUrl ? '影片無法載入' : '影片連結未設定'}</p>
            {#if videoUrl}
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" class="fallback-link">
                以原始連結開啟 →
              </a>
            {/if}
          </div>
        {/if}
      </div>

      {#if !isRead}
        <div class="read-action">
          <button
            class="mark-read-btn"
            onclick={markAsRead}
            disabled={markingRead}
          >
            {markingRead ? '標記中...' : '標記為已觀看'}
          </button>
        </div>
      {/if}

    {:else if format === 'questionnaire'}
      <div class="questionnaire-placeholder">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
        </svg>
        <p>互動式問卷（開發中）</p>
        <p class="placeholder-sub">問卷功能即將上線，敬請期待。</p>
      </div>
    {/if}
  </div>
</article>

<style>
  .content-viewer {
    max-width: 720px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .viewer-header {
    padding: var(--space-5) var(--space-6);
    border-bottom: 1px solid var(--line);
    background: var(--bg);
  }

  .header-top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .format-badge {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: var(--font-bold);
    letter-spacing: 0.04em;
  }

  .format-badge--article {
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
    color: color-mix(in srgb, var(--accent) 85%, black);
  }

  .format-badge--video {
    background: color-mix(in srgb, var(--bg), var(--text) 5%);
    color: var(--text);
  }

  .format-badge--questionnaire {
    background: color-mix(in srgb, var(--accent) 12%, var(--bg));
    color: var(--accent);
  }

  .read-badge {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: var(--font-bold);
    letter-spacing: 0.04em;
    background: color-mix(in srgb, var(--accent) 12%, var(--bg));
    color: var(--accent);
  }

  .viewer-title {
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    color: var(--text);
    margin: 0;
    line-height: 1.4;
  }

  .viewer-body {
    padding: var(--space-6);
  }

  .article-content {
    font-size: var(--text-sm);
    color: var(--text);
    line-height: 1.7;
  }

  .placeholder-text {
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    font-size: var(--text-xs);
  }

  .read-action {
    margin-top: var(--space-6);
    padding-top: var(--space-5);
    border-top: 1px solid var(--line);
    display: flex;
    justify-content: flex-end;
  }

  .mark-read-btn {
    padding: var(--space-2) var(--space-5);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: opacity 0.12s ease;
  }

  .mark-read-btn:hover:not(:disabled) {
    opacity: 0.88;
  }

  .mark-read-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .video-container {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: black;
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .video-iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  .video-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    color: color-mix(in srgb, var(--text), var(--bg) 40%);
  }

  .video-placeholder p {
    margin: 0;
    font-size: var(--text-xs);
  }

  .fallback-link {
    color: var(--accent);
    font-size: var(--text-xs);
    text-decoration: none;
  }

  .fallback-link:hover {
    text-decoration: underline;
  }

  .questionnaire-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-10) 0;
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    text-align: center;
  }

  .questionnaire-placeholder p {
    margin: 0;
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--text);
  }

  .placeholder-sub {
    font-size: var(--text-xs) !important;
    font-weight: var(--font-normal) !important;
    color: color-mix(in srgb, var(--text), var(--bg) 45%) !important;
  }
</style>
