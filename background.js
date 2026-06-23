/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Background Service         ║
 * ║  核心控制中心：狀態管理 / 列印橋接 / 快捷鍵自動化    ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * 訊息來源
 *  loader.js     →  GET_RTSTORE
 *  content.js    →  CONTENT_READY | EXTRACT_ALL_ROW_SNAPSHOT | SUBMIT_NEW_ITEMS
 *  sync.js       →  EXTRACT_ALL_ROW_SNAPSHOT | SUBMIT_NEW_ITEMS | SUBMIT_CASH_RECORDS
 *  popup.js      →  GET_SELECTED_IDS | SEND_TO_PRINTER | 
 * 					  EXPORT_STORAGE | IMPORT_STORAGE
 * 					  GET_POPUP_MODE | SET_POPUP_MODE
 * 					  GET_PRINT_API | SET_PRINT_API
 *  ilscript.js   →  GET_ITEM_STORE
 *  inescript.js  →  GET_INESTORE | SET_INESTORE
 *  inject-nav.js →  OPEN_MY_PAGE
 *  rtscript.js   →  GET_RTSTORE | SET_RTSTORE
 *  automation.js →  SET_BTN_LIMIT
 *  lightbox.js   →  REFRESH_IMG_URLS | IMG_URL_REFRESHED
 */

// ─── 常數 ────────────────────────────────────────────────
const FACILITY_URL = "https://www.kingnetsmart.com.tw/community/reservation_v2.aspx";
const PACKAGE_URL  = "https://www.kingnetsmart.com.tw/community/postalList.aspx";
const COLLECT_URL  = "https://www.kingnetsmart.com.tw/community/collectionRecord_v2.aspx";
const RETURN_URL   = "https://www.kingnetsmart.com.tw/community/postalReturnList.aspx";

// ─── 自動監測 ────────────────────────────────────────────
const SYNC_TARGETS = [
    { type: "unreceived", url: PACKAGE_URL },
    { type: "returns",    url: RETURN_URL  },
    { type: "collection", url: COLLECT_URL },
];


// 溫層代碼 → 標籤文字（常溫為 "" 不顯示）
const TEMP_LABEL = { 0: "冷藏", 1: "冷凍" };

// 快捷鍵指令對應表
// url 預設為 PACKAGE_URL；group/index 供 automation.js 定位操作目標
const COMMANDS = {
    "package-for-cardkey": { group: "package",  index: 1 },
    "package-for-address": { group: "package",  index: 2 },
    "facility-leave":      { url: FACILITY_URL, group: "facility", index: 99 },
    "facility-01":          { url: FACILITY_URL, group: "facility", slot: 0 },
    "facility-02":          { url: FACILITY_URL, group: "facility", slot: 1 },
    "facility-03":          { url: FACILITY_URL, group: "facility", slot: 2 },
    "facility-04":          { url: FACILITY_URL, group: "facility", slot: 3 },
    "facility-05":          { url: FACILITY_URL, group: "facility", slot: 4 },
    "facility-06":          { url: FACILITY_URL, group: "facility", slot: 5 },
	"facility-07":          { url: FACILITY_URL, group: "facility", slot: 6 },
	"facility-08":          { url: FACILITY_URL, group: "facility", slot: 7 },
	"facility-09":          { url: FACILITY_URL, group: "facility", slot: 8 },
	"facility-10":          { url: FACILITY_URL, group: "facility", slot: 9 },
	"facility-11":          { url: FACILITY_URL, group: "facility", slot: 10 },
	"facility-12":          { url: FACILITY_URL, group: "facility", slot: 11 },
	"facility-13":          { url: FACILITY_URL, group: "facility", slot: 12 },
	"facility-14":          { url: FACILITY_URL, group: "facility", slot: 13 },
	"facility-15":          { url: FACILITY_URL, group: "facility", slot: 14 },
	"facility-16":          { url: FACILITY_URL, group: "facility", slot: 15 },
	"facility-17":          { url: FACILITY_URL, group: "facility", slot: 16 },
	"facility-18":          { url: FACILITY_URL, group: "facility", slot: 17 },
	"facility-19":          { url: FACILITY_URL, group: "facility", slot: 18 },
	"facility-20":          { url: FACILITY_URL, group: "facility", slot: 19 },
};

