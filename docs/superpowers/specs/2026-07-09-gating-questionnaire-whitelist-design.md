# 分流 gating 白名單化 + drawing/behavior display-only 設計

日期：2026-07-09
狀態：設計（待實作）
範圍：評估引擎正確性（三塊報告強化的第一塊；文案層、red flag 安全網為後續獨立迭代）

## 1. 背景與問題（已讀 code 核實）

三個專業視角（家長／醫師／心理）審視評估報告時，醫師視角挖出並經核實的分流正確性問題：

- **gating 只排除 pose/voice**（`src/engine/cdsa/triage.ts:297`）：
  `if (d.metric === 'poseClassification' || d.metric === 'voiceDuration') continue;`
  仍進入 per-domain gating 的還有：
  - **drawing**：`{ domain: 'fine_motor', metric: 'drawingScore', directionalZ }`（`triage.ts:166`）→ 與問卷 fine_motor 的 ASQ-3 z **同桶取平均**（`triage.ts:298-305`）。一個沒有臨床效度的畫圖啟發式分數，可以把問卷本該 refer 的 fine_motor 拉回 monitor/normal，或反向製造假警訊。
  - **behavior**：4 個遊戲 metric（`completionRate` / `operationConsistency` / `reactionLatency` / `interactionRhythm`，`triage.ts:128-133`）→ 獨立成 `behavior` 面向，直接輸出 refer/monitor。
- **這些啟發式對比的常模是手寫任意值**（`triage.ts:89-96` 的 `defaults`：completionRate 0.75、drawingScore 55、reactionLatency 2000…），無任何臨床效度來源；`normThresholds` 表通常無資料，實務上就是用這些寫死值。
- 因此「分流由已驗證 ASQ-3 常模驅動」的說法目前站不住腳：behavior 面向純靠杜撰常模，而 behavior/行為根本不是 ASQ-3 的發展領域；drawing 還會污染 fine_motor。

這與先前 pose/voice 的稀釋問題（commit `e518b4b`…`3abd342`）**完全同性質**——非 ASQ-3 常模背書的感測啟發式不應驅動臨床分流。當時只排除了 pose/voice，遺漏 drawing/behavior。

## 2. 決策摘要（brainstorming 已拍板）

1. **drawing + behavior 都改 display-only**：兩者的 detail 仍保留在 `triageResult.details`（供雷達顯示與醫師檢視），但**不參與 per-domain gating**。
2. **gating 改採白名單**：per-domain gating **只納入 `metric === 'questionnaireScore'`**（唯一有 ASQ-3 常模背書者），取代目前「逐一黑名單排除感測 metric」。等價於排除 pose/voice/drawing/behavior 全部感測，且一勞永逸防止未來新增感測 metric 誤入 gating。語意：**分流只由 ASQ-3 問卷常模驅動**。
3. **歷史評估一併重算**：`recompute-triage.ts` 的 gating loop 同步白名單化，bump IDB v9 upgrade tx 重算所有歷史評估（複用 `applyTriageRecomputeUpgrade`）。

## 3. 詳細設計

### 3.1 gating 白名單化（`src/engine/cdsa/triage.ts`）

per-domain gating loop（`triage.ts:290-302`）改為：

```ts
const domainZs: Record<string, number[]> = {};
for (const d of details) {
  // 白名單：per-domain gating 只由 ASQ-3 問卷常模驅動。所有感測啟發式
  // （pose/voice/drawing/behavior）對比的是非臨床效度常模（手寫 defaults 或
  // 佔位模型），一律 display-only——仍保留在 details 供雷達顯示與醫師檢視，
  // 但不進 gating，避免稀釋或杜撰問卷的分流判定。
  if (d.metric !== 'questionnaireScore') continue;
  if (d.directionalZ !== null && d.directionalZ !== undefined) {
    if (!domainZs[d.domain]) domainZs[d.domain] = [];
    domainZs[d.domain].push(d.directionalZ);
  }
}
```

`directionalZ` 的 null/undefined guard 保留（防禦）。

**下游影響**：
- `fine_motor`：變純問卷驅動（drawing 顯示但不 gate），與 gross_motor（pose 已排除）一致。
- `behavior`：無 `questionnaireScore` 來源（問卷沒有 behavior domain），故 `domainLevelZ`／`domainCategories` **不含 behavior**。`referDomains`／`monitorDomains`／overall category／summary 皆不再受 behavior 影響。雷達仍畫 behavior 面向分數（`computeDomainScores` 讀 details，不受 gating 影響），但 UI 不會對 behavior 標分流色。

