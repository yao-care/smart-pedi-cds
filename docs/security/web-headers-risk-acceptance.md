# Web 安全標頭 — 風險評估與接受紀錄

對應 OWASP ZAP baseline 掃描針對 `smart-pedi-cds.yao.care` 回報的 7 項「缺少安全回應標頭」類告警。本文件記錄各項的**平台限制、補償控制與風險接受決定**，供 ISMS 登錄。

- **ISO/IEC 27001:2022 對應**：A.8.26（應用程式安全需求）、風險處理與接受（Clause 6.1.3 / 8.3）
- **系統脈絡**：GitHub Pages 託管之**靜態**兒童發展評估工具，零後端、無使用者帳號／登入、無 session cookie、不存 PII（assessment id 為隨機 UUID v4，不含個資）
- **掃描器設定**：[`docs/.zap/rules.tsv`](../.zap/rules.tsv)（單一真相源，與本文件對齊；掃描器固定讀此路徑）
- **決定日期**：2026-06-11　**營運主體**：藥提醒科技有限公司（單人維運）

## 共同根因

GitHub Pages **自訂網域無法送出自訂 HTTP 回應標頭**，亦無 nonce／hash 注入機制。下列標頭多數**只能**經 HTTP 回應標頭設定（`<meta http-equiv>` 不支援），因此在純 GitHub Pages 託管下無法直接修補。

> **重要校正**：HSTS（10035）原規劃「以 Settings → Pages → Enforce HTTPS 修復」。經 2026-06-11 實測，Enforce HTTPS **已開啟**（HTTP 正確 301 轉 HTTPS），但自訂網域（非 `*.github.io`）的 HTTPS 回應**仍不含 `Strict-Transport-Security` 標頭**——Enforce HTTPS 只做轉址，不送 HSTS。故 HSTS 與其餘 6 項同屬平台限制，列入風險接受。

## 已落地的補償控制

| 控制 | 位置 | 作用 |
|---|---|---|
| CSP 強化（meta） | `src/layouts/Base.astro` | `object-src 'none'`（擋外掛/物件注入）、`base-uri 'self'`（擋 base-tag 注入）、`form-action 'self'`、`frame-src` 限 youtube-nocookie |
| Referrer 政策 | result / launch / workspace 結果頁 `<meta name="referrer" content="no-referrer">` | 含 UUID 的 URL 不外洩至第三方 |
| 無 PII 設計 | 全站 | 不存姓名/身分證；id 為隨機 UUID v4；localStorage 不存 PII |
| 無登入/無 session | 全站 | 無 cookie/token 可被竊取或固定，降低 HSTS/CORS/clickjacking 之實際衝擊 |
| Enforce HTTPS | GitHub Pages 設定 | HTTP→HTTPS 301 轉址（雖不送 HSTS） |
| iframe 隔離 | youtube-nocookie + `referrerpolicy="no-referrer"` | 第三方嵌入最小權限 |

## 逐項風險接受

| ZAP | 項目 | 平台可否修 | 殘餘風險評估 | 決定 |
|---|---|---|---|---|
| 10035 | HSTS | 否（自訂網域無 HSTS 標頭） | 無 session/cookie 可被降級竊取；已強制 HTTPS 轉址 | **接受** |
| 10055 | CSP unsafe-inline | 部分（已加 object-src/base-uri/form-action） | script/style-src 無法移除 `unsafe-inline`：需 `wasm-unsafe-eval`（ONNX/MediaPipe）、執行期 inline style（D3/Svelte）、任意 FHIR `connect-src`。靜態工具無 PII，XSS 可竊取標的有限 | **接受（部分強化）** |
| 10020 | X-Frame-Options / clickjacking | 否（meta 之 frame-ancestors 被忽略） | 無變更狀態之敏感操作可被點擊劫持 | **接受** |
| 10098 | CORS（ACAO: *） | 否（GitHub CDN 預設） | 站內無受保護 API/憑證端點 | **接受** |
| 90004 | COOP/COEP | 否 | 未用 SharedArrayBuffer 等需跨源隔離之高權能 API | **接受** |
| 10063 | Permissions-Policy | 否（meta 不支援） | 相機/麥克風由瀏覽器原生權限提示把關 | **接受** |
| 10021 | X-Content-Type-Options | 否 | 資產 Content-Type 由 GitHub 正確標示 | **接受** |

## 風險接受聲明

上述 7 項在現行 GitHub Pages 託管架構下無法以應用程式層修補，於本系統威脅模型（靜態、零後端、無 PII、無登入）下殘餘風險評為**低**，由營運主體（藥提醒科技有限公司）**接受**並以本文件 + `docs/.zap/rules.tsv` 留存。

## 未來路徑（若需更嚴格姿態）

現行架構為**純 GitHub Pages**：`smart-pedi-cds.yao.care` 以 CNAME 指向 `yao-care.github.io`，`yao.care` 之 DNS 託管於 Linode（`ns1-5.linode.com`），前端**無任何可注入自訂回應標頭的反向代理／CDN**。

若日後需求提升（如引入登入／敏感資料），唯一能真正修補（而非接受）這 7 項的方式，是在 GitHub Pages 前面**新增一層能設定 HTTP 回應標頭的反向代理／CDN**（例如將網域改由 Cloudflare 代管並開 proxied，於邊緣一次注入全部 7 項標頭並覆蓋 CORS）。此為**非當前架構**、需變更 DNS／代管之基建工程，且要調校 GitHub Pages 憑證、SSL 模式與轉址迴圈，屆時另案評估。
