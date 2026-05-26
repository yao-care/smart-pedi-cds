# 系統地圖（運維視角）

> 精簡版。完整介紹見根 `README.md`；開發規則見 `CLAUDE.md`。

## 一句話

Astro 5 SSG + Svelte 5 islands 的**零後端**兒科系統，部署在 GitHub Pages，所有邏輯跑在瀏覽器；資料只在瀏覽器 ↔ 醫院 FHIR Server 之間流動。

## 雙角色

| 路由 | 角色 | 說明 |
|------|------|------|
| `/`（落地頁） | 引流 | hero/痛點/3步驟/FAQ/免責，純 Astro 零 island |
| `/assess/` | 家長 | CDSA 發展評估流程（`AssessmentShell` island） |
| `/workspace/` | 醫師 | 工作台（需 SMART-on-FHIR 登入） |
| `/history/` | — | 評估歷史 + PDF |
| `/education/` | — | 衛教矩陣（領域 × 年齡）+ 貢獻/修改/刪除 |
| `/settings/` | 醫師 | FHIR/規則/Webhook/通知/模型/衛教 設定 |

## 兩條臨床引擎

- **CDSA**（兒童發展評估）：問卷 + 畫圖/語音/動作分析 → z-score → 分流（normal/monitor/refer）→ 雷達圖 + 衛教推薦。
- **CDSS**（生理監測決策支援）：心率/血氧/呼吸/體溫/睡眠/活動/醣類 → 規則引擎 + ONNX → 預警等級（normal/advisory/warning/critical）→ 閉環追蹤。

## 什麼在哪（運維最常碰）

| 目錄 | 內容 | 改它做什麼 |
|------|------|-----------|
| `src/data/education/content-relevance.yaml` | **唯一內容↔情境關聯源** | 改衛教文章/影片出現位置 → 見 `content-cookbook.md` |
| `src/data/education/*.md` | 衛教文章本文 | 改/加文章 |
| `src/data/video-catalog/*.yaml` | 影片 metadata（事實） | 加影片 |
| `src/data/questionnaire/questions.json` | CDSA 問卷 | 改題目 → `data-and-config.md` |
| `src/data/rules/*.yaml`、`baselines/*.json` | CDSS 閾值/常模 | 改預警門檻 → `data-and-config.md` |
| `src/lib/education/schemas.ts` | 領域/指標 enum + zod schema | 改領域定義 |
| `src/lib/utils/age-groups.ts` | 年齡分段 | 改年齡 |
| `src/engine/cdsa/` | 評估演算法（畫圖/語音/動作/triage/雷達） | 改量測邏輯（需領域知識） |
| `src/engine/`（closed-loop, workers…） | CDSS 規則引擎/ML/閉環 | 改監測邏輯 |
| `scripts/build-content-index.ts` | 由 content-relevance.yaml 產 `public/data/video-index.json` | 內容編譯（prebuild 自動跑） |
| `workers/education-contribution/` | Cloudflare Worker：貢獻/修改/刪除 → 開 GitHub issue | 見 `deploy.md` + `DEPLOY.md` |

## 資料流（衛教內容）

```
content-relevance.yaml ──build-content-index──▶ public/data/video-index.json
                                                   │
        ┌──────────────────────┬───────────────────┴─────────────┐
        ▼                      ▼                                 ▼
   矩陣瀏覽 /education/    評估後推薦（年齡感知）            觸發影片 + closed-loop
   (Astro，0 JS)          ResultView/EducationMatch         video-lookup / 工作台警示
```

詳見：`content-cookbook.md`（內容維護）、`data-and-config.md`（設定）、`deploy.md`（建置/部署）、`testing.md`、`troubleshooting.md`。