const OFFICAL_KEYS = [
	"unreceived", "returns", "collection"  // 官方清單
];
const STORAGE_KEYS = [
	"persistedSets",
	"settings",
	"ItemStore", 
	"InEStore", "InEDiffLog", 
	"RTStore", 
	"btnLimit"
];

// ─── 狀態 ────────────────────────────────────────────────
let printApi = ""; // 持久化，由使用者在 popup 設定

// listStorage：三個官方清單的 id Set，初始含 "0" 代表尚未載入（首刷標記）
let listStorage = Object.fromEntries(OFFICAL_KEYS.map(k => [k, new Set(["0"])]));

const settings = {
    popupMode: 0,
    syncEnabled: false,
    lastSync: { unreceived: null, returns: null, collection: null },
};

let syncRunning = false;

let ItemStore   = {};    // 包裹 / 退件 / 寄物的完整資料快取
let InEStore    = {};    // 收付清單，key = a_id
let InEDiffLog  = { total: 0, entries: [] };  // 總收付，entries: [{ c_id, a_id, adr, odr, name, delta, time }]
let RTStore     = {};    // 用戶紀錄
let btnLimit = 0;  // 公設進場按鈕數量

// ─── InEStore 查詢工具 ───────────────────────────────────
const findCidEntry = (c_id) => {
    for (const bucket of Object.values(InEStore)) {
        const entry = bucket.c_id?.find(c => String(c.id) === String(c_id));
        if (entry) return { bucket, entry };
    }
    return null;
};

// ─── 初始化 ──────────────────────────────────────────────
// Service Worker 重啟後從 chrome.storage 恢復所有持久化狀態
async function loadStorage() {
    const data = await chrome.storage.local.get(STORAGE_KEYS);

    // 1. 恢復 Set 結構
    if (data.persistedSets) {
        OFFICAL_KEYS.forEach(k => {
            if (data.persistedSets[k]) {
                listStorage[k] = new Set(data.persistedSets[k]);
            }
        });
    }

    // 2. 恢復彈窗模式
	if (data.settings) Object.assign(settings, data.settings);

    // 3. 恢復數據 Store 
	if (data.ItemStore) ItemStore = data.ItemStore;
	if (data.InEStore) InEStore = data.InEStore;
	if (data.InEDiffLog) InEDiffLog = data.InEDiffLog;
	if (data.RTStore)   RTStore   = data.RTStore;
	if (data.btnLimit) btnLimit = data.btnLimit;
	if (data.printApi) printApi = data.printApi;
}

// 寫入 chrome.storage.local
function saveStorage() {
    chrome.storage.local.set({
        persistedSets: Object.fromEntries(
            OFFICAL_KEYS.map(k => [k, Array.from(listStorage[k])])
        ),
		settings,
        ItemStore, 
        InEStore,
        InEDiffLog,
        RTStore, 
		btnLimit,
		printApi,
    }, () => {
        if (chrome.runtime.lastError) console.error("儲存失敗:", chrome.runtime.lastError);
    });
}

// 執行恢復
const storageReady = loadStorage();

