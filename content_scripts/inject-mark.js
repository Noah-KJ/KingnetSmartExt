/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Inject Mark                ║
 * ║  住戶標記：從 RTStore 讀取標記並套用至頁面元素       ║
 * ╚══════════════════════════════════════════════════════╝
 * * 頁面對應：
 *  postalList          → 包裹表格 tbody (cells[3]) + #oneClickWrapDiv_title
 *  postalReturnList    → 退貨表格 tbody (cells[3]) + #oneClickWrapDiv_title
 *  collectionRecord    → 寄物表格 tbody (cells[2], cells[3]) + #oneClickWrapDiv_title
 *  reservation_v2      → #passVerifyTablet + #oneClickWrapDiv_title
 *  其他頁面            → 拿完 RTStore 後直接結束
 *
 * * 標記規則：
 *  1. 地址符合有 tag          → td 套青色
 *  2. 地址+姓名都符合有 note  → td 套橘色
 *  3. 同時有 tag 與 note      → note（橘色）優先
 *  4. 套色對象永遠是整個 td
 *  tooltip：掛在 td 內的文字元素上（地址 div 或 inline el），hover 文字才顯示
 */

// --- 共用變數 ---
let RTStore = {};

/**
 *  export 導出初始化函數
 */
export async function initMark() {
	// ─── 1. 向 Background 拿資料 ─────────────────────────────
    const response = await chrome.runtime.sendMessage({ action: "GET_RTSTORE" });
    RTStore = response?.data || {};

    if (!RTStore || !Object.keys(RTStore).length) return;

	// ─── 2. 注入 CSS ─────────────────────────────────────────
	const style = document.createElement('style');
	style.textContent = `
		/* td 套色 */
		.rrmark-tag  { color: #008B8B !important; font-weight: bold !important; }
		.rrmark-note { color: #D26A3B !important; font-weight: bold !important; }

		/* tooltip 掛在文字元素上 */
		.rrmark-tip {
			position: relative;
			cursor: default;
		}
		.rrmark-tip::before {
			content: attr(data-rrmark-tip);
			display: none;
			position: absolute;
			bottom: calc(100% + 4px);
			left: 50%;
			transform: translateX(-50%);
			white-space: nowrap;
			background: #111;
			padding: 3px 8px;
			border-radius: 4px;
			font-size: 26px;
			font-weight: bold;
			pointer-events: none;
			z-index: 9999;
		}
		.rrmark-tag  .rrmark-tip::before { color: #39ff14; }
		.rrmark-note .rrmark-tip::before { color: #FF7A00; }

		.rrmark-tag.rrmark-tip::before  { color: #39ff14; }
		.rrmark-note.rrmark-tip::before { color: #FF7A00; }
		.rrmark-tip:hover::before { display: block; }
	`;
	document.head.appendChild(style);

	// ─── 3. 渲染邏輯 ─────────────────────────────────────────
    _runMainLogic();
}


// ─── 內部私有函數 ─────────────────────────────────────────
/**
 * 核心邏輯
 */
function _runMainLogic() {
    const url = location.href;

    // 所有頁面共用：快速領取彈窗
    _watchRepeat(document.getElementById('oneClickWrapDiv_title'), _scanOneClick);

    // 根據網址啟動特定的監控
    if (url.includes('postalList.aspx')) {
        _watchTable('unreceived');
    } 
    else if (url.includes('postalReturnList.aspx')) {
        _watchTable('returns');
    } 
    else if (url.includes('collectionRecord_v2.aspx')) {
        _watchTable('collection');
    } 
    else if (url.includes('reservation_v2.aspx')) {
        _watchRepeat(document.getElementById('passVerifyTablet'), _scanPassVerify);
    }
}

// 核心查詢
/**
 * @param {string}   address
 * @param {string[]} names    - td 內所有姓名
 * @returns {{ tip: string, type: 'note'|'tag' } | null}
 */
function _lookupMark(address, names) {
	const record = Object.values(RTStore).find(r => r.adr === address);
	if (!record) return null;

	// note 優先：地址命中 + 姓名也命中且有 note
	for (const name of names) {
		const user = record.users?.find(u => u.name === name && u.note?.trim());
		if (user) return { tip: user.note.trim(), type: 'note' };
	}

	// tag：只看地址
	if (record.tag?.trim()) return { tip: record.tag.trim(), type: 'tag' };

	return null;
}

