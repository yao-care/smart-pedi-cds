# 測試

## 怎麼跑
```bash
pnpm test            # 全套（vitest run）
pnpm test:watch      # 監看
pnpm test:coverage   # 覆蓋率
pnpm test:e2e        # Playwright E2E（tests/e2e/parent-flow.spec.ts）
pnpm check           # 型別（astro check + svelte-check）
```
- 框架：vitest + `@testing-library/svelte` + `fake-indexeddb`（`tests/setup.ts` 先 `import 'fake-indexeddb/auto'`，並有全域 fetch stub 回空 index —— 需要真 index 的測試要自己 `vi.resetModules()` + `vi.stubGlobal('fetch', …)`）。
- CI：`.github/workflows/ci.yml`（push/PR 跑 check + lint + test）。

## 守門測試（改資料/內容時最相關）
| 測試 | 守護什麼 |
|------|---------|
| `tests/education/content-index-parity.test.ts` | **每個適用格有文章+影片**（覆蓋率鎖）；代表性推薦內容快照；矩陣 educationSlug 不漏；重構前內容不流失 |
| `tests/data/education-slug-integrity.test.ts` | `content-relevance.yaml` 每個 article slug 有對應 `.md` |
| `tests/data/trigger-uniqueness.test.ts` | trigger key 唯一 |
| `tests/data/education-no-video-fields.test.ts` | 文章 frontmatter 不可含 videoUrl/triggerIndicators/format=video |
| `tests/data/questionnaire-coverage.test.ts` | 每 年齡×適用領域 ≥2 題 |
| `tests/engine/closed-loop-education.test.ts` | closed-loop 指標→文章 對應正確 |
| `tests/design-system.test.ts` | 設計 token/pattern enforcement |

## 其他重點測試區
- `tests/engine/`：triage、radar-scoring、drawing/voice/behavior-analysis、assessment-analyzer、card-selector（CDSA 演算法）。
- `tests/lib/education/`：schemas、video-lookup、trigger-derivation、merge-custom-videos。
- `tests/lib/db/`、`tests/lib/fhir/`、`tests/lib/pdf/`、`tests/lib/sw/`。
- `tests/components/`：問卷流程、ResultView、衛教元件…
- `tests/utils/`：age-groups、tenant、loinc-map、risk-levels、youtube、date。
- `tests/scripts/`：curate heuristics、simplified-detector、yt-dlp。

## 讀結果
- 全綠才合併。失敗時看訊息定位：守門測試失敗通常代表「內容/設定改動破壞了不變量」（例如刪到某格沒內容、slug 沒對應 md）。
- 改內容後若覆蓋率/快照測試「故意」要變（如新增領域），更新測試的預期值即可（content-index-parity 裡的 EXPECTED_SLUGS 等）。
