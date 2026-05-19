<script lang="ts">
import type { RuntimeVideo } from '$lib/education/schemas';

interface Props { video: RuntimeVideo; }
const { video }: Props = $props();

let showIframe = $state(false);
let thumbFailed = $state(false);

const tierLabel: Record<RuntimeVideo['sourceTier'], string> = {
  'official-tw': '官方',
  international: '國際',
  'pro-kol': '專業',
};

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m} 分 ${s} 秒`;
}

function isSessionFailed(id: string): boolean {
  if (typeof window === 'undefined' || !('sessionStorage' in window)) return false;
  try {
    const set = sessionStorage.getItem('failed-thumbnails');
    return set ? set.split(',').includes(id) : false;
  } catch { return false; }
}

function markSessionFailed(id: string): void {
  if (typeof window === 'undefined' || !('sessionStorage' in window)) return;
  try {
    const cur = sessionStorage.getItem('failed-thumbnails') ?? '';
    sessionStorage.setItem('failed-thumbnails', cur ? `${cur},${id}` : id);
  } catch {}
}

$effect(() => { if (isSessionFailed(video.videoId)) thumbFailed = true; });

function onPlay() { showIframe = true; }
function onImgError() { markSessionFailed(video.videoId); thumbFailed = true; }
</script>

<article class="video-card">
  {#if !showIframe}
    {#if !thumbFailed}
      <button
        type="button"
        onclick={onPlay}
        aria-label={`播放影片：${video.title}（${fmtDuration(video.duration)}）`}
      >
        <img
          src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
          alt={video.title}
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror={onImgError}
        />
        <span class="play-icon" aria-hidden="true">▶</span>
      </button>
    {:else}
      <button
        type="button"
        onclick={onPlay}
        class="no-thumbnail"
        aria-label={`播放影片：${video.title}（${fmtDuration(video.duration)}）`}
      >
        <span class="big-title">{video.title}</span>
        <span class="play-icon" aria-hidden="true">▶ 觀看</span>
      </button>
    {/if}
  {:else}
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${video.videoId}?cc_load_policy=1&hl=zh-Hant&modestbranding=1&autoplay=1`}
      title={video.title}
      loading="lazy"
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
      referrerpolicy="no-referrer"
      allowfullscreen
    ></iframe>
  {/if}
  <div class="meta">
    <span class="badge">{tierLabel[video.sourceTier]}</span>
    <span class="title">{video.title}</span>
    <span class="duration">{fmtDuration(video.duration)}</span>
  </div>
</article>

<style>
.video-card { display: flex; flex-direction: column; min-width: 280px; }
.video-card button { min-height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer; }
.video-card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: var(--radius-md); }
.video-card iframe { width: 100%; aspect-ratio: 16/9; border: 0; border-radius: var(--radius-md); }
.no-thumbnail { aspect-ratio: 16/9; background: var(--surface); display: flex; flex-direction: column; justify-content: center; align-items: center; padding: var(--space-4); }
.no-thumbnail .big-title { font-size: var(--text-lg); font-weight: var(--font-bold); line-height: 1.3; }
.play-icon { font-size: var(--text-base); margin-top: var(--space-2); }
.meta { padding: var(--space-2) 0; display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.badge { background: var(--surface); padding: var(--space-1) var(--space-2); border-radius: var(--radius-lg); font-size: var(--text-sm); }
.title { font-size: var(--text-base); display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1; }
.duration { font-size: var(--text-sm); color: var(--text); opacity: 0.7; }
</style>
