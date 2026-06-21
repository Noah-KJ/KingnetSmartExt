/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Automation                 ║
 * ║  快捷鍵功能：包裹領取 / 設施預約 / DOM 等待工具      ║
 * ╚══════════════════════════════════════════════════════╝
 */

// ─── 任務處理 ────────────────────────────────────────────
export async function handlePackageTask(index) {
	const fab = await waitFor("id", "oneClickLabel");
	fab?.click();
	const masterDiv = await waitFor("id", "masterVerifyTypeDiv");
	delayedClick(masterDiv, [1, 0, index]);
}

export async function handleFacilityTask(slot) {
	if (slot === 99) {
		const leaveBtn = await waitFor("id", "adLeaveListBtn", 0, 8000);
		return leaveBtn?.click();
	}
	const infoBtn = await waitFor("class", ".btn.btn-info.btn-md", slot);
	if (!infoBtn) return;
	setTimeout(() => infoBtn.click(), 1000);

	const verifyTypeDiv = await waitFor("id", "verifyTypeDiv");
	if (verifyTypeDiv) delayedClick(verifyTypeDiv, [1, 0, 1]);
}

// ─── 公設進場按鈕掃描 ─────────────────────────────────────
/**
 * 掃描 #facilitiesRows 的進場按鈕（btn-info），最多取前 20 顆
 */
function scanFacilityButtons() {
	const count = document.querySelectorAll('#facilitiesRows .btn.btn-info.btn-md').length;
	chrome.runtime.sendMessage({ action: "SET_BTN_LIMIT", count: Math.min(count, 20) });
}

// reservation_v2.aspx 載入時自動掃描
if (location.href.includes("reservation_v2.aspx")) {
	waitFor("id", "facilitiesRows").then(scanFacilityButtons);
}

// ─── 進場彈窗自動化 ──────────────────────────────────────

/** 取開始／結束時間按鈕 */
function getTimeButtons() {
	return {
		startBtn: document.querySelector('#passVerifyDateTime .startTime'),
		endBtn:   document.querySelector('#passVerifyDateTime .endTime'),
	};
}

/**
 * 監聽 #passVerifyDiv display 變成 block，每次觸發自動化流程一次
 */
(function watchPassVerifyDiv() {
	const div = document.getElementById('passVerifyDiv');
	if (!div) return;

	new MutationObserver(() => {
		if (div.style.display === 'block') runPassVerifyAuto();
	}).observe(div, { attributes: true, attributeFilter: ['style'] });
})();

/**
 * 自動化主流程：
 *  A. 有預約選項 → 直接選取，結束
 *  B. 無預約選項 → 自動填入開始/結束時間 + 人數
 */
async function runPassVerifyAuto() {
	await sleep(300);

	// ── A. 嘗試選預約 ─────────────────────────────────────
	const resSel = document.querySelector('#passVerifyResDiv select');
	if (resSel) {
		const firstReal = Array.from(resSel.options).find(o => o.value !== '請選擇');
		if (firstReal) {
			resSel.value = firstReal.value;
			resSel.dispatchEvent(new Event('change', { bubbles: true }));
			return;
		}
	}

	// ── B. 沒有預約選項，手動選時間 ───────────────────────
	const { startBtn, endBtn } = getTimeButtons();

	if (!startBtn) return;
	startBtn.click();
	await sleep(300);

	const startSpan = pickNearestFutureTime('#passVerifyDateTimeStart .timeScroll .clock');
	if (!startSpan) return;
	startSpan.click();
	await sleep(300);

	if (!endBtn) return;
	endBtn.click();
	await sleep(300);

	const spans = document.querySelectorAll('#passVerifyDateTimeDue .timeScroll .clock');
	if (!spans.length) return;

	spans[0].click();
	await sleep(200);

	// 人數選 1
	const personSel = document.getElementById('passVerifyPerson');
	if (personSel) {
		personSel.value = '1';
		personSel.dispatchEvent(new Event('change', { bubbles: true }));
	}
}

/**
 * 尋找最近的未來時間 span；找不到就選最後一個
 * @param {string} selector
 */
function pickNearestFutureTime(selector) {
	const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
	const spans  = Array.from(document.querySelectorAll(selector));
	if (!spans.length) return null;

	return spans.find(span => {
		const [h, m] = span.innerText.trim().split(':').map(Number);
		return h * 60 + m > nowMin;
	}) ?? spans[spans.length - 1];
}