// ─── 訊息派發 ────────────────────────────────────────────
const MESSAGE_HANDLERS = {
	/**
	 * [content.js] 用於確認分頁載入完成，目前僅作為握手使用
	 */
	CONTENT_READY: () => {},

	/**
	 * [automation.js] 儲存掃描到的公設 btnLimit
	 */
	SET_BTN_LIMIT({ count }, sendResponse) {
		btnLimit = count;
		saveStorage();
		sendResponse?.({ status: "success" });
	},

	/**
	 * [popup.js] 設定彈窗狀態（模式 + 開關）
	 */
	SET_POPUP_MODE({ value }, sendResponse) {
		if (value.mode        !== undefined) settings.popupMode    = value.mode;
		if (value.syncEnabled !== undefined) {
			settings.syncEnabled = value.syncEnabled;
			value.syncEnabled ? startAutoSync() : stopAutoSync();
		}
		saveStorage();
		sendResponse({ status: "success" });
	},

	/**
	 * [popup.js] 回傳目前彈窗狀態
	 */
	GET_POPUP_MODE(message, sendResponse) {
		sendResponse({ ...settings });
	},
	
	async EXTRACT_ALL_ROW_SNAPSHOT({ type, rows }, sendResponse) {
		const oldSet     = listStorage[type];
		const isFirstLoad = oldSet.has("0");
		const incoming   = new Map(rows.map(r => [r.id, r]));

		// ── 1. 清理已離開清單的舊資料 ────────────────────────
		if (!isFirstLoad) {					// ItemStore
			Object.keys(ItemStore).forEach(id => {
				const item = ItemStore[id];
				if (item.listType === type && !incoming.has(id)) {
					delete ItemStore[id];
				}
			});

			if (type === "collection") {	// InEStore
				for (const [a_id, bucket] of Object.entries(InEStore)) {
					for (const cEntry of (bucket.c_id ?? [])) {
						const isNowDep = !incoming.has(String(cEntry.id));
						
						if (isNowDep && !cEntry.dep) {
							cEntry.dep = true;
							bucket.c_chk = true; // 亮橘燈提醒
							InEDiffLog.entries.push({
								c_id:  String(cEntry.id),
								a_id:  a_id,
								adr:   bucket.adr,
								odr:   cEntry.odr ?? "",
								name:  cEntry.name ?? "",
								delta: -cEntry.current, // 紀錄負向變動
								time:  null 
							});
						} else if (!isNowDep) {
							cEntry.dep = false; 
						}
					}
				}
			}
		}

		// ── 2. Patch 備註 / 位置 / 現金 ──────────────────────
		const itemsToPrint = [];
		for (const [id, snap] of incoming) {
			if (!oldSet.has(id)) continue;
			const stored = ItemStore[id];
			if (!stored) continue;

			let changed = false;

			if (stored.loc !== snap.loc || stored.memo !== snap.memo) {
				stored.loc  = snap.loc;
				stored.memo = snap.memo;
				changed = true;
			}

			// imgUrl 每次快照無條件覆蓋（Signed URL 會過期）
			if (snap.imgUrl !== undefined) {
				stored.imgUrl = snap.imgUrl;
			}

			if (type === "collection" && snap.cash !== 0) {
				const newCat = `現金(${snap.cash})`;
				if (stored.cat !== newCat) {
					const oldCash = parseInt(stored.cat.match(/\((\d+)\)/)?.[1] ?? "0", 10);
					const delta   = snap.cash - oldCash;
					stored.cat = newCat;
					const found = findCidEntry(id);
					if (found) {
						found.bucket.c_chk = true;
						InEDiffLog.entries.push({
							c_id:  String(id),
							a_id:  Object.keys(InEStore).find(k => InEStore[k] === found.bucket) ?? "",
							adr:   found.bucket.adr,
							odr:   found.entry.odr ?? "",
							name:  found.entry.name ?? "",
							delta,
							time:  null,
						});
					}
					changed = true;
				}
			}

			if (changed) itemsToPrint.push(stored);
		}

		// ── 3. 更新 listStorage，回傳結果 ────────────────────
		const allIds = [...incoming.keys()];
		const newIds = isFirstLoad ? allIds : allIds.filter(id => !oldSet.has(id));
		sendResponse({ newIds, isFirstLoad });
		listStorage[type] = new Set(allIds);

		// ── 4. 列印（不阻塞 sendResponse）────────────────────
		if (settings.popupMode === 0) {
			for (const item of itemsToPrint) await callPrintServer(buildPkgPayload(item));
		}

		// ── 5. 存檔 ──────────────────────────────────────────
		settings.lastSync[type] = Date.now();

		saveStorage();
	},

	/**
	 * [sync.js] 接收網頁解析出的新項目，寫入 Store 並判斷是否自動列印
	 */
	async SUBMIT_NEW_ITEMS({ isFirstLoad, items }, sendResponse) {
		if (!items?.length) return;

		for (const item of items) {
			// 查詢此 item 對應的 a_id
			const a_id = Object.keys(RTStore).find(k => RTStore[k].adr === item.adr) ?? "";
			item.a_id = a_id;

			// 同一次掃描順便更新 RTStore 使用者名單
			const rtTarget = a_id ? RTStore[a_id] : null;
			const isBlacklisted = ["", "全戶O知"].includes(item.name);
			if (rtTarget && !isBlacklisted) {
				rtTarget.users ??= [];
				const existingUser = rtTarget.users.find(u => u.name === item.name);
				if (existingUser) {
					existingUser.pvt = item.pvt;
				} else {
					rtTarget.users.push({ name: item.name, note: "", pvt: item.pvt, isNew: true });
				}
			} else if (!rtTarget && !isBlacklisted) {
				console.warn(`找不到地址：${item.adr}`);
			}

			// 新的現金寄物單：建立或更新 InEStore[a_id] 的 c_id 陣列
			if (item.listType === "collection" && item.cat?.startsWith("現金")) {
				if (!InEStore[a_id]) {
					InEStore[a_id] = { adr: item.adr, c_chk: false, p_chk: false, c_id: [], p_id: [] };
				}
				const alreadyCid = InEStore[a_id].c_id.some(c => String(c.id) === String(item.id));
				if (!alreadyCid) {
					InEStore[a_id].c_chk = true;
					const initCash = parseInt(item.cat.match(/\((\d+)\)/)?.[1] ?? "0", 10);
					InEStore[a_id].c_id.push({
						id:      String(item.id),
						name:    item.name,
						odr:     item.odr,
						start:	 item.time,
						dep:     false,
						current: initCash,
						history: [],  // 由 SUBMIT_CASH_RECORDS 填入
					});
					// DiffLog：新增單號，time 直接帶收件時間
					InEDiffLog.entries.push({
						c_id:  String(item.id),
						a_id,
						adr:   item.adr,
						odr:   item.odr,
						name:  item.name,
						delta: initCash,
						time:  item.time ?? null,
					});
				}
			}

			// 新的包裹單：同 adr 有 InEStore 紀錄時，push p_id 
			if (item.listType === "unreceived" && item.cat?.includes("包裹")) {
				if (a_id && InEStore[a_id]) {
					InEStore[a_id].p_chk = true;
					const alreadyPid = InEStore[a_id].p_id.some(p => String(p.id) === String(item.id));
					if (!alreadyPid) {
						InEStore[a_id].p_id.push({
							id:      String(item.id),
							odr:     item.odr,
							name:	 item.name,
							barcode: item.barcode,
							time:    item.time,
						});
					}
				}
			}

			// 補上 a_id 後存入 ItemStore
			ItemStore[item.id] = item;
		}
		saveStorage();

		const shouldPrint = settings.popupMode === 0 && !isFirstLoad;
		if (!shouldPrint) { sendResponse?.({ status: "ignored" }); return; }

		try {
			await printItems(items);
			sendResponse?.({ status: "success" });
		} catch (err) {
			console.error("列印失敗:", err);
			sendResponse?.({ status: "error" });
		}
	},

	/**
	 * [popup.js] Mode 01 手選列印：向清單頁索取選中的 ID 並執行列印
	 */
	async GET_SELECTED_IDS(message, sendResponse) {
		try {
			const ids = await getIdsFromItemlist();
			if (!ids?.length) { sendResponse({ status: "empty", ids: [] }); return; }

			const itemsToPrint = ids.map(id => ItemStore[id]).filter(Boolean);
			if (!itemsToPrint.length) { sendResponse({ status: "not_found" }); return; }

			await printItems(itemsToPrint);
			sendResponse({ status: "success", ids });
		} catch (err) {
			console.error("手選列印失敗:", err);
			sendResponse({ status: "error" });
		}
	},

	/**
	 * [popup.js] 自定義列印：不經格式化邏輯，直接發送 Payload 到印表機
	 */
	async SEND_TO_PRINTER({ data }, sendResponse) {
		try {
			await callPrintServer(data);
			sendResponse({ status: "success" });
		} catch (err) {
			if (err.message === "PRINT_API_NOT_SET") {
				sendResponse({ status: "no_api" });
			} else {
				sendResponse({ status: "error", message: err.message });
			}
		}
	},

	/**
	 * [ilscript.js] 供應 ItemStore 資料給複合清單頁面
	 */
	GET_ITEM_STORE(message, sendResponse) {
		sendResponse({ ItemStore });
	},

	/**
	 * [inject-nav.js] 處理上方導覽點擊，開啟擴充功能內置頁面
	 */
	OPEN_MY_PAGE({ page }, sendResponse) {
		chrome.tabs.create({ url: chrome.runtime.getURL(page) });
	},

	/**
	 * [rtscript.js] 住戶標記初始化：獲取 RTStore
	 */
	CHECK_RTSTORE(message, sendResponse) {
		const hasRTStore = RTStore && Object.keys(RTStore).length > 0;
		sendResponse( hasRTStore );
	},

	/**
	 * [rtscript.js] 住戶標記初始化：獲取 RTStore
	 */
	GET_RTSTORE(message, sendResponse) {
		sendResponse({ data: RTStore });
	},

	/**
	 * [rtscript.js] 住戶標記回存：關閉頁面時將 tags 資料併入 RTStore 並持久化
	 */
	SET_RTSTORE({ data }, sendResponse) {
		try {
			RTStore = { ...RTStore, ...data };
			saveStorage();
			sendResponse?.({ status: "success" });
		} catch (err) {
			console.error("RTStore 儲存失敗:", err);
			sendResponse?.({ status: "error" });
		}
	},

	/**
	 * [sync.js] 接收現金修改歷史，去重後寫入 InEStore
	 * cashRecords: [{ c_id, editHistory: [{ col_money, edit_at, ... }] }]
	 */
	SUBMIT_CASH_RECORDS({ cashRecords }, sendResponse) {
		if (!cashRecords?.length) return;

		let hasNew = false;

		for (const { c_id, current, editHistory } of cashRecords) {
			if (!editHistory?.length) continue;

			// 在 InEStore 中找對應的 entry
			const found = findCidEntry(c_id);
			const entry = found?.entry;
			if (!entry) continue;

			// 更新當前金額
			entry.current = current ?? entry.current;

			// 直接覆蓋重建 history
			entry.history = editHistory.map(r => ({
				cash: r.col_money,
				time: r.edit_at,
			}));

			// 最後一筆若金額等於 current，代表純位置修改，移除
			const last = entry.history[entry.history.length - 1];
			if (last && last.cash === entry.current) entry.history.pop();

			// ── 回填 DiffLog time ───────────────────────────────
			// 找出同 c_id 且 time 尚未填入的 entries，按插入順序（舊→新）排列
			const pending = InEDiffLog.entries.filter(
				e => String(e.c_id) === String(c_id) && e.time === null
			);
			if (pending.length) {
				// editHistory 已按 edit_at 升冪排列，取最後 N 筆對應 pending
				const times = editHistory
					.map(r => r.edit_at)
					.slice(-pending.length);  // 取最新的 N 筆
				// pending 逆序 ↔ times 逆序（最新對應最新）
				for (let i = 0; i < pending.length; i++) {
					pending[pending.length - 1 - i].time = times[times.length - 1 - i] ?? null;
				}
			}

			hasNew = true;
		}

		if (hasNew) saveStorage();
		sendResponse?.({ status: "success" });
	},

	/**
	 * [inescript.js] 現金收付初始化：獲取 InEStore
	 */
	GET_INESTORE(message, sendResponse) {
		sendResponse({ data: InEStore, diffLog: InEDiffLog });
	},

	/**
	 * [inescript.js] 現金收付回存：關閉頁面時將資料併入 InEStore 並持久化
	 */
	SET_INESTORE({ data, diffLog }, sendResponse) {
		try {
			InEStore = data ?? InEStore;
			if (diffLog) InEDiffLog = diffLog;
			saveStorage();
			sendResponse?.({ status: "success" });
		} catch (err) {
			console.error("InEStore 儲存失敗:", err);
			sendResponse?.({ status: "error" });
		}
	},

    /**
     * [popup.js] 匯出：讀取 chrome.storage.local 所有持久化資料並回傳
     */
    async EXPORT_STORAGE(message, sendResponse) {
        const data = await chrome.storage.local.get(STORAGE_KEYS);
        sendResponse({ data });
    },

    /**
     * [popup.js] 載入：將匯入的資料寫回 chrome.storage.local 並重新恢復記憶體狀態
     * mode: "overwrite" → 完全覆蓋
     * mode: "merge"     → 各 Store 為空才併入
     */
    async IMPORT_STORAGE({ data, mode }, sendResponse) {
        try {
            let payload;
 
            if (mode === "overwrite") {
                payload = data;
            } else {
                const current = await chrome.storage.local.get(STORAGE_KEYS);
                const isEmpty = (val) => {
                    if (Array.isArray(val)) return val.length === 0;
                    return !val || Object.keys(val).length === 0;
                };
 
                payload = {
                    persistedSets: isEmpty(current.persistedSets) ? data.persistedSets : current.persistedSets,
                    popupMode:     current.popupMode ?? data.popupMode,
                    ItemStore:     isEmpty(current.ItemStore)    ? data.ItemStore    : current.ItemStore,
                    InEStore:      isEmpty(current.InEStore)     ? data.InEStore     : current.InEStore,
                    InEDiffLog:    isEmpty(current.InEDiffLog?.entries) ? data.InEDiffLog : current.InEDiffLog,
                    RTStore:       isEmpty(current.RTStore)      ? data.RTStore      : current.RTStore,
                };
            }
 
            await chrome.storage.local.set(payload);
            await loadStorage();
 
            sendResponse({ status: "success" });
        } catch (err) {
            console.error("IMPORT_STORAGE 失敗:", err);
            sendResponse({ status: "error" });
        }
    },

	/**
	 * [content.js / lightbox.js] 批次查詢條碼對應的圖片 URL
	 * barcodes: string[]
	 * 回傳 { urlMap: { [barcode]: imgUrl } }
	 */
	/**
	 * [lightbox.js] 批次查詢圖片 URL
	 * keys: [{ type: 'id' | 'barcode', val: string }]
	 * 回傳 { urlMap: { [ItemStore id]: imgUrl } }
	 */
	GET_IMG_URLS({ keys }, sendResponse) {
		const urlMap = {};
		for (const { type, val } of keys) {
			if (type === 'id') {
				if (ItemStore[val]?.imgUrl) urlMap[val] = ItemStore[val].imgUrl;
			} else {
				// barcode 查法（首頁 el-table）
				const item = Object.entries(ItemStore).find(
					([, i]) => String(i.barcode) === String(val)
				);
				if (item && item[1].imgUrl) urlMap[item[0]] = item[1].imgUrl;
			}
		}
		sendResponse({ urlMap });
	},

	/**
	 * [lightbox.js] 圖片過期時，開新 tab 到 postalList.aspx 重抓快照
	 * content.js 在新 tab 會自動跑 runSyncFlow，更新 ItemStore 的 imgUrl
	 * 完成後 background 通知原 tab 更新燈箱的 URL
	 */
	async REFRESH_IMG_URLS({ id }, sendResponse, sender) {
		const originTabId = sender.tab.id;
		sendResponse({ status: "started" });

		const tab = await chrome.tabs.create({ url: PACKAGE_URL, active: false });

		const onReady = (message, msgSender) => {
			if (message.action !== "CONTENT_READY" || msgSender.tab.id !== tab.id) return;
			chrome.runtime.onMessage.removeListener(onReady);

			setTimeout(async () => {
				await chrome.tabs.remove(tab.id).catch(() => {});

				const newUrl = ItemStore[id]?.imgUrl ?? "";
				chrome.tabs.sendMessage(originTabId, {
					action: "IMG_URL_REFRESHED",
					id,
					newUrl,
				}).catch(() => {});
			}, 3000);
		};
		chrome.runtime.onMessage.addListener(onReady);
	},

	GET_PRINT_API(message, sendResponse) {
		sendResponse({ printApi });
	},

	SET_PRINT_API({ url }, sendResponse) {
		printApi = url ?? "";
		saveStorage();
		sendResponse({ status: "success" });
	},
};

