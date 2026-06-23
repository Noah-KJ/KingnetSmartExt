/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Sync                       ║
 * ║  同步流程：深層監聽 / id 比對 / memo與金額 差異偵測  ║
 * ╚══════════════════════════════════════════════════════╝
 */
// ─── 初始化 ──────────────────────────────────────────────
import { collectIdSnapshot, parseRowsById } from './parser.js';

// ─── 頁面路由 ────────────────────────────────────────────
const match = Object.entries(LIST_CONFIG)
    .find(([_, cfg]) => location.href.includes(cfg.pattern));

if (match) runSyncFlow(match[0]);

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
		// 與後續流程並行，不阻塞 EXTRACT_ALL_ROW_SNAPSHOT
		const cashRecordsPromise = listType === "collection"
			? fetchAllCashRecords(rows)
			: Promise.resolve([]);

		// 向 Background 送入 id+memo+cash 快照；
		// background 自行比對差異，回傳需要完整解析的 newIds
		const [{ newIds, isFirstLoad }, cashRecords] = await Promise.all([
			chrome.runtime.sendMessage({
				action: "EXTRACT_ALL_ROW_SNAPSHOT",
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