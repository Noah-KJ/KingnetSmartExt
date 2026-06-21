/**
 * itemscript.js
 */

// ── 狀態 ──────────────────────────────────────────────────────────────────────
let originalData = [];
let currentSort = { field: null, order: 'asc' };

// ── 初始化 ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const options = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false };
    document.getElementById('TimeStamp').innerText =
        `列印日期：${new Date().toLocaleString("zh-TW", options)}`;

    // 1. 獲取資料
    chrome.runtime.sendMessage({ action: "GET_ITEM_STORE" }, (response) => {
        if (response?.ItemStore) {
            originalData = Object.values(response.ItemStore);
            renderTable(originalData);
        }
    });

    // 2. 全選 / 全取消
    document.getElementById('topChk').addEventListener('change', (e) => {
        document.querySelectorAll('.item-chk')
            .forEach(chk => chk.checked = e.target.checked);
    });

    // 3. 排序按鈕
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.innerText = "-";
        btn.addEventListener('click', () => executeSort(btn.getAttribute('data-field')));
    });
});

// ── 排序 ──────────────────────────────────────────────────────────────────────

/**
 * 切換排序欄位／方向，更新 UI，並重新渲染表格
 */
function executeSort(field) {
    currentSort = {
        field,
        order: (currentSort.field === field && currentSort.order === "asc") ? "desc" : "asc"
    };

    updateSortButtonsUI();

    const tbody = document.getElementById("packageBody");

    // 執行排序
    const sorted = [...originalData].sort((a, b) => {
        const valA = String(a[field] ?? "");
        const valB = String(b[field] ?? "");
        const comparison = valA.localeCompare(valB, undefined, {
            numeric: true,
            sensitivity: "base",
        });

        return currentSort.order === "asc" ? comparison : -comparison;
    });

    const fragment = document.createDocumentFragment();
    sorted.forEach((item) => {
        const row = document.getElementById(item.id);
        if (row) {
        fragment.appendChild(row);
        }
    });

    tbody.appendChild(fragment);
}

/**
 * 更新排序按鈕圖示與樣式
 */
function updateSortButtonsUI() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        const isActive = btn.getAttribute('data-field') === currentSort.field;
        btn.innerText = isActive ? (currentSort.order === 'asc' ? "▲" : "▼") : "-";
        btn.style.backgroundColor = isActive ? "#1a73e8" : "#fff";
        btn.style.color           = isActive ? "#fff"    : "#1a73e8";
    });
}

// ── 渲染（主流程） ────────────────────────────────────────────────────────────

/**
 * 主渲染函式：計算統計 → 建立 DOM → 更新統計欄位
 */
function renderTable(data) {
    const stats = calcStats(data);
    buildTableDOM(data);
    updateStatsUI(stats);
    document.getElementById('topChk').checked = false;
}

// ── 統計 ──────────────────────────────────────────────────────────────────────

/**
 * 純函式：從資料計算所有統計數字，不碰 DOM
 * @returns {{ total, cashCount, cashAmount, crossMap }}
 *   crossMap: { [locName]: { package, mail, collection, returns, total } }
 *   位置空白時歸入 "未指定"
 */
function calcStats(data) {
    const stats = {
        total: data.length,
        cashCount: 0,
        cashAmount: 0,
        crossMap: {}
    };

    function getOrCreateLoc(loc) {
        if (!stats.crossMap[loc]) {
            stats.crossMap[loc] = { package: 0, mail: 0, collection: 0, returns: 0, total: 0 };
        }
        return stats.crossMap[loc];
    }

    data.forEach(item => {
        const order       = item.odr || "";
        const rawCategory = item.cat || "";
        const loc         = item.loc?.trim() || "未指定";

        // 現金：只計入現金統計，不進交叉表
        if (item.listType === "collection" && rawCategory.startsWith("現金")) {
            stats.cashCount++;
            stats.cashAmount += parseInt(rawCategory.match(/\((\d+)\)/)?.[1] || 0, 10);
            return;
        }

        // 判斷分類
        let catKey = null;
        if (item.listType === "collection") {
            catKey = 'collection';
        } else if (order.startsWith('A')) {
            catKey = 'returns';
        } else if (/^\d+$/.test(order)) {
            catKey = (rawCategory === "包裹" || rawCategory === "大宗物品") ? 'package' : 'mail';
        }

        if (catKey) {
            const row = getOrCreateLoc(loc);
            row[catKey]++;
            row.total++;
        }
    });

    return stats;
}

// ── DOM 建立 ──────────────────────────────────────────────────────────────────

/**
 * 將資料陣列轉成 <tr> 並一次性插入 tbody（使用 DocumentFragment 減少 reflow）
 */
