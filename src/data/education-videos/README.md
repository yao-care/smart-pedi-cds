# Education Videos Data

兩類 YAML：

1. `../video-catalog/<tier>.yaml`：影片元資料（去重池）
2. `./cdsa-triage.yaml` / `./cdsa-domains.yaml` / `./cdss-vital-signs.yaml`：trigger → videoIds 映射

維護規則：

- 所有變動需通過 `scripts/build-video-index.ts` 重 generate `public/data/video-index.json`，CI 端 `pnpm build:video-index && git diff --exit-code` 守 hash 一致
- `inapplicable: true` 的 trigger 必須與 `scripts/curate/inapplicable-matrix.json` 完全一致（matrix 為 source of truth）
- 影片新增/移除走 `pnpm curate:videos` → Claude Code 複審 → 寫回；不建議手改
- 詳見 `docs/superpowers/specs/2026-05-19-education-videos-design.md`
