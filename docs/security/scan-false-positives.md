# 掃描誤報判定紀錄 — 20260714-231430-127e

對應 2026-07-14 安全掃描（掃描 ID `20260714-231430-127e`，Quality Gate: FAIL）。本文件記錄該次掃描中**經實測判定為誤報或規則錯配**的項目、驗證方法與證據，供 ISMS 留存及掃描器規則回饋。

- **ISO/IEC 27001:2022 對應**：A.8.8（技術弱點管理 — 弱點評估之正確性）、A.8.28（安全程式碼開發）
- **系統脈絡**：GitHub Pages 託管之**靜態**兒童發展評估工具，零後端、無登入、不存 PII
- **判定日期**：2026-07-15　**營運主體**：藥提醒科技有限公司（單人維運）
- **相關文件**：[web-headers-risk-acceptance.md](web-headers-risk-acceptance.md)（HTTP 標頭類風險接受）、[`docs/.zap/rules.tsv`](../.zap/rules.tsv)（ZAP 規則真相源）

## 摘要

該次 Gate FAIL 之組成為 **High 21 = SAST 17（Actions 未 pin SHA）+ Trivy High 4（依賴 CVE）**，兩者均為真實問題且已修復（見下方對照）。其餘回報項目經逐一實測，多數為針對純靜態 SSG 的規則錯配。

## 1. Pentest — User Controllable HTML Element Attribute (Potential XSS)

- **回報位置**：`/assess/?gender=male`（Informational，1 instance）
- **判定**：**誤報**
- **驗證方法**：對 live 注入 payload 並比對回應

  ```
  curl 'https://smart-pedi-cds.yao.care/assess/?gender="><svg/onload=alert(1)>'
  → payload 出現於回應中之次數：0
  → 與不帶 payload 之回應 diff：完全相同（0 差異）
  ```

- **根因**：ZAP 偵測到頁面存在 `name="gender"` 之 radio button，與 query param 同名，遂推測該屬性可由 query 控制。實際上頁面為預先產生之靜態 HTML，query param 不參與任何 render。
- **佐證**（全 repo 稽核注入面）：
  - 全 repo 僅一處 `{@html}`：`src/components/ui/Toast.svelte`，插值來源為硬編碼 icon map，非使用者輸入
  - `src/pages/search.astro` 對 query 使用 `input.value = q`（property 賦值，不經 HTML parser）
- **處置**：**不加入 `rules.tsv` IGNORE**。此規則為啟發式，本次雖為誤報，但將其永久忽略會使日後真實之可控屬性注入無法被偵測。該項為 Informational、不影響 Quality Gate，保留告警之成本低於掩蓋真實問題之風險。

## 2. SEO — Schema「JSON-LD 語法錯誤」

- **回報**：Schema 0/1，「JSON 語法錯誤」
- **判定**：**誤報**
- **驗證方法**：以 JSON parser 實際解析 live 首頁與全站建置產物

  ```
  live 首頁 ld+json 區塊：1 個 → 合法，@type=['Organization','WebSite','SoftwareApplication','FAQPage']
  dist 全站 ld+json：39 個 → 語法錯誤 0 個
  ```

- **根因**：該區塊為 `@graph` 形式之**陣列**多實體結構。掃描器疑似預期單一物件，或以 regex 而非 JSON parser 解析。
- **回饋建議**：改用 JSON parser 並支援 `@graph` 陣列。

## 3. SEO — `og:type` 期待 `article`

- **回報**：`og:type` fail（期待 `article`）、`article:published_time` fail、`article:modified_time` fail
- **判定**：**規則錯配**
- **實際值**：首頁 `og:type = website` — 此為**正確值**。首頁為產品落地頁而非文章，依 Open Graph 規範本就不應具備 `article:*` 屬性。
- **根因**：掃描器套用部落格文章導向之規則集。
- **回饋建議**：依頁面型態分流；`og:type=website` 之頁面不應要求 `article:*`。

## 4. SEO — SGE/AEO 與 E-E-A-T 共 11 項

- **回報**：`.key-answer`、`.key-answer[data-question]`、`.key-takeaway`、`.expert-quote`、`.actionable-steps`、Person Schema、`hasCredential`、`sameAs`、權威來源連結、作者介紹區塊、更新日期標示（總分 33%）
- **判定**：**非安全控制項**
- **說明**：上列為內容行銷／AEO 最佳實務，與資訊安全無關。將其計入「安全掃描報告」總分，會使該百分比對本專案失去意義。
- **回饋建議**：SEO/AEO 與安全掃描分開計分，或允許依專案型態停用 AEO 規則集。
- **備註**：其中部分項目具產品價值，另案評估，不在資安範圍內。

