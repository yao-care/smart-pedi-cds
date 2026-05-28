<script lang="ts">
  // 「新版已可用」橫幅已移除（2026-05-28）：
  // SW 用 install:skipWaiting + activate:clients.claim 立刻接管所有 client，
  // HTML 又是 network-first，刷新時 page 內容必為新版 → 提示「重整套用」沒
  // 實質意義，反而造成「已 hard refresh 卻仍見橫幅」的 UX 困惑。
  // 保留 offline 偵測，仍對使用者有用（顯示「離線模式」）。
  let online = $state(true);
  let mounted = $state(false);

  $effect(() => {
    online = navigator.onLine;
    mounted = true;

    function onOnline() { online = true; }
    function onOffline() { online = false; }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  });
</script>

{#if mounted && !online}
  <div class="banner banner-offline" role="status">
    離線模式 — 部分功能可能受限
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    padding: 0.5rem 1rem;
    text-align: center;
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
  }

  .banner-offline {
    background: var(--warn);
    color: white;
  }
</style>
