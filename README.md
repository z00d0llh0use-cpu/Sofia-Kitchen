# Sofia Kitchen

網站由 GitHub Pages 發布；登入、註冊、重設密碼由 Firebase Authentication 處理，食譜保存在 Cloud Firestore。

- 網址：https://z00d0llh0use-cpu.github.io/Sofia-Kitchen/
- 登入後可建立自己的食譜，預設私人保存。
- 分享為「會員可閱讀」後，其他登入會員可閱讀，只有擁有者可修改。
- 頁面上的帳號與密碼只是不能登入的填寫範例。
- 舊示範版的帳號與瀏覽器資料不會自動變成 Firebase 帳號。

更新時上傳本目錄全部檔案至 main 根目錄，保留 Pages 的 main、/(root) 設定。資料庫權限另由 Firestore Rules 管理。
