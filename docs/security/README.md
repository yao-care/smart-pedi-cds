# 資安治理文件（ISMS）

對應 2026-06-10 資安掃描（掃描 ID `20260610-044840-127e`）posture-check 缺失的三項 ISO/IEC 27001:2022 控制點。本目錄提供**已特化於本系統架構**（零後端、瀏覽器端 SMART-on-FHIR、GitHub Pages）的治理文件，供 ISMS 登錄與掃描器讀取。

| 控制點 | 文件 | 狀態 |
|---|---|---|
| **A.5.24** 事件管理規劃與準備 | [incident-response-plan.md](incident-response-plan.md) | ✅ 計畫完整；**首次桌面推演已於 2026-06-10 執行並留存紀錄**（§4.1） |
| **A.5.26** 資安事件之回應（聯絡窗口） | [incident-response-contacts.md](incident-response-contacts.md) | ⏳ 清單已備；**部分聯絡資料待負責人填真實值** |
| **A.5.29** 中斷期間之資訊安全（備份還原） | [backup-restore-test.md](backup-restore-test.md) | ✅ 程序完整；**首次還原測試已於 2026-06-10 實跑通過並留存紀錄**（§3.1） |

## 完成狀態

- ✅ **A.5.24 演練**：已於 2026-06-10 執行供應鏈 RCE 桌面推演（連同當日真實修補），紀錄含真實發現與改進事項。
- ✅ **A.5.29 還原測試**：已於 2026-06-10 於全新環境實跑 7 步程序通過（RTO ~94 秒達標）。
- ⏳ **A.5.26 聯絡清單**：架構完整，僅 `{{...}}` 聯絡資料欄位待負責人填真實值。

完成聯絡資料後，須將本目錄路徑登錄到 ISMS / posture-check 掃描器設定（掃描器原讀取 `runtime/posture-check-result.json`，其記錄來源路徑由 ISMS 端設定，不在本應用程式 repo 內）。

> 所有 `{{placeholder}}` 為尚未確認、須填真實值的欄位；維運負責人 email 已填入已知值。
