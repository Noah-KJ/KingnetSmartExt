/**
 * ╔════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Popup 控制中心         ║
 * ╚════════════════════════════════════════════════╝
 */

document.addEventListener("DOMContentLoaded", () => {
    // ─── 常數與配置 ──────────────────────────────────────────
    const PANEL_HEIGHT = 120;
    const TOTAL_MODES  = 3; // 0:自動列印, 1:手選列印, 2:自訂列印

    // ─── DOM 元素 ──────────────────────────────────────────
    const boardInner       = document.getElementById("boardInner");
    const modeSwitcher     = document.getElementById("modeSwitcher");
    const manualPrintBtn   = document.getElementById("manualPrintBtn");
    const customSendBtn    = document.getElementById("customSendBtn");
    const qrInput          = document.getElementById("qrInput");
    const typeToggle       = document.getElementById("typeToggle");
    const exportBtn        = document.getElementById("exportBtn");
    const importBtn        = document.getElementById("importBtn");
    const importFile       = document.getElementById("importFile");
    const importConfirm    = document.getElementById("importConfirm");
    const confirmOverwrite = document.getElementById("confirmOverwrite");
    const confirmMerge     = document.getElementById("confirmMerge");
    const confirmCancel    = document.getElementById("confirmCancel");
    const printSection     = document.getElementById("printSection");   // 翻牌區塊外層
    const apiSetupSection  = document.getElementById("apiSetupSection"); // API 輸入區塊
    const apiInput         = document.getElementById("apiInput");
    const apiSaveBtn       = document.getElementById("apiSaveBtn");
    const syncToggle        = document.getElementById("syncToggle");
    const timeUnreceived    = document.getElementById("timeUnreceived");
    const timeReturns       = document.getElementById("timeReturns");
    const timeCollection    = document.getElementById("timeCollection");

    // ─── 全域狀態 ──────────────────────────────────────────
    let currentMode   = 0;
    let isAnimating   = false;
    let pendingImport = null; // 等待確認的已解析 JSON 資料

    // ─── 1. 初始化程序 ──────────────────────────────────────

    // --- 列印區塊顯示控制 ---
    function showPrintSection() {
        printSection.style.display    = "";
        apiSetupSection.style.display = "none";
    }
    function showApiSetup(currentUrl = "") {
        printSection.style.display    = "none";
        apiSetupSection.style.display = "";
        apiInput.value = currentUrl;
    }

    // --- 狀態恢復 ---
    chrome.storage.local.get("lastMode", ({ lastMode = 0 }) => {
        const startMode = lastMode % TOTAL_MODES;
        currentMode = startMode;
        boardInner.style.transition = "none";
        boardInner.style.transform  = `translateY(-${startMode * PANEL_HEIGHT}px)`;
        syncModeToBackend(startMode);
    });

    chrome.runtime.sendMessage({ action: "GET_PRINT_API" }, ({ printApi }) => {
        if (printApi) {
            showPrintSection();
        } else {
            showApiSetup();
        }
    });

    chrome.runtime.sendMessage({ action: "GET_POPUP_MODE" }, (res) => {
        if (chrome.runtime.lastError) return;
        syncToggle.checked = res?.enabled ?? false;
        renderSyncTimes(res?.lastSync ?? {});
    });

    // --- 自動監測時間渲染 ---
    function renderSyncTimes(lastSync) {
        const fmt = (ts) => {
            if (!ts) return "--:--";
            const d = new Date(ts);
            return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
        };
        timeUnreceived.textContent = `📦 ${fmt(lastSync.unreceived)}`;
        timeReturns.textContent    = `🔄📦 ${fmt(lastSync.returns)}`;
        timeCollection.textContent = `🛍️💰 ${fmt(lastSync.collection)}`;
    }

    // --- API 儲存按鈕 ---
    apiSaveBtn.addEventListener("click", async () => {
        const url = apiInput.value.trim();
        if (!url) return;

        let origin;
        try {
            origin = new URL(url).origin + "/*";
        } catch {
            alert("網址格式不正確");
            return;
        }

        const granted = await new Promise(resolve =>
            chrome.permissions.request({ origins: [origin] }, resolve)
        );
        if (!granted) {
            alert("需要授權才能連接印表機");
            return;
        }

        chrome.runtime.sendMessage({ action: "SET_PRINT_API", url }, (res) => {
            if (res?.status === "success") showPrintSection();
        });
    });

    // --- 自動監測開關 ---
    syncToggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
            action: "SET_POPUP_MODE",
            value: { syncEnabled: syncToggle.checked }
        });
    });

    // ─── 2. 切換邏輯 (無縫翻牌) ───────────────────────────────
    modeSwitcher.addEventListener("click", () => {
        if (isAnimating) return;
        currentMode++;
        performFlip(currentMode);
    });

    function performFlip(modeIndex) {
        isAnimating = true;

        boardInner.style.transition = "transform 0.5s cubic-bezier(0.45, 0.05, 0.55, 0.95)";
        boardInner.style.transform  = `translateY(-${modeIndex * PANEL_HEIGHT}px)`;

        const logicalMode = modeIndex % TOTAL_MODES;
        syncModeToBackend(logicalMode);
        chrome.storage.local.set({ lastMode: logicalMode });

        setTimeout(() => {
            if (modeIndex === TOTAL_MODES) {
                currentMode = 0;
                boardInner.style.transition = "none";
                boardInner.style.transform  = "translateY(0px)";
            }
            isAnimating = false;
        }, 500);
    }

    // ─── 3. 模式與後台狀態同步核心 ───────────────────────────
    async function syncModeToBackend(logicalMode) {
        chrome.runtime.sendMessage({ action: "SET_POPUP_MODE", value: { mode: logicalMode } });

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const isUrlAllowed = tab?.url === chrome.runtime.getURL("pages/itemlist/ItemList.html");

        if (logicalMode === 1) {
            manualPrintBtn.disabled = !isUrlAllowed;
            manualPrintBtn.style.backgroundColor = isUrlAllowed ? "#53B1A4" : "#a0aec0";
            manualPrintBtn.innerText = isUrlAllowed ? "列印勾選項目" : "限交接清單";
        }
    }

    // ─── 4. 功能按鈕事件 ────────────────────────────────────

    // Mode 01：手動選取 按鈕
    manualPrintBtn.addEventListener("click", async () => {
        try {
            const res = await sendMessageAsync({ action: "GET_SELECTED_IDS", target: "itemlist" });

            if (res?.status === "empty") {
                alert("請先在頁面上勾選要列印的項目！");
                return;
            }
            if (res?.status !== "success") {
                alert("列印失敗，請確認 ItemList 頁面已開啟。");
            }
        } catch (err) {
            console.error("流程失敗:", err);
        }
    });

    // Mode 02：自訂列印 按鈕
    customSendBtn.addEventListener("click", () => {
        const text = qrInput.value.trim();
        if (!text) return;

        chrome.runtime.sendMessage({
            action: "SEND_TO_PRINTER",
            data: [{ dtype: typeToggle?.checked ? "memo" : "qrcode", val: text }]
        }, (res) => {
            if (res?.status === "success") {
                qrInput.value = "";
            } else if (res?.status === "no_api" || res?.status === "error") {
                showApiSetup();
            }
        });
    });

    // ─── 5. 匯出 ──────────────────────────────────────────
    exportBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "EXPORT_STORAGE" }, (res) => {
            if (!res?.data) { alert("匯出失敗"); return; }

            const json = JSON.stringify(res.data, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url  = URL.createObjectURL(blob);

            const now  = new Date();
            const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

            const a = document.createElement("a");
            a.href     = url;
            a.download = `小幫手備份_${date}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    });

    // ─── 6. 載入 ──────────────────────────────────────────
    importBtn.addEventListener("click", () => {
        importFile.value = "";
        importFile.click();
    });

    importFile.addEventListener("change", () => {
        const file = importFile.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                pendingImport = JSON.parse(e.target.result);
            } catch {
                alert("檔案格式錯誤，請選擇正確的備份檔。");
                return;
            }
            // 顯示確認列，等待使用者選擇
            importConfirm.style.display = "flex";
        };
        reader.readAsText(file);
    });

    // 確認列：覆蓋
    confirmOverwrite.addEventListener("click", () => executeImport("overwrite"));

    // 確認列：合併
    confirmMerge.addEventListener("click",     () => executeImport("merge"));

    // 確認列：取消
    confirmCancel.addEventListener("click", () => {
        pendingImport = null;
        importConfirm.style.display = "none";
    });

    function executeImport(mode) {
        if (!pendingImport) return;
        importConfirm.style.display = "none";

        chrome.runtime.sendMessage({ action: "IMPORT_STORAGE", data: pendingImport, mode }, (res) => {
            pendingImport = null;
            if (res?.status === "success") {
                alert("載入成功！");
            } else {
                alert("載入失敗，請重試。");
            }
        });
    }

    // ─── 7. 輔助函數 ──────────────────────────────────────
    function sendMessageAsync(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                const err = chrome.runtime.lastError;
                if (err) reject(err);
                else resolve(response);
            });
        });
    }
});