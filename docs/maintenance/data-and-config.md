# 資料與設定維護

> 改「設定值/結構」類（非衛教內容；衛教內容見 `content-cookbook.md`）。

## CDSS 預警閾值
- `src/data/rules/pediatric-default.yaml`：年齡組 × 指標 × 等級（normal/advisory/warning/critical）的閾值；含多指標升級與趨勢規則。
- 改完規則引擎 worker 會吃新值；跑 `pnpm test --run`（規則相關測試）。
- 醫院端可在 `/settings`（規則編輯器）以租戶 overlay 覆寫，不必改原始碼。

## 人群常模（z-score 基準）
- `src/data/baselines/pediatric-baselines.json`：每 年齡×性別×指標 的 mean/std/min/max/p25/p75。
- CDSA triage 的 z-score 也用到常模（`src/engine/cdsa/triage.ts` 有 DB-load + hardcoded default 兩層）。
- 換常模只改數值，結構不變。

## 問卷（CDSA）
- `src/data/questionnaire/questions.json`：每題含 `domain`、`ageGroups`、`text`、`clinicallyReviewed`。
- 改完跑 `build-questionnaire-applicability`（prebuild 自動）產生 `src/lib/data/expected-questionnaire-domains.generated.json`。
- 守門：`tests/data/questionnaire-coverage.test.ts`（每 年齡×適用領域 ≥2 題）。

## 年齡分段
- `src/lib/utils/age-groups.ts`：`AGE_GROUPS_CDSA`（目前 `2-6m … 61-72m`）、`isEligible()`、`instructionLevel()`。
- 改它影響全站（矩陣欄、問卷適用、常模 key、triage、inapplicable）。測試：`tests/utils/age-groups.test.ts`。

## 領域 / 指標 enum（單一源）
- `src/lib/education/schemas.ts`：`CDSA_DOMAIN_NAMES`（8 發展領域）、`CDSS_INDICATOR_NAMES`（7 指標）、`SEVERITY_NAMES`。
- 這是領域/指標清單的**唯一源** —— `trigger-derivation.ts` 等都從這裡 import，不要在別處再硬寫。
- 改領域要連帶檢查：`content-relevance.yaml`、`card-selector.ts` 的 `CardDomain`、`recommendations.ts` 的 `DOMAINS`、矩陣頁領域中文標籤、`triage.ts` 的 `DOMAIN_LABELS`。

## 互動圖卡
- `src/data/cards/index.json`：60 張，每張 domain + 來源/授權。產生器 `pnpm generate:cards`。

## 品牌 / 文案（改站名時）
- 站名/標題：`src/layouts/Base.astro`、`Assess.astro`、`src/components/blocks/Header.astro`、`scripts/templates/manifest.template.json`
- 落地/關於文案：`src/pages/index.astro`、`about.astro`、各頁 `description`
- 網域/身分：`astro.config.mjs`（site）、`scripts/base.mjs`（BASE_PATH）、`package.json`、`src/lib/db/schema.ts`（IndexedDB 名）、`src/lib/fhir/cdsa-resources.ts`（FHIR code system）
> 完整「改作他用」清單見 `../repurpose-to-aging-assessment.md`。
