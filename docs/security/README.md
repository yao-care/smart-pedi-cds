# 資安治理文件（ISMS）

對應 2026-06-10 資安掃描（掃描 ID `20260610-044840-127e`）posture-check 缺失的三項 ISO/IEC 27001:2022 控制點。本目錄提供**已特化於本系統架構**（零後端、瀏覽器端 SMART-on-FHIR、GitHub Pages）的治理文件，供 ISMS 登錄與掃描器讀取。

| 控制點 | 文件 | 狀態 |
|---|---|---|
| **A.5.24** 事件管理規劃與準備 | [incident-response-plan.md](incident-response-plan.md) | 計畫已備；**演練須實際執行後填紀錄** |
| **A.5.26** 資安事件之回應（聯絡窗口） | [incident-response-contacts.md](incident-response-contacts.md) | 清單已備；**聯絡資料須填真實值** |
| **A.5.29** 中斷期間之資訊安全（備份還原） | [backup-restore-test.md](backup-restore-test.md) | 程序已備；**還原測試須實際執行後填紀錄** |

## 待負責人完成事項

這三份文件的**架構與程序內容已完整**，但合規要求「證據」——以下三項必須由負責人**實際執行**，不可由文件代替：

1. 依事件應變計畫 §4 跑一次桌面推演演練，填入真實日期／參與者／結果。
2. 將聯絡清單中所有 `{{...}}` 欄位填為真實聯絡資料。
3. 依備份還原測試 §2 程序實跑一次，填入真實結果。

完成後，須將本目錄路徑登錄到 ISMS / posture-check 掃描器設定（掃描器原讀取 `runtime/posture-check-result.json`，其記錄來源路徑由 ISMS 端設定，不在本應用程式 repo 內）。

> 所有 `{{placeholder}}` 為尚未確認、須填真實值的欄位；維運負責人 email 已填入已知值。
