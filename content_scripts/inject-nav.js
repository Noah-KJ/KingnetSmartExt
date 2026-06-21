/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Inject Nav                 ║
 * ║          將 4 個自訂導覽按鈕注入官方頁面             ║
 * ╚══════════════════════════════════════════════════════╝
 */

// 1. 共用常數
const NAV_ITEMS = [
    { id: "btnil", label: "📦 交接清單", page: "pages/itemlist/ItemList.html" },
    { id: "btnrt", label: "👥 住戶標記", page: "pages/residenttag/ResidentTag.html" },
    { id: "btnin", label: "💰 現金收付", page: "pages/inelog/InELog.html" },
];

// export 導出初始化函數
export async function initNav() {
    let target = null;
    for (let i = 0; i < 3; i++) {
        target = await waitFor("id", "header");
        if (target) break;
    }
    if (!target || target.querySelector(".ext-nav-group")) return;
    _injectButtons(target.querySelector(":scope > *:first-child"));
}

// ─── 內部私有函數 ─────────────────────────────────────────
function _injectButtons(target) {
    const group = document.createElement("div");
    group.className = "ext-nav-group"; // 方便判斷是否重複注入
    
    Object.assign(group.style, {
        display: "inline-flex",

        verticalAlign: "middle",
        justifyContent: "flex-end"
    });

    NAV_ITEMS.forEach(({ id, label, page }) => {
        const btn = document.createElement("button");
        btn.id = id;
        btn.textContent = label;
        btn.type = "button";
        btn.className = "el-button el-button--primary is-round";

        btn.style.fontSize = "20px";

        btn.addEventListener("click", () => {
            chrome.runtime.sendMessage({ action: "OPEN_MY_PAGE", page });
        });

        group.appendChild(btn);
    });

    // 根據頁面微調注入位置
    const second = target.children[1];

    if (location.href.includes("/mgmt/home")) {
        // 首頁邏輯
        if (second) target.insertBefore(group, second);
    } else {
        // 其他頁面邏輯：改用 querySelector 尋找目標容器
        // 假設你原本想注入到第二個區塊內部的第一個元素之前
        const container = second?.firstElementChild;
        const referenceNode = container?.firstElementChild;

        if (container && referenceNode) {
            container.insertBefore(group, referenceNode);
        } else if (container) {
            // 如果找不到 referenceNode，就直接 append 到容器裡
            container.appendChild(group);
        } else if (second) {
            // 如果連 container 都沒有，就直接塞進 second
            second.appendChild(group);
        }
    }
}