### 3.2 per-detail isAnomaly 維持不變（顯式記錄，非變更）

drawing/behavior 的 per-detail `isAnomaly` **仍照算並保留**（與 pose/voice 一致，`isAnomaly` 是 UI 提示、不參與 gating）。這代表 `anomalyDomains`（`ResultView` 用來觸發衛教 `EducationMatch`）仍可能包含 behavior/fine_motor 的感測 isAnomaly。此為**刻意保留、可接受**：衛教觸發是軟提示，非分流判定；若未來要讓衛教觸發也完全不受手寫常模影響，屬後續議題（文案層），不在本塊範圍。

### 3.3 recompute 同步（`src/lib/baselines/recompute-triage.ts`）

歷史重算的 gating loop（目前排除 pose/voice）同步白名單化為 `if (d.metric !== 'questionnaireScore') continue;`，與 live triage 一致。

注意既有的 v7 drawing sanitize（`d.metric === 'drawingScore' && d.value === 0` 過濾）保留不變——它清的是假 0 分髒資料，與 gating 白名單正交；drawing 不進 gating 後該過濾對 gating 已無影響，但保留可維持 details 乾淨、無害。

### 3.4 IDB v9 upgrade（`src/lib/db/schema.ts`）

bump `this.version(9)`，stores 與 v8 相同（無索引變更，domain/metric 皆非索引欄位），`.upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v9'))`。`applyTriageRecomputeUpgrade` 的 version 參數型別加 `'v9'`。每筆 assessment in-memory 重算，毫秒級。

## 4. 測試計畫（TDD，先寫失敗測試）

`tests/engine/triage.test.ts`：
1. **drawing 不稀釋 fine_motor**：問卷 fine_motor refer（value 2/max 20）+ drawing『正常』(z≈0)，對照有無 drawing → `domainCategories.fine_motor` 皆 `refer`、`domainLevelZ.fine_motor` 不變（withDrawing/withoutDrawing 對照，同上次 pose 測試手法）。
2. **behavior 不產出 gating**：behavior 遊戲 metric 再差，`domainCategories.behavior` 與 `domainLevelZ.behavior` 皆 `undefined`；overall category 不受 behavior 影響。
3. **白名單等價性**：一份含 pose/voice/drawing/behavior + 問卷的 input，gating 僅反映問卷 domain。

`tests/lib/recompute-triage.test.ts`：
4. 歷史 details 含 drawing/behavior，重算後 `domainCategories` 只含問卷 domain、drawing 不污染 fine_motor。

`tests/lib/db/v9-upgrade.test.ts`（新檔，仿 v8-upgrade）：
5. seed 一筆「drawing 污染 fine_motor 成 monitor」的 v5 評估，經 v5→v9 chain 後 `schemaVersion==='v9-recomputed'`、fine_motor 只反映問卷、behavior 不在 domainCategories。

## 5. 驗證方式

- 全套單元測試綠（`pnpm test`）。
- `pnpm check` 0 error、`pnpm build` + SEO 守門過。
- Live 冒煙：部署後重新載入觸發 v9 upgrade，開歷史評估確認分流只反映問卷（此塊不改顯示文字，雷達分數可能因 behavior/drawing 不再影響 overall 而使 summary 改變）。

## 6. 非目標（後續獨立迭代）

- **文案層**：拿掉「信心度 %」、換「異常/顯著落後」措辭、加下一步／亮點／別自責／別在孩子面前談分數區塊、把 `when-to-seek-help.md` 搬進結果頁與 PDF。
- **red flag 安全網**：獨立於分流平均的 age-band 紅旗硬觸發。
- **FHIR 法規揭露**：status=final→preliminary、pose/voice 上傳揭露、常模來源標示（用戶本輪暫緩）。
- **behavior 面向是否該續留雷達**：behavior 失去 gating 後純顯示，是否移除或保留該面向屬顯示決策，歸文案層。

## 7. 風險與注意

- v9 重算會改變部分歷史評估的 overall category（凡先前被 drawing/behavior 影響者）。這是**刻意矯正**（更嚴格地只信問卷），與臨床安全方向一致，但需在 commit message 與 memory 記錄，避免被誤認為回歸。
- **已驗證**：grep 確認 `domainCategories`／`domainLevelZ` 在 `triage.ts`／`recompute-triage.ts` 以外**無任何消費端**（UI 的 `ResultView` 用 `triageResult.category`／`details`／`anomalyDomains`，不讀 `domainCategories`），亦無任何路徑直接讀 `.behavior`。故 behavior 不再出現在 `domainCategories` 對現有程式無破壞。
