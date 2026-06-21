# 智生活小幫手 (KingNet Smart Assistant) - v3.2.0

這是一款專為「智生活 (KingNetSmart)」管理後台設計的自動化輔助工具，透過 **硬體層級的快捷鍵映射** 與 **多模態 Content Scripts** 整合，提升社區管理員處理包裹、公設預約與現金帳務的作業效率。

---

## 🏗 技術架構 (Project Architecture)

本專案採用模組化設計，以 `loader.js` 作為動態入口，依頁面路由按需載入對應模組：

```
KingnetSmartExt/
├── manifest.json               # 核心定義：配置 V3 規範、權限與熱鍵
├── background.js               # 邏輯中樞：處理通訊、狀態持久化與 API 轉發
├── icon/                       # 視覺資源 (16/32/192 px)
├── popup/                      # UI 介面
│   ├── popup.html              # 快速設定、模式切換與備份管理
│   ├── popup.js
│   └── popup.css
└── content_scripts/            # 核心執行單元
    ├── loader.js               # [入口層] 動態路由載入，防呆初始化
    ├── config.js               # [設定層] LIST_CONFIG 等全域常數
    ├── utils.js                # [工具層] 共用工具函式 (sleep、waitFor 等)
    ├── parser.js               # [數據層] DOM 結構解析與資料抓取
    ├── automation.js           # [動作層] 自動點擊、導航與進場彈窗自動化
    ├── content.js              # [同步層] 包裹清單快照同步與路由分派
    ├── sync.js                 # [同步層] 退貨／寄物清單同步
    ├── lightbox.js             # [介面層] 包裹圖片燈箱注入與領取彈窗圖示
    ├── showui.js               # [介面層] 官方燈箱即時呈現包裹相關訊息
    ├── inject-nav.js           # [介面層] 全域導覽列注入
    └── inject-mark.js          # [介面層] 住戶標記注入
```

---

## 🚀 核心功能 (Key Features)

### 1. 快捷鍵自動化 (Hotkey Automation)
透過 `chrome.commands` 監聽，支援 Mac 與 Windows：

| 快捷鍵 | 功能 |
|--------|------|
| `Alt + Z` | 跳轉至「感應磁扣」領取分頁 |
| `Alt + X` | 跳轉至「戶別選擇」領取分頁 |
| `Alt + C` | 快速進入「公設離場」檢核清單 |

### 2. 包裹管理 (Package Management)
- **自動快照同步**：頁面載入後自動掃描包裹清單，僅對新增項目進行完整解析並存入 `ItemStore`
- **包裹圖片燈箱**：在領取彈窗（首頁 `#receiveDialog` / 非首頁 `#oneClickWrapDiv`）自動注入圖示，點擊開啟包裹照片燈箱
- **Signed URL 自動刷新**：圖片連結過期時，背景自動開啟新分頁重抓最新 URL

### 3. 自動列印系統 (Print Automation)
- **模式 01：自動掃描** — 系統監測頁面動態，自動列印新出現的包裹單號
- **模式 02：手動勾選** — 在包裹清單頁面手動勾選後列印
- **模式 03：自訂發送** — 手動輸入，支援即時產生 **QR Code** 或 **Memo** 標籤
- **列印伺服器設定**：API 網址持久化儲存，未設定時自動顯示設定介面

### 4. 公設預約自動化 (Facility Automation)
- 自動掃描進場按鈕數量並持久化
- 進場彈窗自動選取預約、或自動填入最近可用時段與人數

### 5. 住戶標記 (Resident Tagging)
- 從官方住戶管理頁面自動生成本地 `ResidentTag.html`
- 支援標記、到期清除、姓名集合管理

### 6. 現金帳本 (Cash Log)
- 記錄現金收付（`InEStore`），支援差異比對與確認流程
- 寄物清單整合，支援單筆刪除

### 7. 資料備份 (Backup)
- 一鍵匯出 JSON 備份，支援覆蓋或合併載入

---

## 🛠 開發者指南 (Development)

### 當前進度表 (Roadmap)
- [x] Core Framework：建立 V3 核心架構與動態模組載入機制
- [x] Command System：實作所有快捷鍵監聽與分頁跳轉邏輯
- [x] Data Parsing：`parser.js` 完整欄位解析（包裹／退貨／寄物）
- [x] Package Photo Lightbox：燈箱注入、Signed URL 刷新機制
- [x] Resident Tagging：住戶標記自動生成與管理
- [x] Cash Log：現金帳本差異追蹤
- [x] Print API Config：列印伺服器網址持久化設定
- [ ] 首頁領取彈窗圖示（el-table 結構）穩定性優化

### 安裝步驟
1. 複製專案至本地
2. 開啟 Chrome，進入 `chrome://extensions/`
3. 開啟右上角「開發人員模式」
4. 點擊「載入未封裝項目」，選擇本專案目錄
5. 確保本地端 **列印伺服器** 已啟動（列印功能需要）

---

## 🔍 技術細節 (Technical Notes)

- **動態載入**：`loader.js` 依 URL 路由決定載入哪些模組，避免不必要的腳本注入
- **全域模組**：`lightbox.js`、`inject-nav.js`、`inject-mark.js` 在所有官方頁面皆會注入
- **Service Worker**：`background.js` 以 Manifest V3 Service Worker 運行，處理所有跨頁面狀態