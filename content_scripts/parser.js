/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Parser                     ║
 * ║  資料解析：包裹 / 退貨 / 寄物清單                    ║
 * ╚══════════════════════════════════════════════════════╝
 * 純函式模組，無任何 chrome API 呼叫與副作用。
 */

// ─── 進入點 ──────────────────────────────────────────────

/**
 * 僅解析指定 id 的列，回傳 ItemSchema 物件陣列。
 * @param {string}   listType - 清單類型 (unreceived/returns/collection)
 * @param {string[]} ids      - 要解析的 TR id 陣列
 */
export function parseRowsById(listType, ids) {
	return _parseRows(listType, new Set(ids));
}

/**
 * 輕量掃描：僅收集每列的 id 與 memo/location，供 QUERY_ALL_IDS_AND_MEMO 使用。
 * @param {string} listType - 清單類型 (unreceived/returns/collection)
 * @returns {{ id: string, location: string, memo: string, cash: number }[]}
 */
export function collectIdSnapshot(listType) {
	const cfg = LIST_CONFIG[listType];
	const table = document.getElementById(cfg?.tableId);
	if (!table) return [];

	const isCollection = listType === "collection";
	const results = [];

	for (const tr of table.rows) {
		if (!tr.id) continue;

		const snapshot = {
			id: tr.id,
			memo: "",
			loc: "",
			cash: 0,
			imgUrl: "",
		};

		// 只有未領清單才抓圖片 URL
		if (listType === "unreceived") {
			const imgAnchor = tr.cells[2]?.querySelector('.iconArea a[data-lightbox]');
			snapshot.imgUrl = imgAnchor?.getAttribute('href') ?? "";
		}

		// 處理備註與位置；collection 的 memoCell 同為 cells[5]，不重複處理
		if (cfg.memoCell !== null && !isCollection) {
			const memoCell = tr.cells[cfg.memoCell];
			const parsed = parseMemoCell(memoCell);
			snapshot.memo = parsed.memo;
			snapshot.loc = parsed.location;
		}

		// 處理寄物清單特有的現金金額與備註
		if (isCollection) {
			const categoryCell = tr.cells[1]?.textContent.trim() ?? "";
			if (categoryCell.startsWith("現金")) {
				// 提取括號內的數字，例如 "現金(500)" -> 500
				snapshot.cash = parseInt(categoryCell.match(/\((\d+)\)/)?.[1] || "0", 10);
			}
			const colParsed = parseMemoCell(tr.cells[5]);
			snapshot.memo = colParsed.memo;
			snapshot.loc  = colParsed.location;
		}
		results.push(snapshot);
	}
	return results;
}

// ─── 內部共用迭代器 ───────────────────────────────────────

function _parseRows(listType, idSet) {
	const tableId = LIST_CONFIG[listType]?.tableId;
	const table = document.getElementById(tableId);
	if (!table) return [];

	const isCollection = listType === "collection";
	const results = [];

	for (const tr of table.rows) {
		if (!tr.id) continue;
		if (idSet && !idSet.has(tr.id)) continue;

		const item = isCollection ? parseCollectionRow(tr) : parsePackageRow(tr, listType);
		if (item) results.push({ ...item });
	}
	return results;
}

// ─── 解析工具 ─────────────────────────────────────────────

/**
 * 從 memo span 取值；優先使用 tooltip title，
 * 否則去除前綴標籤後回傳 textContent。
 */
function getMemoValue(span) {
	if (!span) return "";
	return span.getAttribute("data-original-title")?.trim()
		|| span.textContent.replace(/^(【位置】|【備註】|位置:|備註:)/, "").trim();
}

/**
 * 解析 memo 欄位，回傳 { location, memo }。
 */
function parseMemoCell(cell) {
	const spans = cell.querySelectorAll("span.memo");
	if (!spans.length) return { location: "", memo: "" };

	if (spans.length === 1) {
		const key = spans[0].textContent.includes("位置") ? "location" : "memo";
		return { location: "", memo: "", [key]: getMemoValue(spans[0]) };
	}

	return { location: getMemoValue(spans[0]), memo: getMemoValue(spans[1]) };
}

/**
 * 從指定 cell 解析溫層。
 * class: label-tag2 → 冷凍(1), label-tag → 冷藏(0), 其餘 → 常溫("")
 */
function getTemp(cell) {
	if (!cell) return "";
	const spans = cell.querySelectorAll("span"); // 抓取 cell 內所有的 span

	for (const span of spans) {
		const text = span.textContent.trim();
		const cls = span.className;

		// 同時檢查 class 與 文字內容
		if (cls.includes("label-tag2") && text === "冷凍") return 1;
		if (cls.includes("label-tag") && text === "冷藏") return 0;
	}

	return "";
}

// ─── 核心解析邏輯 ─────────────────────────────────────────

/**
 * 解析：包裹清單 & 退貨清單
 * cells[0]=checkbox, cells[1]=序號, cells[2]=類型/溫層,
 * cells[3]=地址/姓名, cells[4]=通知, cells[5]=登記日期,
 * cells[6]=管理員(包), 條碼(退), cells[7]=條碼(包), memo(退), cells[8]=memo (returns=cells[7])
 */
function parsePackageRow(tr, listType) {
	const c = tr.cells;
	const isReturns = listType === "returns";
	const { location, memo } = parseMemoCell(c[isReturns ? 7 : 8]);

	return {
		id:         tr.id,
		// 退貨清單的地址ID 在 cells[3] 的 tablet 屬性
		a_id:		isReturns ? c[3].getAttribute("tablet")?.trim() : "", 
		odr:      	c[1].textContent.trim(),									// 序號
		barcode:	tr.getAttribute("name") || tr.id,		
		cat:   		c[2].querySelector(".typeArea")?.textContent.trim() ?? "",	// 類型
		loc:        location,
		temp:       getTemp(c[2]),
		adr:    	c[3].firstElementChild?.textContent.trim() ?? "",
		name:       c[3].querySelector(".name")?.textContent.trim() ?? "",
		pvt: 		!c[3].querySelector(".label-tag4.d-none") ? true : false,
		memo,
		time:    	c[5].textContent.trim(),
		listType,
		rcvr: 		!isReturns,
	};
}

/**
 * 解析：寄物清單
 * 範例 DOM: <td value="ID">(地址)<br>【姓名】</td>
 */
function parseCollectionRow(tr) {
	const c = tr.cells;

	const receiverVal = c[2].getAttribute("value")?.trim();
	const isReceiver  = Boolean(receiverVal);
	const targetCell  = isReceiver ? c[2] : c[3];
	const address   = targetCell.childNodes[0]?.nodeValue?.trim().split("【")[0] ?? "";
	const nameMatch = targetCell.textContent.match(/【(.*?)】/);
	const rawName   = nameMatch?.[1] ?? "";

	const { location, memo } = parseMemoCell(c[5]);

	return {
		id:       tr.id,
		a_id:	  receiverVal || c[3].getAttribute("value")?.trim() || "", // 收件人 ID 優先
		odr:      tr.querySelector(".serialNum")?.textContent.trim() ?? "",
		barcode:  tr.id,
		cat:   	  c[1].firstChild?.nodeValue?.trim() ?? "",
		loc:      location,
		temp:     getTemp(c[1]),
		adr:      address,
		name:     rawName,
		pvt:      false,	// 寄物清單不顯示限本人資訊
		memo,
		time:     c[4].textContent.trim(),
		listType: "collection",
		rcvr: 	  isReceiver,
	};
}