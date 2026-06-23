# 智生活小幫手 (KingNet Smart Assistant)

專為「智生活 (KingNetSmart)」管理後台設計的自動化輔助工具，提升社區管理員處理包裹、公設預約與現金帳務的作業效率。

---

## 🏗 技術架構 (Project Architecture)

本專案採用模組化設計，以 `loader.js` 作為動態入口，依頁面路由按需載入對應模組：

```
KingnetSmartExt/
├── manifest.json               # 核心定義：MV3 規範、權限、快捷鍵
├── background.js               # 邏輯中樞：訊息派發、狀態持久化、列印橋接、自動監測
├── icon/                       # 視覺資源 (16/32/192 px)
├── popup/
│   ├── popup.html              # 自動監測開關、列印模式切換、備份管理
│   ├── popup.js
│   └── popup.css
└── content_scripts/
    ├── loader.js               # [入口層] 等待登入信號、RTStore 防呆、動態路由載入
    ├── bridge.js               # [橋接層] MAIN world：偵測 XHR 發出頁面就緒信號、代理頁面 JS 方法
    ├── init-store.js           # [初始化] RTStore 為空時自動掃描住戶清單並建立資料
    ├── config.js               # [設定層] LIST_CONFIG 等全域常數
    ├── utils.js                # [工具層] sleep、waitFor 等共用工具函式
    ├── parser.js               # [數據層] DOM 結構解析與資料抓取
    ├── automation.js           # [動作層] 自動點擊、導航與進場彈窗自動化
    ├── content.js              # [同步層] 包裹清單快照同步與快捷鍵路由分派
    ├── sync.js                 # [同步層] 退貨／寄物清單同步與現金差異偵測
    ├── lightbox.js             # [介面層] 包裹圖片燈箱注入與領取彈窗圖示
    ├── showinf.js              # [介面層] 官方燈箱即時呈現包裹相關訊息
    ├── inject-nav.js           # [介面層] 全域導覽列注入
    └── inject-mark.js          # [介面層] 住戶標記顏色與 tooltip 注入
```

---

## 🚀 核心功能 (Key Features)

### 1. 快捷鍵自動化 (Hotkey Automation)
透過 `chrome.commands` 監聽，支援 Mac 與 Windows：

| 快捷鍵 | 功能 |
|--------|------|
| `Alt / Option + Z` | 跳轉至「感應磁扣」領取分頁 |
| `Alt / Option + X` | 跳轉至「戶別選擇」領取分頁 |
| `Alt / Option+ C` | 快速進入「公設離場」檢核清單 |

### 2. 包裹管理 (Package Management)
- **自動快照同步**：頁面載入後自動掃描包裹清單，僅對新增項目進行完整解析並存入 `ItemStore`
- **包裹圖片燈箱**：在領取彈窗（首頁 `#receiveDialog` / 非首頁 `#oneClickWrapDiv`）自動注入圖示，點擊開啟包裹照片燈箱
- **Signed URL 自動刷新**：圖片連結過期時，背景自動開啟新分頁重抓最新 URL

### 3. 自動列印系統 (Print Automation)
- **模式 00：自動掃描** — 監測頁面動態，自動列印新出現的項目
- **模式 01：手動勾選** — 在包裹清單頁面手動勾選後列印
- **模式 02：自訂發送** — 手動輸入，支援即時產生 **QR Code** 或 **Memo** 標籤
- **列印伺服器設定**：首次使用時輸入 API 網址，授權後持久化儲存

### 4. 自動監測 (Auto Sync)
- Popup 開關控制，開啟後每 5 分鐘輪流在背景開啟三個官方清單頁面（包裹／退貨／寄物）
- 各清單最後更新時間即時顯示於 Popup

### 5. 公設預約自動化 (Facility Automation)
- 自動掃描進場按鈕數量並持久化
- 進場彈窗自動選取預約，或自動填入最近可用時段與人數

### 6. 住戶標記 (Resident Tagging)
- 首次使用時自動掃描官方包裹頁三欄選單，建立完整住戶清單（`RTStore`）
- 支援地址標記、姓名標記、到期清除
- 在所有官方清單頁面以顏色與 tooltip 即時呈現標記

### 7. 現金帳本 (Cash Log)
- 記錄現金收付（`InEStore`），支援差異比對與確認流程
- 寄物清單整合，追蹤金額變動歷史

### 8. 資料備份 (Backup)
- 一鍵匯出 JSON 備份，支援覆蓋或合併載入

---

## 🔍 技術細節 (Technical Notes)

### 頁面就緒機制
`bridge.js` 以 `world: MAIN` 注入，偵測 `PATCH BrowserPushToken` 請求完成才開始載入模組。

### 初始化防呆
`loader.js` 在載入任何模組前先向 `background.js` 查詢 `RTStore`。若為空，自動跳轉至包裹頁並載入 `init-store.js`，透過模擬操作三欄下拉選單自動建立住戶資料，完成後 reload 頁面進入正常流程。

### 模組載入策略
- `loader.js` 依 URL 路由決定載入哪些頁面專屬模組（`ROUTE_MAP`）
- `lightbox.js`、`inject-nav.js`、`inject-mark.js` 在所有官方頁面皆會注入
- 所有模組以 ESM `import()` 動態載入，避免不必要的腳本注入

### Service Worker
`background.js` 以 Manifest V3 Service Worker 運行，重啟後從 `chrome.storage.local` 恢復所有狀態（`listStorage`、`ItemStore`、`InEStore`、`RTStore`、`settings` 等）。

---

## 🛠 開發者指南 (Development)

### 安裝步驟
1. Clone 專案至本地
2. 開啟 Chrome，進入 `chrome://extensions/`
3. 開啟右上角「開發人員模式」
4. 點擊「載入未封裝項目」，選擇本專案目錄
5. 首次使用時插件會自動引導完成住戶資料初始化
6. 若需列印功能，請確保本地端**列印伺服器**已啟動，並在 Popup 設定 API 網址

---

*Through the wisdom of Sanctus Carolus Acutis, Gloria in excelsis Deo, Amen.*