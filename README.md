# Sofia Kitchen

正式網站：**https://sofia-kitchen001.web.app/**

GitHub 保存程式與版本歷史；Firebase Hosting 提供正式網站，Authentication 處理帳號，Cloud Firestore 保存食譜。每位會員的食譜各自獨立，擁有者可選擇私人或會員可閱讀。

## 開發與測試

需要 Node.js 24、pnpm 11.25.0、Java 21。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm test
pnpm test:rules
pnpm verify:artifact
```

網頁原始檔保留在 repo 根目錄。`scripts/site-files.json` 是明確的發布清單，建置只複製這些網站檔案到 `dist/`，再加入 `version.json` 和 SHA256 manifest。新增頁面或資源時一併更新清單。`dist/` 不提交到 Git，README、測試、規則、憑證不會被打包成公開網頁。

測試只使用隔離的記憶體 SDK fixture 與 `demo-sofia-members` Firestore Emulator，不連線或改寫正式食譜。`firestore.rules` 為 2026-10-21 已發布規則的原樣副本，Hosting workflow **不會部署 Rules**。

## 正式發布

1. 修改後 commit / push；PR 執行建置與測試。
2. 合併到 `main` 後，GitHub Actions 建置一次，對該 `dist/` 執行測試，保存不可變的 artifact。
3. 部署 job 下載同一份 artifact 並驗證雜湊，透過 OIDC 短期身分只發布 Firebase Hosting；不重新建置、不部署資料庫規則。
4. 上線後逐檔核對 HTTP 狀態、SHA256 與 commit。失敗時回復本次發布前的 Hosting 版本；若偵測到他人發布的新版本則停止並報告，避免覆蓋。

記錄位置：

- [Actions](https://github.com/z00d0llh0use-cpu/Sofia-Kitchen/actions/workflows/firebase-hosting.yml)
- [Firebase 部署紀錄](https://github.com/z00d0llh0use-cpu/Sofia-Kitchen/deployments?environment=firebase)
- [線上版本資訊](https://sofia-kitchen001.web.app/version.json)：commit SHA、Actions URL、建置時間。
- 每次 Actions 的 Summary 和 `firebase-release-*` artifact：Firebase version/release ID、先前版本與 smoke/rollback 結果。artifact 保留 90 天；Git commit 歷史另外保留。

GitHub Pages 的停用安排在首次 Firebase CI 發布與瀏覽器檢查通過之後。

## 權限與費用

部署帳號只具 `roles/firebasehosting.admin`，透過 Workload Identity Federation 限制本 repo 的 main workflow；沒有長期服務帳戶金鑰。沒有食譜資料、Rules 或計費修改權限。專案維持 Spark，未啟用付費方案。

不要提交服務帳戶私鑰、登入 token、真實帳號密碼或食譜匯出資料。網頁中的 Firebase Web 設定是公開應用程式識別資訊，資料存取由 Authentication 與 Firestore Rules 控制。

## 回復與限制

需要退版時，在 GitHub revert 問題修改，再由 main 流程發布；緊急手動回復 Hosting 後，也要同步 GitHub，避免下次 CI 蓋回問題版本。Hosting 退版不會還原食譜或帳號資料。

CI 測試包含登入成功/失敗、頁面跳轉、資料隔離、編輯、JSON 匯入相關邏輯與規則；線上 smoke 驗證實際發布檔案。CI 沒有保存真人密碼，不會自動登入真人帳號或寄出密碼重設郵件。介面與真實帳號驗證需在發布驗收時另外進行。

若日後使用預覽網址，預覽前端仍可能連線正式 Firebase 資料庫；要隔離測試資料，需另設測試專案。