// 統一訊息入口：查表派發，async handler 包一層 IIFE 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = MESSAGE_HANDLERS[message.action];
	
    if (!handler) return false;

    if (handler.constructor.name === 'AsyncFunction') {
        (async () => {								 // 非同步
            try {
                await handler(message, sendResponse, sender);
            } catch (err) {
                console.error(`執行 ${message.action} 失敗:`, err);
                sendResponse({ status: "error", error: err.message });
            }
        })();
        return true; 
    } else {
        handler(message, sendResponse, sender); 	// 同步：直接執行，回傳 false
        return false;
    }
});


// ─── 快捷鍵監聽 ──────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
    const cmd = COMMANDS[command];
    if (!cmd) return;

    const { url = PACKAGE_URL, group = "none", index, slot } = cmd;

    chrome.tabs.create({ url, active: true }, (tab) => {
        const onReady = (message, sender) => {
            if (message.action !== "CONTENT_READY" || sender.tab.id !== tab.id) return;
            const checkIndex = index ? index : slot;

            chrome.tabs.sendMessage(tab.id, { 
                action: "START_AUTOMATION", 
                group, 
                index:checkIndex, 
            });
            
            setTimeout(() => chrome.runtime.onMessage.removeListener(onReady), 6000);
        };
        chrome.runtime.onMessage.addListener(onReady);
    });
});

