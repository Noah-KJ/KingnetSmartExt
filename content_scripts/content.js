/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Content Script             ║
 * ║  頁面入口：報到 / 快捷鍵派發 / 路由同步              ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * ※ 本檔整合原 content.js（快捷鍵）與 sync.js（DOM同步）的職責，
 *    供 postalList.aspx 及 reservation_v2.aspx 共用。
 *    退貨 / 寄物清單頁面的同步邏輯仍由獨立的 sync.js 負責。
 */
// ─── 初始化 ──────────────────────────────────────────────
import { handlePackageTask, handleFacilityTask } from './automation.js';
import { collectIdSnapshot, parseRowsById } from './parser.js';

// 頁面就緒後立即向 Background 報到（快捷鍵流程）
chrome.runtime.sendMessage({ action: "CONTENT_READY" });

// ─── 快捷鍵派發 ──────────────────────────────────────────
const TASK_HANDLERS = {
	package:  handlePackageTask,
	facility: handleFacilityTask,
};

chrome.runtime.onMessage.addListener(async ({ action, group, index }) => {
	if (action !== "START_AUTOMATION") return;
	try {
		await TASK_HANDLERS[group]?.(index);
	} catch (err) {
		console.error("❌ 自動化執行錯誤:", err);
	}
});

// ─── 頁面路由 ────────────────────────────────────────────
const match = Object.entries(LIST_CONFIG)
    .find(([_, cfg]) => location.href.includes(cfg.pattern));

if (match) runSyncFlow(match[0]);


// ─── DOM 同步：執行同步流程 ──────────────────────────────
async function runSyncFlow(listType) {
	try {
		// 一次掃描：收集所有列的 id 與 snapshot
		const rows = collectIdSnapshot(listType);
		if (!rows.length) return;

		// 向 Background 送入 id+memo 快照；
		// background 自行比對 memo 差異並 patch ItemStore，回傳需要完整解析的 newIds
		const { newIds, isFirstLoad } = await chrome.runtime.sendMessage({
			action: "QUERY_ALL_IDS_AND_SNAPSHOT",
			type:   listType,
			rows,   // [{ id, loc, memo, cash }, ...]
		});

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