## 5. Pentest — HTTP 安全標頭 10 項

- **回報**：CSP wildcard／CSP unsafe-inline（script-src、style-src）／Cross-Domain Misconfiguration／Missing Anti-clickjacking Header／COEP／COOP／Permissions-Policy／HSTS／X-Content-Type-Options（報告已標「已排除」，Pentest 區塊為 PASS）
- **判定**：**平台限制，已於 2026-06-11 完成風險接受**
- **依據**：見 [web-headers-risk-acceptance.md](web-headers-risk-acceptance.md) 與 [`docs/.zap/rules.tsv`](../.zap/rules.tsv)。GitHub Pages 自訂網域無法送出自訂 HTTP 回應標頭，且 `yao.care` DNS 託管於 Linode，前端無可注入標頭之反向代理／CDN。
- **處置**：無新增動作，維持既有風險接受。

## 6. Trivy — `ws` HIGH 之可達性（真實但不可達）

- **回報**：`[HIGH] CVE-2026-48779 — ws 7.5.10`
- **判定**：**CVE 為真，但於本系統不可達**
- **來源鏈**：

  ```
  fhirclient@2.6.3 → isomorphic-webcrypto@2.3.8 → react-native-securerandom
    → react-native@0.85.3 → expo → metro → @react-native/dev-middleware → ws@7.5.10
  ```

- **說明**：`isomorphic-webcrypto` 為支援 React Native 環境而拖入整條 RN/Expo 工具鏈。本專案為純瀏覽器 SSG，該程式路徑**永不執行**且不進 production bundle。另一使用者 `lighthouse` 為 devDependency，同樣不進產物。
- **處置**：**仍已修復**（override `ws@7` → `^7.5.11`，實裝 7.5.12），以清空 Quality Gate。
- **回饋建議**：導入可達性分析（reachability／runtime-vs-dev 分類），避免不可達之傳遞依賴 CVE 觸發 Gate FAIL 而稀釋真實訊號。

## 對照：判定為真並已修復之項目

| 項目 | 數量 | 處置 | Commit |
|---|---|---|---|
| SAST：Actions 使用 mutable tag | 17 | 全數 pin 至 40-char commit SHA | `1053dd3` |
| Trivy High：astro ×2 | 2 | `^6.3.1` → `^6.4.6`（實裝 6.4.8） | `13c33dd` |
| Trivy High：vite ×1 | 1 | override → `^7.3.5`（實裝 7.3.6） | `13c33dd` |
| Trivy High：ws ×1 | 1 | override `ws@7` → `^7.5.11`（實裝 7.5.12；見 §6） | `13c33dd` |
| Trivy Medium/Low：dompurify、js-yaml、@babel/core、esbuild | 多項 | 見 commit 訊息 | `13c33dd`、`cb52e29` |

**Trivy 回報之 18 個 CVE 已全數清零，無殘留。**

### 掃描器漏報（本次自行發現）

- **`js-yaml@3.14.2`**（CVE-2026-53550，fix: 3.15.0）— 由 `@lhci/cli` 拉入，升級前即存在於 lockfile，但掃描報告僅列出 `js-yaml 4.1.1`。已一併修復（override `js-yaml@3` → `^3.15.0`）。
- **回饋建議**：同一套件存在多個 major 版本時，應逐一比對各自之 fix 版本。

### 已知殘留

**無。** Trivy 回報之 18 個 CVE 全數修復。

> **過程紀錄（方法論教訓）**：`esbuild@0.27.7` 的 GHSA-g7r4-m6w7-qqqr (LOW) 一度被判定為「無法修復、接受風險」，理由是 `vite` 要求 `^0.27.0`、`astro@6.4.8` 要求 `^0.27.3`，而 0.x 之 caret 僅允許 patch 浮動。**此判定有誤**，原因有二：
> 1. 該 range 查自 `vite@7.3.5`，但 override 後實裝者為 **`vite@7.3.6`**，其 range 已放寬為 `^0.27.0 || ^0.28.0`，本就支援 0.28。查詢對象與實裝版本不一致。
> 2. 僅以 semver 推論即斷定「強推會打破」，未實際測試。`pnpm.overrides` 可強制解析，能否運作應由實測認定。
>
> 實測結果：全域 override `esbuild` → `^0.28.1` 後，`pnpm check` 0 error、69 檔 736 測試全綠、`pnpm build` 與 SEO 守門全過，產出物與先前基準完全一致（33 頁、39 個 JSON-LD 零錯、抽驗 40 個 JS bundle 語法全通過）。
>
> **教訓**：宣告某項「無法修復」之前，須先實測而非僅憑 semver 推論；且查詢相依範圍時必須以**實裝版本**為準，不可沿用升級前查得的資料。
