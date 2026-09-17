# 相依弱點風險接受記錄（ISO 27001 A.8.8 技術弱點管理）

> 本檔記錄**經評估後決定暫不修補**的相依弱點，及其理由與再評估條件。
> 已修補者不列入此處，逕由 git log 與 Dependabot PR 佐證。
> 掃描報告的**誤報判定**另見 [scan-false-positives.md](scan-false-positives.md)；
> 兩者不同：誤報是「掃描器判斷錯誤」，本檔是「掃描器判斷正確，但我們評估後接受風險」。
>
> ⚠️ 風險接受**不是**忽略：每筆均須有可驗證的不適用理由或上游阻因，
> 並訂定再評估時機。條件一旦改變即須重新處置。

## 複查 2026-09-17（`pnpm audit`）

距上次處置（掃描 `20260714-231430-127e`，見 `scan-false-positives.md` 與
commit `13c33dd` / `1053dd3` / `64237bc`）兩個月，上游新增告警，
其中 **1 筆 critical** 需要判定。

### 已修補

#### 1. astro 6.4.6 → 7.3.3 — AVIF image optimization RCE（Critical）

- **處置（2026-09-17）**：升級 `astro@^7.3.3` + `@astrojs/svelte@^9.0.1`
  （peer 要求 astro ^7）＋ sitemap／rss 同步升版；override 中無範圍的
  `"vite": "^7.3.5"` 改為範圍限定，否則會把 astro 7 需要的 vite ^8 鎖死。
  升級後 `pnpm audit` critical 歸零。
- **驗證**：`pnpm check` 0 error、735 測試全綠、`pnpm build` 完成且 SEO 守門通過。
- **以下為升級前的判定記錄（保留供稽核）**

- **弱點**：透過 AVIF 影像最佳化路徑可達成遠端程式碼執行。
- **影響版本／修補版**：`<7.2.8` → `>=7.2.8`。**6.x 分支無修補版**，
  修補僅存在於 Astro 7。
- **不適用理由（已核實）**：本專案**未使用 Astro 的影像最佳化**——`src/` 內無
  `astro:assets` 匯入、無 `<Image>` / `<Picture>` 元件，`astro.config.mjs` 未設定
  `image`。圖卡（`public/cards/`）、icon、OG 圖皆由自有腳本產生為靜態檔
  （`generate:cards` / `generate:icons` / `generate:og`），不經 Astro 最佳化管線。
  **觸發條件在本專案不成立。**
  另本站為 SSG 部署於 GitHub Pages，執行期無 Node 伺服器可被觸及；即使觸發也僅限
  建置期（CI runner 與維運者本機），輸入為 repo 內自有檔案。
- **上游阻因**：修補需升級至 Astro 7（major）。跨 major 升級會牽動 Content Layer、
  integrations 與既有產生檔／SEO 守門管線，屬獨立工作，不宜夾在安全修補中倉促進行。
- **再評估條件**（任一成立即須立即處置）：
  1. 本專案開始使用 `astro:assets` / `<Image>` / `<Picture>`，或設定影像最佳化
     → **升級 Astro 7 必須先於該功能上線**；
  2. 出現針對建置期的實際利用手法，或 CI 開始處理外部來源的影像；
  3. Astro 7 升級評估完成（三個 CDS app 宜一併進行，版本相同）。
- **相同狀況的 repo**：`smart-geri-cds`、`smart-func-cds` 亦為 astro 6.4.8，
  同一判定成立；升級應三者同步評估。

### 其餘 high／moderate 告警

`pnpm audit` 的計數同時涵蓋 devDependencies 與間接相依的多條路徑，數字會遠大於
實際暴露面（多為 DoS 類、僅在建置期或開發伺服器成立）。本次未逐筆接受，
處置方式為：交由 Dependabot 的定期 PR 收斂，並於下次正式掃描時以掃描報告為準重新判定。

> 注意：`pnpm audit` **不是**正式掃描報告的替代品。此節僅為兩次正式掃描之間的
> 例行複查記錄。

## 維護方式

- **自動**：`.github/dependabot.yml` 定期檢查；安全性更新優先合併；
  major 升級排除自動化，一律人工評估。
- **人工**：每季相依複查；本檔於每次掃描後更新。
