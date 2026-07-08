# ISMS 端登錄條目（可直接貼上）

本檔提供**可直接複製貼入 ISMS / posture-check 掃描器設定**的登錄條目，關閉
2026-06-10 資安掃描（掃描 ID `20260610-044840-127e`）posture-check 缺口的
「唯一後續」——把 `docs/security/` 治理文件路徑登錄進 ISMS 端。

- **本 repo**：`https://github.com/yao-care/smart-pedi-cds`
- **證據路徑基準**：repo 內 `docs/security/`（下列相對路徑皆以此為根，除另註）
- **營運主體**：藥提醒科技有限公司（單人維運）
- **狀態真相源**：[`docs/security/README.md`](README.md)
- **對應掃描**：`20260610-044840-127e`（2026-06-10）

> 掃描器原讀取 `runtime/posture-check-result.json`，其記錄來源路徑由 ISMS 端設定，
> **不在本應用程式 repo 內**。以下條目即為要登錄進該設定的內容。

---

## 登錄條目（逐控制項）

### A.5.24 — 事件管理規劃與準備

- **文件**：`docs/security/incident-response-plan.md`
- **證據**：§4.1 首次桌面推演（供應鏈 RCE，2026-06-10 執行並留存紀錄，含真實發現與改進事項）
- **狀態**：✅ 計畫完整、演練已執行
- **對應掃描缺口**：`20260610-044840-127e` posture-check A.5.24

### A.5.26 — 資安事件之回應（聯絡窗口）

- **文件**：`docs/security/incident-response-contacts.md`
- **證據**：內外部窗口已填實（單人維運）；緊急備援聯絡人 `service@yao.care`
- **狀態**：✅ 聯絡清單已填實
- **對應掃描缺口**：`20260610-044840-127e` posture-check A.5.26

### A.5.29 — 中斷期間之資訊安全（備份還原）

- **文件**：`docs/security/backup-restore-test.md`
- **證據**：§3.1 首次還原測試（2026-06-10 於全新環境實跑 7 步程序通過，RTO ~94 秒達標）
- **狀態**：✅ 程序完整、還原測試已通過
- **對應掃描缺口**：`20260610-044840-127e` posture-check A.5.29

### A.8.26 — 應用程式安全需求（Web 安全標頭）

- **文件**：`docs/security/web-headers-risk-acceptance.md`
- **證據**：ZAP 7 項標頭告警評估（2026-06-11）；repo 內可強化者（CSP 強化）已落地，
  平台限制項（GitHub Pages 無法設 HTTP 回應標頭）已風險接受
- **ZAP 規則設定**：`docs/.zap/rules.tsv`
- **狀態**：✅ 已評估；可強化者落地、限制項風險接受
- **對應掃描缺口**：`20260610-044840-127e` posture-check A.8.26

---

## 掃描器設定片段（供貼入 posture-check 來源清單）

以下為建議登錄到 ISMS 端掃描器來源設定的路徑清單（依 ISMS 系統實際欄位格式調整）：

```
control=A.5.24  evidence=docs/security/incident-response-plan.md        repo=yao-care/smart-pedi-cds  scan=20260610-044840-127e
control=A.5.26  evidence=docs/security/incident-response-contacts.md    repo=yao-care/smart-pedi-cds  scan=20260610-044840-127e
control=A.5.29  evidence=docs/security/backup-restore-test.md           repo=yao-care/smart-pedi-cds  scan=20260610-044840-127e
control=A.8.26  evidence=docs/security/web-headers-risk-acceptance.md   repo=yao-care/smart-pedi-cds  scan=20260610-044840-127e
index=README    evidence=docs/security/README.md                        repo=yao-care/smart-pedi-cds  scan=20260610-044840-127e
```

---

## 殘餘（交用戶）

上述條目已備妥；**用戶把本檔內容登錄進 ISMS / posture-check 掃描器設定**即關閉此項。
本 repo 內無法代為寫入 ISMS 端設定（掃描器來源路徑不在本 repo）。
