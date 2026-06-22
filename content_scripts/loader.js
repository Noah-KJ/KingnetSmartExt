/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  ESM Loader                 ║
 * ║          負責動態載入模組與初始化引導防呆檢查        ║
 * ╚══════════════════════════════════════════════════════╝
 */

(async () => {
    // 等待登入完成信號（BrowserPushToken PATCH）
    const ready = await Promise.race([
        new Promise(resolve =>
            window.addEventListener("__smartlife_page_ready", resolve, { once: true })
        ),
        new Promise(resolve => setTimeout(() => resolve("timeout"), 10000))
    ]);

    if (ready === "timeout") return; // 未登入或認證失效，靜默退出

    const url = location.href;
    const getURL = (path) => chrome.runtime.getURL(`content_scripts/${path}`);

    // --- 0. 初始化：檢查 ResidentTag.html 是否存在 ---
    const tagFileUrl = chrome.runtime.getURL('pages/residenttag/ResidentTag.html');
    let hasResidentTag = false;
    try {
        const res = await fetch(tagFileUrl, { method: 'HEAD' }); // 用 HEAD 輕量請求檢查
        hasResidentTag = res.ok;
    } catch (e) {
        hasResidentTag = false;
    }

    // 若遺失檔案，進入「引導下載與設定」流程，並中斷後續注入
    if (!hasResidentTag) {
        if (url.includes('/mgmt/household')) {
            // 已在官方頁面，執行自動化抓取
            await handleAutoGeneration();
        } else {
            // 不在官方頁面，跳出提示引導前往
            showRedirectPrompt();
        }
        return; // ⛔ 終止程式，不注入 nav、不載入 content scripts
    }

    // --- 1. 全局基礎 (工具與設定) ---
    const configMod = await import(getURL('config.js'));
    const utilsMod  = await import(getURL('utils.js'));
    
    window.LIST_CONFIG = configMod.LIST_CONFIG;  
    Object.assign(window, utilsMod.Utils);       

    // --- 2. 頁面配置映射表 ---
    const ROUTE_MAP = [
        {
            match: 'postalList.aspx',
            scripts: ['content.js', 'showinf.js', 'automation.js']
        },
        {
            match: ['postalReturnList.aspx', 'collectionRecord_v2.aspx'],
            scripts: ['sync.js']
        },
        {
            match: 'reservation_v2.aspx',
            scripts: ['content.js', 'automation.js']
        }
    ];

    // --- 3. 執行匹配載入 ---
    for (const route of ROUTE_MAP) {
        const isMatched = Array.isArray(route.match) 
            ? route.match.some(m => url.includes(m))
            : url.includes(route.match);

        if (isMatched) {
            await Promise.all(route.scripts.map(file => import(getURL(file))));
            break; 
        }
    }

    // --- 4. 全局功能模組 (導覽與標記) ---
    await import(getURL('lightbox.js')); 
    const { initNav }  = await import(getURL('inject-nav.js'));
    const { initMark } = await import(getURL('inject-mark.js'));
    await initNav();
    await initMark(); 
})();

// ═════════════════════════════════════════════════════════════════════════
//      以下為初始化防呆機制的私有函式 (自動導向、生成與下載)
// ═════════════════════════════════════════════════════════════════════════

function showRedirectPrompt() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.85); color: white; z-index: 999999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-family: "微軟正黑體", sans-serif; backdrop-filter: blur(5px);
    `;
    overlay.innerHTML = `
        <h1 style="color: #E6A23C; margin-bottom: 20px;">⚠️ 智生活小幫手：需要進行初始設定</h1>
        <p style="font-size: 18px; margin-bottom: 30px; text-align: center; line-height: 1.6;">
            系統偵測到遺失「住戶標記清單」的核心檔案，擴充功能暫時停用。<br>
            請點擊下方按鈕前往「住戶管理」頁面，系統將自動為您生成檔案！
        </p>
        <button id="goHouseholdBtn" style="padding: 15px 30px; font-size: 20px; cursor: pointer; background: #409EFF; color: white; border: none; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">🚀 前往自動生成檔案</button>
    `;
    document.body.appendChild(overlay);

    document.getElementById('goHouseholdBtn').onclick = () => {
        location.href = 'https://www.kingnetsmart.com.tw/mgmt/household/';
    };
}

async function handleAutoGeneration() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.9); color: white; z-index: 999999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-family: "微軟正黑體", sans-serif;
    `;
    overlay.innerHTML = `
        <h1 style="color: #409EFF; margin-bottom: 20px;">⏳ 正在掃描住戶資料...</h1>
        <p style="font-size: 18px;">請稍候，正在為您建立專屬的 ResidentTag.html</p>
    `;
    document.body.appendChild(overlay);

    // 輪詢等待表格加載 (最多等待 15 秒)
    let rows = null;
    for (let i = 0; i < 30; i++) {
        rows = document.querySelectorAll('.el-table__body tbody tr');
        if (rows && rows.length > 0) break;
        await new Promise(r => setTimeout(r, 500));
    }

    if (!rows || rows.length === 0) {
        overlay.innerHTML = `
            <h1 style="color: #F56C6C;">❌ 掃描失敗</h1>
            <p style="font-size: 18px;">找不到住戶表格資料，請確認網頁是否正常顯示或重新整理重試。</p>
        `;
        return;
    }

    // 1. 從 thead 動態定位欄位 index
    function getColIndex(label) {
        const ths = document.querySelectorAll('table.el-table__header th');
        for (let i = 0; i < ths.length; i++) {
            if (ths[i].querySelector('.cell')?.textContent.trim() === label) return i;
        }
        return -1;
    }
    const adrIdx  = getColIndex('戶別');
    const aTagIdx = getColIndex('住戶資料');

    // 2. 初始化資料存儲結構
    const initialStore = {};
    let tbodyHtml = '';
    rows.forEach((row, index) => {
        const cells = row.querySelectorAll('td');
        const seq  = String(index + 1).padStart(3, '0');
        const adr  = adrIdx  >= 0 ? cells[adrIdx]?.innerText.trim()      : '';
        const aTag = aTagIdx >= 0 ? cells[aTagIdx]?.querySelector('a')    : null;
        if (aTag) {
            const href = aTag.getAttribute('href');
            const a_id = href.split('/').pop();
            tbodyHtml += `            <tr id="${a_id}"><td>${seq}</td><td>${adr}</td><td></td></tr>\n`;
        }
    });

    const fullHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <title>小幫手 - 住戶標記</title>
    <link rel="stylesheet" href="rtstyle.css">