// 套用標記
/**
 * @param {Element}  td       - 整格套色
 * @param {Element}  tipEl    - tooltip 掛載的文字元素（地址 div 或 inline el）
 * @param {string}   address
 * @param {string[]} names
 */
function _applyMark(td, tipEl, address, names) {
	if (!td || td.dataset.rrmarkDone) return;

	const mark = _lookupMark(address, names);
	if (!mark) return;

	td.dataset.rrmarkDone = '1';
	td.classList.add(mark.type === 'note' ? 'rrmark-note' : 'rrmark-tag');

	// tooltip 掛在文字元素上
	tipEl.dataset.rrmarkTip = mark.tip;
	tipEl.classList.add('rrmark-tip');
}


// 掃描函式
function _scanTable(listType) {
	const { tableId } = LIST_CONFIG[listType];
	const table = document.getElementById(tableId);
	if (!table) return;

	table.querySelectorAll('tr[id]').forEach(tr => {
		if (listType === 'collection') {
			// DOM 樣本：<td value="...">地址<br>【姓名】</td>
			[2, 3].forEach(idx => {
				const td = tr.cells[idx];
				if (!td) return;
				const raw = td.textContent.trim();
				const address = raw.split('【')[0].trim();
				const nameMatch = raw.match(/【(.+?)】/);
				const names = nameMatch ? [nameMatch[1].trim()] : [];
				// collection 無子元素，tooltip 掛在 td 本身
				if (address) _applyMark(td, td, address, names);
			});
		} else {
			// DOM 樣本：<td><div>地址</div><div><span class="name">姓名</span>...</div></td>
			const td = tr.cells[3];
			if (!td) return;
			const addrDiv = td.querySelector('div');
			const address = addrDiv?.textContent.trim();
			const names = Array.from(td.querySelectorAll('span.name'))
				.map(s => s.textContent.trim())
				.filter(Boolean);
			// tooltip 掛在地址 div 上
			if (address && addrDiv) _applyMark(td, addrDiv, address, names);
		}
	});
}

function _scanOneClick() {
	const el = document.getElementById('oneClickWrapDiv_title');
	if (!el) return;
	const address = el.dataset.rrmarkAddress ?? el.textContent.trim();
	_applyMark(el, el, address, []);
}

function _scanPassVerify() {
	const span = document.querySelector('#passVerifyTablet span');
	if (!span) return;
	const address = span.dataset.rrmarkAddress ?? span.textContent.trim();
	_applyMark(span, span, address, []);
}

// Observer 工廠
function _watchTable(listType) {
	const { tableId } = LIST_CONFIG[listType];
	const tbody = document.getElementById(tableId);
	if (!tbody) return;
	const table = tbody.closest('table');

	function tryInit() {
		if (tbody.querySelectorAll('tr[id]').length) {
			_scanTable(listType);
			return true;
		}
		return false;
	}

	if (!tryInit()) {
		const obs = new MutationObserver((_, o) => {
			if (!tryInit()) return;
			o.disconnect();
		});
		obs.observe(tbody, { childList: true, subtree: true });
	}

	table.addEventListener('click', e => {
		if (e.target.closest('th')) {
			setTimeout(() => _scanTable(listType), 0);
		}
	});
}

function _watchRepeat(el, scanFn) {
	if (!el) return;
	if (el.textContent.trim()) scanFn();

	new MutationObserver(() => {
		[el, ...el.querySelectorAll('[data-rrmark-done]')].forEach(node => {
			node.removeAttribute('data-rrmark-done');
			node.classList.remove('rrmark-tag', 'rrmark-note');
		});
		el.querySelectorAll('.rrmark-tip').forEach(node => {
			node.removeAttribute('data-rrmark-tip');
			node.classList.remove('rrmark-tip');
		});
		// 清 el 本身的 tip（inline 模式）
		el.removeAttribute('data-rrmark-tip');
		el.classList.remove('rrmark-tip');
		scanFn();
	}).observe(el, { childList: true, subtree: true, characterData: true });
}