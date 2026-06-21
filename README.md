# 智生活小幫手 (KingNet Smart Assistant) - v3.1.0

這是一款專為「智生活 (KingNetSmart)」管理後台設計的高級自動化工具，旨在透過 **硬體層級的快捷鍵映射** 與 **多模態 Content Scripts** 整合，提升社區管理員處理包裹與公設檢核的作業效率。

---

## 🏗 技術架構 (Project Architecture)

  本專案採用模組化設計，將功能拆解至不同的腳本中以確保大型專案的可維護性。所有 Content Scripts 依照 `manifest.json` 定義的順序載入：

  KingnetSmartExt/
  ├── manifest.json           # 核心定義：配置 V3 規範、權限與熱鍵
  ├── background.js           # 邏輯中樞：處理通訊、狀態持久化與 API 轉發
  ├── icon/                   # 視覺資源 (16/32/192 px)
  ├── popup/                  # UI 介面
  │   └── popup.html          # 快速設定與狀態顯示
  └── ContentScripts/         # 核心執行單元 (依序載入)
      ├── parser.js           # [數據層] 負責 DOM 結構解析與資料抓取
      ├── automation.js       # [動作層] 執行自動點擊、導航與 UI 模擬
      ├── sync.js             # [通訊層] 負責與 Background 同步資料狀態
      ├── lightbox.js         # [介面層] 處理網頁內嵌視窗 (Modal) 的控制
      └── content.js          # [主控層] 整合上述模組的進入點

## 🚀 核心功能 (Key Features)
  1. 快捷鍵自動化 (Hotkeys)
    透過 chrome.commands 監聽，支援 Mac 與 Windows 系統：

      * **包裹管理：**
        Alt + Z：即時跳轉至「感應磁扣」領取分頁。
        Alt + X：即時跳轉至「戶別選擇」領取分頁。

      * **公設維護：**
        Alt + C：快速進入「公設離場」檢核清單。
        快速感應：支援公設感應介面觸發。

  2. 自動列印系統 (Print Automation)
  * **模式 01：自動掃描**
    系統自動監測頁面動態，僅針對新出現的「單號」進行處理。
  * **模式 02：手動勾選核准**
    支援手動勾選目標項目。僅在「包裹/退貨」清單頁面啟用，透過 `GET_CHECKED_ROWS` 抓取勾選資料後發送列印。
  * **模式 03：自定義快捷發送**
    提供手動輸入框，支援即時產生 **QR Code** 或 **Memo (純文字)** 標籤。


## 🛠 開發者指南 (Development)
  當前進度表 (Roadmap)  
    [Ｏ] Core Framework: 建立 V3 核心架構與多層次腳本載入機制。

    [Ｏ] Command System: 實作所有快捷鍵監聽與分頁跳轉邏輯。

    [ ] Data Detail Parsing: parser.js 內的詳細欄位抓取邏輯 。

    [ ] UI Feedback: 實作 lightbox.js 在自動化執行時的視覺提示。

  安裝步驟
    複製專案至本地。

    開啟 Chrome 瀏覽器，進入 chrome://extensions/。

    開啟右上角 「開發人員模式」。

    點擊 「載入未封裝項目」，並選擇本專案目錄。

    環境依賴：請確保本地端 MinPrintServer 已啟動。

## 🔍 技術細節 (Technical Notes)
  * **載入順序：**由於 content.js 作為主控端，必須確保其在 parser.js 與 automation.js 之後載入。

  * **跨域請求 (CORS)：**本工具已獲得 host_permissions 授權，可與 kingnetsmart.com.tw 及本地 API 進行資料交換。

  * **指令轉發：**background.js 接收到指令後，會利用一次性握手機制與目標 Tab 通訊，驅動 Scripts 執行動作。