</head>
<body>

<nav id="rt-topbar">
    <div id="rt-topbar-left">
        <img src="../../icon/icon-192x192.png" alt="icon">
        <span class="rt-title">住戶標記</span>
    </div>
    <div id="rt-topbar-right">
        <button id="save-btn">💾 回存</button>
        <span id="rt-clock"></span>
    </div>
</nav>

<div class="postal-print-content">
    <div class="top-title">住戶標記清單</div>

    <table class="tb-printlist">
        <thead>
            <tr class="title">
                <th> 序號 <span class="sort-btn no-print" data-field="odr"></span></th>
                <th> 戶別 <span class="sort-btn no-print" data-field="adr"></span></th>
                <th>姓名集合</th>
            </tr>
        </thead>
        <tbody id="residentBody">
${tbodyHtml}        </tbody>
    </table>
</div>

<div id="rt-popup-overlay" style="display:none;">
    <div id="rt-popup-box">
        <div id="rt-popup-title"></div>
        <input id="rt-popup-input" type="text" maxlength="16" placeholder="最多16字元">
        <div id="rt-popup-date-row">
            <label for="rt-popup-date">到期清除：</label>
            <input id="rt-popup-date" type="date">
            <button id="rt-popup-date-clear" title="清除日期">✕</button>
        </div>
        <div id="rt-popup-btn-row">
            <button class="rt-popup-btn confirm">確認</button>
            <button class="rt-popup-btn cancel">取消</button>
        </div>
    </div>
</div>

<script src="rtscript.js"></script>
</body>
</html>`;

    rows.forEach((row, index) => {
        const cells = row.querySelectorAll('td');
        const seq  = String(index + 1).padStart(3, '0');
        const adr  = adrIdx  >= 0 ? cells[adrIdx]?.innerText.trim()   : '';
        const aTag = aTagIdx >= 0 ? cells[aTagIdx]?.querySelector('a') : null;
        const a_id = aTag ? aTag.getAttribute('href').split('/').pop() : `tmp_${index}`;

        // 2. 依照 saveStore 的結構建立資料物件
        initialStore[a_id] = {
            odr:        seq,
            adr:        adr,
            tag:        "",
            tagDelDate: "",
            users:      []
        };

        // 組合 HTML 結構
        tbodyHtml += `            <tr id="${a_id}"><td>${seq}</td><td>${adr}</td><td></td></tr>\n`;
    });

    // 3. 發送訊息給 Background 初始化 Store
    chrome.runtime.sendMessage({ 
        action: "SET_RTSTORE", 
        data: initialStore 
    }, (response) => {
        console.log("✅ ResidentTag Store 初始化完成");
    });

    // 觸發下載
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ResidentTag.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 變更 UI，引導使用者完成最後步驟
    overlay.innerHTML = `
        <h1 style="color: #67C23A; margin-bottom: 20px;">✅ 檔案已下載！最後步驟：</h1>
        <div style="background: #222; padding: 25px; border-radius: 8px; text-align: left; line-height: 2;">
            <p>1. 請找到剛剛下載的 <b>ResidentTag.html</b> 檔案</p>
            <p>2. 將它移動並覆蓋到擴充功能資料夾內：<br>
               <span style="color: #E6A23C; font-weight: bold; font-size: 18px;">👉 您的插件目錄 / pages / residenttag / ResidentTag.html</span>
            </p>
            <p>3. 回到擴充功能管理頁面點擊「重新載入」按鈕</p>
            <p>4. 重新整理本網頁，即可開始使用小幫手全套功能！</p>
        </div>
    `;
}