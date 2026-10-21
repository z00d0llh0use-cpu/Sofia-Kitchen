# Sofia Kitchen — GitHub Pages 示範預覽

這是展示網站操作的示範包，沒有連接 Firebase，也不會寄送重設密碼郵件。
每個瀏覽器各自保存示範資料；朋友無法看到你在另一台電腦新增的內容。
請使用虛構資料，不要輸入真實密碼或私人食譜。

## 上傳方式

1. 建立或使用 Public 倉庫，例如 Sofia-Kitchen。
2. 上傳本資料夾裡的所有檔案到倉庫最外層。不要上傳 ZIP，也不要多包一層資料夾。
3. Settings → Pages → Deploy from a branch → main → /(root) → Save。
4. 等待 Pages 顯示網址，開啟該網址。

這一版已支援根網址與專案子路徑，例如 username.github.io/Sofia-Kitchen/。
倉庫最外層必須直接有 index.html、login.html 等檔案；只有 README.md 時，Pages 會顯示說明頁。
上傳時請進入解壓縮後的資料夾，全選裡面的檔案，不要多包一層資料夾。
更新同名檔案後，保留 Pages 的 main、/(root) 設定即可自動重新發布。

## 示範登入

- 朋友帳號：friend@demo.local
- Sofia 帳號：sofia@demo.local
- 兩者的示範密碼：RecipeDemo2026!
- Sofia 示範編號：10000001
- 朋友示範編號：10000002

也可用虛構電子郵件建立本機示範帳號。
一般會員無法修改別人的食譜；私人書不會展示給其他帳號。
這裡的權限檢查是示範程式，不能用來保存真實私人資料。
正式會員版需要 Firebase Authentication、Firestore 與已驗證的資料庫規則。

GitHub 的公開倉庫會公開這些前端程式碼。本包不含正式食譜備份、服務帳戶私鑰或正式 Firebase 連線設定。
