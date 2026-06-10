# 資安事件應變聯絡清單

> ISO/IEC 27001:2022 控制點 **A.5.26 — 資安事件之回應**（聯絡窗口定義）
> 對象系統：Smart Pedi 兒童發展評估
> 文件版本：1.0　建立日期：2026-06-10　覆核週期：每 6 個月

## 1. 內部應變窗口

| 角色 | 職責 | 姓名／職稱 | 聯絡方式 | 備援 |
|---|---|---|---|---|
| **主要聯絡人 / 事件指揮** | 接收通報、判定嚴重度、決策圍堵與還原 | {{pm_name}}（系統維運負責人） | lightman.chang@gmail.com / {{pm_phone}} | {{pm_backup_contact}} |
| **技術修補** | 根因分析、修補、重建驗證、重新部署 | {{dev_name}}（開發） | {{dev_email}} | — |
| **資料保護 / 合規** | 評估個資衝擊、合規通報判斷 | {{dpo_name}} | {{dpo_email}} | — |

> 註：本系統為單人／小團隊維運時，同一人可兼任多角色，但仍應於上表明列備援聯絡人，避免單點失聯。

## 2. 外部窗口

| 對象 | 用途 | 聯絡方式 |
|---|---|---|
| **GitHub Support** | Pages 部署異常、帳號遭盜用、惡意 commit 處置 | https://support.github.com/ |
| **網域註冊商** | DNS／網域挾持還原 | {{domain_registrar}} / {{domain_registrar_contact}} |
| **FHIR 主機方（醫院 standalone）** | token 洩漏時撤銷 client、旋轉密鑰 | {{fhir_hospital_contact}} |
| **GCM 收案平台方** | GCM PKCE 動態註冊相關事件 | {{gcm_platform_contact}} |
| **主管機關通報窗口** | 個資外洩法定通報（如適用） | {{authority_report_contact}} |
| **資安事件協處（如適用）** | TWCERT/CC 或委外資安服務商 | {{cert_contact}} |

## 3. 通報啟動條件

- **P1/P2 事件**（見 [事件應變計畫](incident-response-plan.md) §2）：立即電話 + email 通知主要聯絡人，1 小時內未回應則啟動備援聯絡人。
- 涉及病患個資疑似外洩：同步通知資料保護／合規窗口，評估是否觸發法定通報時限。

> ⚠️ 所有 `{{...}}` 欄位須由負責人填入真實聯絡資料後，本清單方為有效。已知欄位（維運負責人 email）已填入。
