/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Lightbox                   ║
 * ║  獨立注入，無外部依賴                                ║
 * ╚══════════════════════════════════════════════════════╝
 */

(function () {
	if (document.getElementById('slh-lightbox')) return; // 防止重複注入

	// ─── 建立 DOM ────────────────────────────────────────

	const overlay = document.createElement('div');
	overlay.id = 'slh-lightbox-overlay';

	const box = document.createElement('div');
	box.id = 'slh-lightbox';
	box.innerHTML = `
		<img id="slh-lightbox-img" src="" alt="">
		<div id="slh-lightbox-refresh" style="display:none;">
			<p>圖片連結更新中，請稍候…</p>
		</div>
		<a id="slh-lightbox-close">&#10005;</a>
	`;

	document.body.append(overlay, box);

	// ─── 樣式注入 ────────────────────────────────────────

	const style = document.createElement('style');
	style.textContent = `
		#slh-lightbox-overlay {
			display: none;
			position: fixed;
			inset: 0;
			background: rgba(0,0,0,.85);
			z-index: 2147483646;
		}
		#slh-lightbox {
			display: none;
			position: fixed;
			inset: 0;
			z-index: 2147483647;
			align-items: center;
			justify-content: center;
			flex-direction: column;
		}
		#slh-lightbox.active,
		#slh-lightbox-overlay.active {
			display: flex;
		}
		#slh-lightbox-img {
			max-width: 90vw;
			max-height: 90vh;
			object-fit: contain;
			border-radius: 4px;
			box-shadow: 0 8px 32px rgba(0,0,0,.6);
		}
		#slh-lightbox-refresh {
			color: #fff;
			font-size: 18px;
			text-align: center;
		}
		#slh-lightbox-close {
			position: fixed;
			top: 16px;
			right: 20px;
			color: #fff;
			font-size: 28px;
			cursor: pointer;
			line-height: 1;
			user-select: none;
			opacity: .8;
		}
		#slh-lightbox-close:hover { opacity: 1; }
	`;
	document.head.appendChild(style);

	// ─── 狀態 ────────────────────────────────────────────

	const img     = document.getElementById('slh-lightbox-img');
	const refresh = document.getElementById('slh-lightbox-refresh');
	let currentId = '';

	// ─── 燈箱開關 ────────────────────────────────────────

	function open(src, id) {
		currentId             = id ?? '';
		img.src               = src;
		img.style.display     = 'block';
		refresh.style.display = 'none';
		overlay.classList.add('active');
		box.classList.add('active');
	}

	function close() {
		overlay.classList.remove('active');
		box.classList.remove('active');
		img.src   = '';
		currentId = '';
	}

	box.addEventListener('click', (e) => {
		if (e.target === box) close();
	});
	document.getElementById('slh-lightbox-close').addEventListener('click', close);

	// 委派：攔截所有我們注入的圖示點擊
	document.addEventListener('click', e => {
		const anchor = e.target.closest('a[data-slh-id]');
		if (!anchor) return;
		e.preventDefault();
		open(anchor.getAttribute('href'), anchor.getAttribute('data-slh-id') ?? '');
	});

	// ─── 圖片過期刷新 ────────────────────────────────────

	img.addEventListener('error', () => {
		if (!currentId) return;
		img.style.display     = 'none';
		refresh.style.display = 'block';
		chrome.runtime.sendMessage({ action: 'REFRESH_IMG_URLS', id: currentId });
	});

	chrome.runtime.onMessage.addListener((message) => {
		if (message.action !== 'IMG_URL_REFRESHED' || message.id !== currentId) return;

		if (message.newUrl) {
			document.querySelector(`a[data-slh-id="${currentId}"]`)
				?.setAttribute('href', message.newUrl);
			img.src               = message.newUrl;
			img.style.display     = 'block';
			refresh.style.display = 'none';
		} else {
			refresh.querySelector('p').textContent = '圖片已無法取得，請返回包裹清單頁面重新整理。';
		}
	});

	// ─── 圖示注入 ────────────────────────────────────────

	/**
	 * 從列取得查詢 key：
	 * - 非首頁：{ type: 'id',      val: trid }
	 * - 首頁  ：{ type: 'barcode', val: tooltip 完整條碼 }
	 */
	function getRowKey(tr, isElTable) {
		if (!isElTable) {
			const val = tr.getAttribute('trid') ?? '';
			return val ? { type: 'id', val } : null;
		}
		const val = tr.cells[5]?.querySelector('[role="tooltip"]')?.textContent.trim() ?? '';
		return val ? { type: 'barcode', val } : null;
	}

	/** 批次查詢 imgUrl 並插入圖示到 cells[3] */
	async function injectImgIcons(rows) {
		if (!rows.length) return;

		const isElTable = rows[0].closest('.el-table__body') !== null;
		const keys      = rows.map(tr => getRowKey(tr, isElTable)).filter(Boolean);
		if (!keys.length) return;

		const { urlMap } = await chrome.runtime.sendMessage({ action: 'GET_IMG_URLS', keys });
		if (!urlMap || !Object.keys(urlMap).length) return;

		for (const tr of rows) {
			const key = getRowKey(tr, isElTable);
			if (!key) continue;

			const entry = Object.entries(urlMap).find(([id]) =>
				key.type === 'id' ? id === key.val : true
			);
			if (!entry) continue;
			const [id, imgUrl] = entry;

			const cell = tr.cells[3];
			if (!cell || cell.querySelector('.slh-icon-area')) continue;

			const iconDiv = document.createElement('div');
			iconDiv.className = 'iconArea slh-icon-area';
			iconDiv.innerHTML = `<a href="${imgUrl}" data-slh-id="${id}"><i class="icon-images"></i></a>`;

			const target = isElTable ? cell.querySelector('.cell') : cell;
			target?.insertBefore(iconDiv, target.firstChild);
		}
	}

	/**
	 * 等待 tbody 有資料後才注入，防止官方渲染覆蓋。
	 * @param {string}   tbodySelector - tbody 的 CSS selector
	 * @param {Function} getRows       - 回傳列陣列的函式
	 */
	function waitForRowsThenInject(tbodySelector, getRows) {
		const tbody = document.querySelector(tbodySelector);
		if (!tbody) return;

		// 若已有資料，直接注入
		if (tbody.rows.length > 0) {
			injectImgIcons(getRows());
			return;
		}

		// 否則等第一批資料進來
		const obs = new MutationObserver((_, o) => {
			if (tbody.rows.length > 0) {
				o.disconnect();
				injectImgIcons(getRows());
			}
		});
		obs.observe(tbody, { childList: true });
	}

	// ─── 領取彈窗監聽 ────────────────────────────────────

	/**
	 * 非首頁：#oneClickWrapDiv 一直存在於 DOM，
	 * 監聽 class 出現 active 時觸發。
	 */
	function watchOneClick() {
		const interval = setInterval(() => {
			const el = document.getElementById('oneClickWrapDiv');
			if (!el) return;
			clearInterval(interval);

			new MutationObserver(() => {
				if (!el.classList.contains('active')) return;
				waitForRowsThenInject(
					'#oneClickPostalList',
					() => Array.from(document.querySelectorAll('#oneClickPostalList tr'))
				);
			}).observe(el, { attributes: true, attributeFilter: ['class'] });
		}, 500);
	}

	/**
	 * 首頁：#receiveDialog 在領取者驗證後才動態插入 DOM，
	 * 用 body Observer 等待它出現，再監聽 style 變化。
	 */
	function watchReceiveDialog() {
		const el = document.getElementById('receiveDialog');
		if (!el) return;

		new MutationObserver(() => {
			// 有 z-index 代表彈窗被開啟（官方用移除 display:none 而非加 display:block）
			if (el.style.zIndex) {
				setTimeout(() => {
					const rows = Array.from(document.querySelectorAll(
						'#receiveDialog .el-table__body tbody tr.el-table__row'
					));
					injectImgIcons(rows);
				}, 1000);
			}
		}).observe(el, { attributes: true, attributeFilter: ['style'] });
	}

	watchOneClick();
	watchReceiveDialog();

	// ─── 對外 API ────────────────────────────────────────

	window.slhLightbox = { open, close };
})();