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
        new Promise(resolve => setTimeout(() => resolve("timeout"), 4000))
    ]);

    if (ready === "timeout") return; // 未登入或認證失效，靜默退出

    const url = location.href;
    const getURL = (path) => chrome.runtime.getURL(`content_scripts/${path}`);

    // --- 0. 確認 RTStore 是否有住戶資料 ---
    const { data: rtData } = await chrome.runtime.sendMessage({ action: "GET_RTSTORE" });
    const hasRTStore = rtData && Object.keys(rtData).length > 0;

    if (!hasRTStore) {
        if (url.includes('postalList.aspx')) {
            // 已在包裹頁，執行自動掃描
            await import(getURL('init-store.js'));
        } else {
            // 跳轉到包裹頁觸發掃描
            location.href = 'https://www.kingnetsmart.com.tw/community/postalList.aspx';
        }
        return;
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