// ─── 列印相關 ────────────────────────────────────────────
/**
 * 依序送印單筆或多筆項目，加開其他列印任務。
 * A. 先印主標籤
 * B. 處理長備註 (dtype: "memo")
 * C. 處理重複標籤 (例如 x5)
 */
async function printItems(items) {
	items.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));

	for (const item of items) {
		// A. 先印主標籤
		await callPrintServer(buildPkgPayload(item));

		// B. 處理長備註
        if (item.memo?.length > 6) {
            await callPrintServer([{ dtype: "memo", val: item.memo }]);
        }

		// C. 小標籤
        if (repeatMatch) {
            const count = parseInt(repeatMatch[1], 10);
            if (count > 0 && count <= 20) {
                for (let i = 1; i < count; i++) {
                    await callPrintServer([
                        { dtype: "date",    val: `小標籤-${i}` },
                        { dtype: "order",   val: item.odr },
                        { dtype: "barcode", val: item.barcode },
                    ]);
                }
            }
		}
	}
}

/**
 * 將 ItemStore 的原始欄位轉換成列印伺服器所需的 payload。
 *
 * 輸出欄位順序：
 *   specialTag → pkgInfo → order → barcode → address → name → memo → regDate
 *
 * specialTag 組合規則（兩者皆有時以空格連接）：
 *   isPersonal = true         → "限本人"
 *   temp = 0                  → "冷藏"
 *   temp = 1                  → "冷凍"
 *   常溫（temp=""）且非限本人  → 不傳送此欄位
 *
 * @returns {{ main: object[]}}
 */
