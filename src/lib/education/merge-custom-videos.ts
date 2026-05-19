import type { CustomVideo, RuntimeVideo } from './schemas';

/**
 * 合約：
 *  - inapplicable trigger 已在 caller 端過濾，本函式不收 inapplicable 情境
 *  - dedupe by videoId（custom 版本取代 static）
 *  - custom 整段 prepend（自訂優先顯示）
 *  - 雙端各自按 score 降冪排
 *  - maxResults 在 merge 後套用
 *  - custom 端 triggers='*' 通用，或 triggers 陣列含當前 trigger 才適用
 */
export function mergeCustomVideos(
  staticVideos: RuntimeVideo[],
  customVideos: CustomVideo[],
  trigger: string,
  options: { maxResults?: number },
): RuntimeVideo[] {
  const filteredCustom = customVideos.filter(c =>
    c.triggers === '*' || c.triggers.includes(trigger),
  );

  const customIds = new Set(filteredCustom.map(c => c.videoId));
  const dedupedStatic = staticVideos.filter(v => !customIds.has(v.videoId));

  const sortedCustom = [...filteredCustom].sort((a, b) => b.score - a.score);
  const sortedStatic = [...dedupedStatic].sort((a, b) => b.score - a.score);

  const merged: RuntimeVideo[] = [...sortedCustom, ...sortedStatic];
  return options.maxResults ? merged.slice(0, options.maxResults) : merged;
}
