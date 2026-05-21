# 影片 Catalog — YAML 影片資料單一來源

## 用途

所有「衛教影片」的元資料 = 此目錄 + `../education-videos/` 兩套 yaml。**Markdown 不放影片**（schema 已禁止）。

## 雙層結構

```
src/data/video-catalog/        # 影片本身的元資料（catalog）
├── official-tw.yaml           # Tier 1 — 台灣官方頻道（國健署、各醫學中心、學會）
├── international.yaml         # Tier 2 — 國際認證頻道（AAP、CDC、NHS 等）
└── pro-kol.yaml               # Tier 3 — 醫療專業 KOL（醫師個人頻道）

src/data/education-videos/     # trigger → videoIds 映射
├── cdsa-triage.yaml           # CDSA 分流結果（refer/monitor × 7 ageGroup）
├── cdsa-domains.yaml          # CDSA domain 異常 × 7 ageGroup
└── cdss-vital-signs.yaml      # CDSS 生理警示 × 7 indicator × 3 ageGroup
```

## Catalog item schema（每支影片）

```yaml
- videoId: "abc123XYZ45"            # YouTube 11 字元 ID
  title: "..."
  channel: "..."
  channelId: "UC..." (22 字元 UC* 開頭)
  duration: 514                     # 秒
  publishedAt: "2024-03-15"
  language: "zh-Hant" | "en"
  subtitleType: "human" | "auto" | "none"
  sourceTier: "official-tw" | "international" | "pro-kol"
  viewCount: 161421
  curatedAt: "2026-05-21"
  verifiedBy: "claude-code" | "manual"
  verificationStatus: "verified" | "rejected"
  score: 0.85                       # heuristics 0-1
  notes: "..."                      # 自由說明（複審 + 來源備註）
```

## Trigger entry schema（影片對應到評估情境）

```yaml
- trigger: cdss.sugar_intake.critical.preschool
  category: vital-sign              # 'triage' | 'domain' | 'vital-sign'
  indicator: sugar_intake           # 對應 categorical fields
  level: critical
  ageGroup: preschool
  educationSlug: diet-control       # 連結 src/data/education/<slug>.md（可選）
  videoIds:
    - MwGCCsMcegw
    - xvI_F3cPEvI
    - ...
```

## 維護流程（新增影片）

1. **找到 YouTube 影片**（自行人工挑選，或跑 `pnpm curate:videos` 自動 curate）
2. **抓 metadata**：`yt-dlp --skip-download --print "%(id)s|%(title)s|..." "https://www.youtube.com/watch?v=<id>"`
3. **寫進對應 tier yaml**：依頻道身分判斷 official-tw / international / pro-kol
4. **加 trigger 對應**：在 `education-videos/<file>.yaml` 找對應 trigger entry，把 videoId 加進 `videoIds:` 陣列
5. **rebuild + 跑測試**：
   ```bash
   pnpm build:video-index   # 重產 public/data/video-index.json
   pnpm test                # 含 questionnaire-coverage / index-consistency
   ```
6. **commit + push**

## ❌ 不要

- **不要**把影片寫進 `src/data/education/*.md` 的 frontmatter
- **不要**省略 channelId（schema 強制 `UC[A-Za-z0-9_-]{22}` 格式）
- **不要**直接編輯 `public/data/video-index.json`（由 build script 產出）

## 自動化工具

- `scripts/curate-videos.ts` — yt-dlp 自動搜尋 + heuristics 評分 + 產 report
- `scripts/build-video-index.ts` — 從本目錄 + education-videos/ 產 `public/data/video-index.json`
- `scripts/curate/inapplicable-matrix.json` — 哪些 trigger 在哪些 ageGroup 是 inapplicable（spec §3.5 sign-off gate）

詳見 `docs/superpowers/specs/2026-05-19-education-videos-design.md`。

## 已建立的測試守護

- `tests/data/education-no-video-fields.test.ts` — markdown 不可含 videoUrl / triggerIndicators / format=video
- `tests/data/inapplicable-consistency.test.ts` — matrix ↔ yaml inapplicable 一致
- `tests/data/index-consistency.test.ts` — yaml ↔ video-index.json 同步
- `tests/data/trigger-uniqueness.test.ts` — 跨 yaml 檔 trigger key 唯一
- `tests/data/education-slug-integrity.test.ts` — educationSlug 對應 markdown 真實存在