function buildPkgPayload(item) {
	const main = [];

	// specialTag：限本人 / 溫層
	const tags = [];
	if (item.pvt)  		  tags.push("限本人");
	if (item.temp !== "") tags.push(TEMP_LABEL[item.temp]);
	if (tags.length)      main.push({ dtype: "text", val: tags.join(" ") });

	main.push({ dtype: "text",    val: `${item.cat} ${item.loc}` });
	main.push({ dtype: "order",   val: item.odr });
	main.push({ dtype: "barcode", val: item.barcode });
	main.push({ dtype: "text",    val: item.adr });
	main.push({ dtype: "text",    val: item.name });

	if (item.memo && item.memo.length <= 6) {
		main.push({ dtype: "text", val: item.memo });
	}

	main.push({ dtype: "date", val: item.time });
	return main;
}

// 送出列印請求至本機 Flask 伺服器
async function callPrintServer(payload) {
	if (!printApi) throw new Error("PRINT_API_NOT_SET");
	const res = await fetch(printApi, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ items: payload }),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

// ─── 自動監測 ────────────────────────────────────────────
function startAutoSync() {
    chrome.alarms.create("autoSync", { periodInMinutes: 5 });
    runSyncQueue();
}

function stopAutoSync() {
    chrome.alarms.clear("autoSync");
    syncRunning = false;
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "autoSync" && settings.syncEnabled) runSyncQueue();
});

