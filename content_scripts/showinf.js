/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  ShowInf                    ║
 * ║  UI 增強：圖片預覽自動對比並顯示包裹資訊             ║
 * ╚══════════════════════════════════════════════════════╝
 * * 監測 Lightbox 狀態與圖片切換，自動從表格提取資訊。
 * * 支援動態索引：#body_unreceived (Index 3,5) / #body_history (Index 2,4)
 */

(function() {
	const target = document.getElementById('lightbox');
	if (!target) return;

	// ─── 核心處理 ────────────────────────────────────────────
	function syncLightboxInfo() {
		const img = target.querySelector('.lb-image');
		if (!img?.src || img.src.includes('data:image')) return;

		const currentSrc = decodeURIComponent(img.src).trim();

		// 1. 定義搜尋目標與對應的 Index 偏移量
		const searchTargets = [
			{ id: 'body_unreceived', addrIdx: 3, timeIdx: 5 },
			{ id: 'body_history',    addrIdx: 2, timeIdx: 4 }
		];

		let data = null;

		// 2. 依序對不同的 tbody 進行匹配
		for (const config of searchTargets) {
			const tbody = document.getElementById(config.id);
			if (!tbody) continue;

			const rows = tbody.querySelectorAll('tr');
			for (const tr of rows) {
				const rowHref = decodeURIComponent(tr.querySelector('a[href]')?.getAttribute('href') || "").trim();
				
				
				// 比對成功
				if (rowHref && (currentSrc.includes(rowHref) || rowHref.includes(currentSrc))) {
					const infoDivs = tr.cells[config.addrIdx]?.querySelectorAll('div');
					data = {
					address:  infoDivs?.[0]?.textContent.trim() || "",
					receiver: infoDivs?.[1]?.querySelector('span')?.textContent.trim() || "",
					datetime: tr.cells[config.timeIdx]?.textContent.trim().slice(5) || ""
					};
					break;
				}
			}
			if (data) break; // 若在第一個 tbody 找到就跳出，不再找下一個
		}

		if (data) renderOverlay(data);
	}

	// ─── UI 渲染 ─────────────────────────────────────────────
	function renderOverlay(data) {
		const container = target.querySelector('.lb-outerContainer');
		if (!container) return;

		let overlay = container.querySelector('.custom-lb-info');
		if (!overlay) {
			overlay = document.createElement('div');
			overlay.className = 'custom-lb-info';
			Object.assign(overlay.style, {
				position: 'absolute', bottom: '0', left: '0', right: '0',
				backgroundColor: 'rgba(0, 0, 0, 0.8)', color: '#00ff00',
				padding: '24px 5px', fontSize: '28px', fontWeight: 'bold',
				textAlign: 'center', zIndex: '2147483647', pointerEvents: 'none',
				whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
			});
			container.appendChild(overlay);
		}

		const sep = `<span style="margin:0 10px; color:#fff; font-weight:normal">|</span>`;
		overlay.innerHTML = `🏠 ${data.address}${sep}👤 ${data.receiver}${sep}📅 ${data.datetime}`;
	}

	// ─── 監聽配置 ────────────────────────────────────────────
	const observer = new MutationObserver((mutations) => {
		mutations.forEach(m => {
			if ((m.attributeName === 'style' && target.style.display === 'block') || 
				(m.attributeName === 'src' && m.target.classList.contains('lb-image'))) {
				setTimeout(syncLightboxInfo, 150);
			}
		});
	});

	observer.observe(target, { attributes: true, subtree: true });
})();