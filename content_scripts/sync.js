/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Sync                       ║
 * ║  同步流程：深層監聽 / id 比對 / memo與金額 差異偵測  ║
 * ╚══════════════════════════════════════════════════════╝
 */
// ─── 初始化 ──────────────────────────────────────────────
import { collectIdSnapshot, parseRowsById } from './parser.js';

// ─── 頁面路由 ────────────────────────────────────────────
const init = () => {
    const match = Object.entries(LIST_CONFIG)
        .find(([_, cfg]) => location.href.includes(cfg.pattern));

    if (match) waitForRows(match[0]);
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    init();
}

// ─── 核心入口 ────────────────────────────────────────────
function waitForRows(listType) {
	const { tableId } = LIST_CONFIG[listType];
	const table = document.getElementById(tableId);
	// 如果 Table 還沒掛載到 DOM，用 RequestAnimationFrame 續命等待
	if (!table) {
		requestAnimationFrame(() => waitForRows(listType));
		return;
	}

	// Firebase 可能在 Loading 隱藏後才開始非同步 map 資料到 DOM。
	const rowObserver = new MutationObserver((mutations, obs) => {
		const rows = Array.from(table.rows).filter(tr => tr.id);

		// 只要抓到有 id 的行，且長度 > 0，就視為資料抵達
		if (rows.length > 0) {
			// 停止監聽「列表增加」，轉向執行同步
			obs.disconnect();
			// 稍微緩衝 200ms，確保該行的資料內容（如姓名、條碼）也填寫完畢
			setTimeout(() => runSyncFlow(listType), 200);
		}
	});
	// 監聽子節點變動與整個子樹，防止 SPA 只改 innerHTML
	rowObserver.observe(table, { childList: true, subtree: true });

	// 註冊後立即檢查：防止資料在 Observer 註冊前就已存在於 DOM（競態）
	const existingRows = Array.from(table.rows).filter(tr => tr.id);
	if (existingRows.length > 0) {
		rowObserver.disconnect();
		setTimeout(() => runSyncFlow(listType), 200);
		return;
	}

	// 兜底機制：若 2 秒內沒東西，判定為空清單
	setTimeout(() => {
		if (Array.from(table.rows).filter(tr => tr.id).length === 0) {
			rowObserver.disconnect();
			// 通知 background 清單為空，讓它更新 listStorage
			chrome.runtime.sendMessage({
				action: "QUERY_ALL_IDS_AND_SNAPSHOT",
				type:   listType,
				rows:   [],
			});
		}
	}, 2000);
}

// ─── Bridge：跨 world 呼叫頁面方法 ──────────────────────
/**
 * 透過 CustomEvent 橋接，呼叫 MAIN world 的 collectionRecord._getEditRecord()。
 * @param {string} id - c_id（service_collection_payment_id）
 * @returns {Promise<object[]>} 修改歷史陣列
 */
function fetchEditRecord(id) {
	return new Promise((resolve) => {
		window.addEventListener("__smartlife_response", function handler(e) {
			if (e.detail?.type !== "getEditRecord" || e.detail?.id !== id) return;
			window.removeEventListener("__smartlife_response", handler);
			resolve(e.detail.data ?? []);
		});

		window.dispatchEvent(new CustomEvent("__smartlife_request", {
			detail: { type: "getEditRecord", id }
		}));
	});
}

/**
 * 對所有現金單並行抓取歷史，過濾掉空記錄後回傳。
 * @param {{ id: string, cash: number }[]} rows - collectIdSnapshot 的結果
 * @returns {Promise<{ c_id: string, editHistory: object[] }[]>}
 */
async function fetchAllCashRecords(rows) {
	const cashRows = rows.filter(r => r.cash !== 0);
	if (!cashRows.length) return [];

	const results = await Promise.all(
		cashRows.map(async r => ({
			c_id:        r.id,
			current:     r.cash,   // DOM 解析的當前金額
			editHistory: await fetchEditRecord(r.id),
		}))
	);

	// 只回傳有歷史記錄的
	return results.filter(r => r.editHistory.length > 0);
}

// ─── 同步流程 ────────────────────────────────────────────
async function runSyncFlow(listType) {
	try {
		// 一次掃描：收集所有列的 id 與 snapshot（含 id, memo, cash）
		const rows = collectIdSnapshot(listType);
		if (!rows.length) return;

		// [寄物頁面] 並行抓取所有現金單的歷史記錄
		// 與後續流程並行，不阻塞 QUERY_ALL_IDS_AND_SNAPSHOT
		const cashRecordsPromise = listType === "collection"
			? fetchAllCashRecords(rows)
			: Promise.resolve([]);

		// 向 Background 送入 id+memo+cash 快照；
		// background 自行比對差異，回傳需要完整解析的 newIds
		const [{ newIds, isFirstLoad }, cashRecords] = await Promise.all([
			chrome.runtime.sendMessage({
				action: "QUERY_ALL_IDS_AND_SNAPSHOT",
				type:   listType,
				rows,
			}),
			cashRecordsPromise,
		]);

		// 送出現金歷史（background 去重後寫入 InEStore）
		if (cashRecords.length) {
			chrome.runtime.sendMessage({
				action: "SUBMIT_CASH_RECORDS",
				cashRecords,  // [{ c_id, editHistory: [...] }]
			});
		}

		if (!newIds.length) return; // 沒有新項目，結束流程

		// 只對真正新增的 id 做完整欄位解析
		const newItems = parseRowsById(listType, newIds);
		if (!newItems.length) return;

		// 送往列印與存儲
		chrome.runtime.sendMessage({
			action: "SUBMIT_NEW_ITEMS",
			isFirstLoad,
			items:  newItems,
		});
	} catch (err) {
		console.error(`[${listType}] 同步失敗:`, err);
	}
}