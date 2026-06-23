/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Init Store                 ║
 * ║  首次使用：自動掃描住戶清單，建立 RTStore            ║
 * ╚══════════════════════════════════════════════════════╝
 * 僅在 RTStore 為空時由 loader.js 載入，執行完畢後不再使用。
 * 執行頁面：postalList.aspx
 */

(async () => {
    // ── 顯示進度 UI ──────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.9); color: white; z-index: 999999;
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; font-family: "微軟正黑體", sans-serif;
    `;
    overlay.innerHTML = `
        <h1 style="color:#409EFF; margin-bottom:16px;">⏳ 初始化住戶資料中...</h1>
        <p id="init-progress" style="font-size:16px; color:#aaa;">正在開啟選單...</p>
    `;
    document.body.appendChild(overlay);
    const setProgress = (msg) => {
        document.getElementById('init-progress').textContent = msg;
    };

    // ── 等待工具 ──────────────────────────────────────────
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const waitForEl = (selector, timeout = 8000) => new Promise((resolve) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        const obs = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) { obs.disconnect(); resolve(el); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });

    // ── 觸發三欄選單（同 package-for-address）────────────
    const fab = await waitForEl('#oneClickLabel');
    fab?.click();
    await sleep(500);

    const masterDiv = await waitForEl('#masterVerifyTypeDiv');
    // index 2 = 第三個子元素 = 戶別選取
    const btn = masterDiv?.children?.[1]?.children?.[0]?.children?.[2];
    btn?.click();
    await sleep(800);

    const selTag   = await waitForEl('#selTag_m');
    const selFloor = await waitForEl('#selFloor_m');
    const selUnit  = await waitForEl('#selTablet_m');

    if (!selTag || !selFloor || !selUnit) {
        overlay.innerHTML = `<h1 style="color:#F56C6C;">❌ 無法開啟選單，請重新整理後再試。</h1>`;
        return;
    }

    const initialStore = {};
    let seqCounter = 1;

    const tagOptions = Array.from(selTag.options).filter(o => o.id?.startsWith('Building'));

    // ── 雙層巢狀迴圈 ─────────────────────────────────────
    for (const tagOpt of tagOptions) {
        // 點選棟別
        selTag.value = tagOpt.value;
        selTag.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(600);

        const floorOptions = Array.from(selFloor.options).filter(o => o.id?.startsWith('Floor'));

        for (const floorOpt of floorOptions) {
            setProgress(`掃描中：${tagOpt.value} ${floorOpt.textContent.trim()}`);

            // 點選樓層
            selFloor.value = floorOpt.value;
            selFloor.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(500);

            // 抓第三欄所有戶別
            const unitOptions = Array.from(selUnit.options).filter(o => o.value && o.value !== '請選擇');
            for (const unitOpt of unitOptions) {
                const id  = unitOpt.value;
                const adr = unitOpt.textContent.trim();
                if (id && adr && !initialStore[id]) {
                    initialStore[id] = {
                        odr:        String(seqCounter++).padStart(3, '0'),
                        adr,
                        tag:        "",
                        tagDelDate: "",
                        users:      [],
                    };
                }
            }
        }
    }

    // ── 寫入 RTStore ──────────────────────────────────────
    setProgress(`掃描完成，共 ${Object.keys(initialStore).length} 戶，正在儲存...`);
    await chrome.runtime.sendMessage({ action: "SET_RTSTORE", data: initialStore });

    overlay.innerHTML = `
        <h1 style="color:#67C23A; margin-bottom:16px;">✅ 初始化完成！</h1>
        <p style="font-size:16px;">共建立 ${Object.keys(initialStore).length} 筆住戶資料。</p>
        <p style="font-size:14px; color:#aaa; margin-top:12px;">頁面將自動重新整理...</p>
    `;
    await sleep(2000);
    location.reload();
})();