async function runSyncQueue() {
    if (syncRunning || !settings.syncEnabled) return;
    syncRunning = true;

    for (const { type, url } of SYNC_TARGETS) {
        if (!settings.syncEnabled) break;
        await syncOnePage(type, url);
    }

    syncRunning = false;
}

function syncOnePage(type, url) {
    return new Promise((resolve) => {
        chrome.tabs.create({ url, active: false }, (tab) => {
            let syncDone = false;

            const onMessage = (message, sender) => {
                if (sender.tab?.id !== tab.id) return;

                if (message.action === "CONTENT_READY") {
                    clearTimeout(fallback);
                }

                // 收到這個代表 content script 的同步流程跑完了
                if (message.action === "EXTRACT_ROW_SNAPSHOT" && message.type === type) {
                    syncDone = true;
                    clearTimeout(syncFallback);
                    setTimeout(async () => {
                        chrome.runtime.onMessage.removeListener(onMessage);
                        settings.lastSync[type] = Date.now();
                        saveStorage();
                        await chrome.tabs.remove(tab.id).catch(() => {});
                        resolve();
                    }, 500); // 給 SUBMIT_NEW_ITEMS 一點時間跑完
                }
            };
            chrome.runtime.onMessage.addListener(onMessage);

            // 兜底：12秒沒收到任何東西就放棄
            const fallback = setTimeout(async () => {
                chrome.runtime.onMessage.removeListener(onMessage);
                await chrome.tabs.remove(tab.id).catch(() => {});
                resolve();
            }, 12000);

            // 收到 CONTENT_READY 後 6 秒還沒同步完也放棄
            let syncFallback;
            const onReady = (message, sender) => {
                if (message.action !== "CONTENT_READY" || sender.tab?.id !== tab.id) return;
                syncFallback = setTimeout(async () => {
                    if (syncDone) return;
                    chrome.runtime.onMessage.removeListener(onMessage);
                    await chrome.tabs.remove(tab.id).catch(() => {});
                    resolve();
                }, 6000);
            };
            chrome.runtime.onMessage.addListener(onReady);
        });
    });
}

// ─── 工具函數 ────────────────────────────────────────────
/**
 * 將時間字串轉為 timestamp（int）
 * 支援格式："2026/05/02 18:41" 或 "2026/05/02 18:41:30"
 */
function toTs(timeStr) {
	return new Date(timeStr.replace(/\//g, "-")).getTime();
}

// 單純的 tabs.sendMessage + callback
async function getIdsFromItemlist() {
    const [tab] = await chrome.tabs.query({ url: chrome.runtime.getURL("pages/itemlist/ItemList.html") });
    if (!tab) throw new Error("ItemList 頁面未開啟");

    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { action: "GET_SELECTED_IDS", target: "itemlist-internal" }, (res) => {
            if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
            resolve(res?.ids ?? []);
        });
    });
}