function buildTableDOM(data) {
    const fragment = document.createDocumentFragment();

    data.forEach(item => {
        const order       = item.odr || "";
        const rawCategory = item.cat || "";
        const isCash = rawCategory.startsWith("現金") && order.startsWith('B');

        // 顯示用的分類文字
        let categoryDisplay = rawCategory;
        if (order.startsWith('B')) {
            if (isCash){
                    categoryDisplay = rawCategory
                        .replace('現金', '💰')
                        .replace(/\((\d+)\)/, '$$$1');
            } else{
                categoryDisplay = rawCategory.match(/\((.*?)\)/)?.[1] || rawCategory;
            }
        }

        const tempPrefix  = item.temp === 0 ? "💧" : item.temp === 1 ? "❄️" : "";
        const nameDisplay = `${item.rcvr ? "" : "寄："}${item.pvt ? "㊙️" : ""}${item.name}`;
        const formattedDate = formatDate(item.time);
        const tr = document.createElement('tr');
        tr.id = item.id;
        tr.setAttribute('barcode', item.barcode);
        tr.innerHTML = `
            <td><label><input type="checkbox" class="item-chk"></label></td>
            <td>${order}</td>
            <td style="${isCash ? 'text-align:right' : ''}">${tempPrefix}${categoryDisplay}</td>
            <td>${item.adr}</td>
            <td>${nameDisplay}</td>
            <td>${item.loc}</td>
            <td>${formattedDate}</td>
            <td>${item.memo || ''}</td>
        `;
        fragment.appendChild(tr);
    });

    const tbody = document.getElementById('packageBody');
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

/**
 * 格式化日期：'YYYY/MM/DD HH:mm' → 'MM/DD'
 */
function formatDate(regDate) {
    if (!regDate) return "";
    const parts = regDate.split(' ')[0].split('/');
    return parts.length > 2 ? `${parts[1]}/${parts[2]}` : regDate;
}

// ── 更新統計 UI ───────────────────────────────────────────────────────────────

/**
 * 將統計數字寫入對應的 DOM 元素，並動態建立位置×分類交叉表
 */
function updateStatsUI(stats) {
    // 現金
    document.getElementById('cashCount').innerText  = stats.cashCount;
    document.getElementById('cashAmount').innerText = stats.cashAmount.toLocaleString();

    // ── 交叉表 ────────────────────────────────────────────────────────────────
    const CATS = [
        { key: 'package',    label: '包裹' },
        { key: 'mail',       label: '郵件' },
        { key: 'collection', label: '寄物' },
        { key: 'returns',    label: '退貨' },
    ];
    const COL_COUNT = CATS.length + 2; // 位置 + 各分類 + 小計
    
    // 位置列依小計由多到少排序；"未指定" 固定排最後
    const locEntries = Object.entries(stats.crossMap)
        .filter(([loc]) => loc !== "未指定")
        .sort((a, b) => b[1].total - a[1].total);
    if (stats.crossMap["未指定"]) {
        locEntries.push(["未指定", stats.crossMap["未指定"]]);
    }

    // 計算各分類總計
    const colTotals = { package: 0, mail: 0, collection: 0, returns: 0, total: 0 };
    locEntries.forEach(([, row]) => {
        CATS.forEach(c => { colTotals[c.key] += row[c.key]; });
        colTotals.total += row.total;
    });

    const fragment = document.createDocumentFragment();

    
    // 標題列
    const thead = document.createElement('thead');

    // 欄頭列
    const headTr = document.createElement('tr');
    headTr.className = 'title';
    ['位置', ...CATS.map(c => c.label), '小計'].forEach(label => {
        const th = document.createElement('th');

        if(label === '位置') th.className = 'txt';
        
        th.innerText = label;
        headTr.appendChild(th);
    });
    thead.appendChild(headTr);
    fragment.appendChild(thead);

    // 資料列
    const tbody = document.createElement('tbody');
    
    locEntries.forEach(([locName, row]) => {
        const tr = document.createElement('tr');
        const locTd = document.createElement('td');
        
        locTd.className = 'txt';
        locTd.innerText = locName;

        tr.appendChild(locTd);
        CATS.forEach(c => {
            const td = document.createElement('td');
            td.innerText = row[c.key] || '';
            tr.appendChild(td);
        });
        const totalTd = document.createElement('td');
        totalTd.innerText = row.total;
        tr.appendChild(totalTd);
        tbody.appendChild(tr);
    });

    // 總計列
    const totalTr = document.createElement('tr');
    totalTr.className = 'title';
    const totalLabelTd = document.createElement('td');
    totalLabelTd.className = 'txt';
    totalLabelTd.innerText = '合計';
    totalTr.appendChild(totalLabelTd);
    CATS.forEach(c => {
        const td = document.createElement('td');
        td.innerText = colTotals[c.key] || '';
        totalTr.appendChild(td);
    });
    const grandTd = document.createElement('td');
    grandTd.innerText = colTotals.total;
    totalTr.appendChild(grandTd);
    tbody.appendChild(totalTr);

    fragment.appendChild(tbody);

    const table = document.getElementById('crossTable');
    table.innerHTML = '';
    table.appendChild(fragment);
}

// ── 列印訊息監聽 ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "GET_SELECTED_IDS" && message.target === "itemlist-internal") {
        const selectedIds = Array.from(document.querySelectorAll("input.item-chk:checked"))
            .map(chk => chk.closest("tr")?.id)
            .filter(Boolean);
            
        sendResponse({ ids: selectedIds });
    }
});

// ── tr 點擊選取 ──────────────────────────────────────────────────────────────

/**
 * 點擊 tr（排除第一欄）→ toggle checkbox
 */
(function initRowSelection() {
    const tbody = document.getElementById('packageBody');

    tbody.addEventListener('click', (e) => {
        const tr = e.target.closest('#packageBody tr');
        if (!tr) return;

        // 排除第一欄
        if (e.target.closest('td') === tr.cells[0]) return;

        const chk = tr.querySelector('.item-chk');
        if (chk) chk.checked = !chk.checked;
    });
})();