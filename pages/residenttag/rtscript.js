/**
 * rtscript.js
 */

// ── 常數 ──────────────────────────────────────────────────────────────────────
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

let currentSort = { field: null, order: 'asc' };

// ── 時鐘 ──────────────────────────────────────────────────────────────────────
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function updateClock() {
    const now  = new Date();
    const yyyy = now.getFullYear();
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const dd   = String(now.getDate()).padStart(2, '0');
    const wday = WEEKDAYS[now.getDay()];
    const hh   = String(now.getHours()).padStart(2, '0');
    const min  = String(now.getMinutes()).padStart(2, '0');
    const ss   = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('rt-clock').textContent =
        `${yyyy}年${mm}月${dd}日 ${wday} ${hh}:${min}:${ss}`;
}

// ── 回存 ──────────────────────────────────────────────────────────────────────
let _saveTimer = null;

function saveStore() {
    const updatedStore = {};
    const seen = new Set();

    document.querySelectorAll('#residentBody tr').forEach(row => {
        const addrTd = row.cells[1];
        seen.clear();

        const users = Array.from(row.cells[2].querySelectorAll('.name-tag'))
            .filter(s => !seen.has(s.dataset.name) && seen.add(s.dataset.name))
            .map(s => ({
                name:    s.dataset.name,
                isNew:   s.querySelector('.action-btns') !== null,
                note:    s.dataset.note    || "",
                delDate: s.dataset.delDate || "",
                pvt:     s.dataset.pvt === "1",
            }));

        updatedStore[row.id] = {
            odr:        row.cells[0].innerText.trim(),
            adr:        addrTd.innerText.trim(),
            tag:        addrTd.dataset.tag        || "",
            tagDelDate: addrTd.dataset.tagDelDate || "",
            users,
        };
    });

    chrome.runtime.sendMessage({ action: "SET_RTSTORE", data: updatedStore }, () => {
        const btn = document.getElementById('save-btn');
        btn.textContent = '✔ 已回存';
        btn.classList.add('success');
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
            btn.textContent = '💾 回存';
            btn.classList.remove('success');
        }, 2000);
    });
}

// ── 初始化 ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // 時鐘啟動
    updateClock();
    setInterval(updateClock, 1000);

    // 回存按鈕
    document.getElementById('save-btn').addEventListener('click', saveStore);

    // popup 初始化
    _popup.init();

    // 從 background 載入資料
    chrome.runtime.sendMessage({ action: "GET_RTSTORE" }, (response) => {
        if (response?.data) initialByStore(response.data);
    });

    // 排序按鈕
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => executeSort(btn.getAttribute('data-field')));
    });

    // tooltip 座標：tbody 層級委派
    document.getElementById('residentBody').addEventListener('mouseover', (e) => {
        const target = e.target.closest('td.has-tag, span.name-tag.note');
        if (!target) return;
        const r = target.getBoundingClientRect();
        target.style.setProperty('--tip-x', `${r.left}px`);
        target.style.setProperty('--tip-y', `${r.top - 30}px`);
    });
});

// ── 工具函式 ──────────────────────────────────────────────────────────────────
const isExpired = (d) => !!d && new Date(d) < TODAY;

const nameTagClass = (note, pvt) =>
    note ? 'name-tag note' : pvt ? 'name-tag pvt' : 'name-tag';

// ── 初始化表格 ────────────────────────────────────────────────────────────────
function initialByStore(data) {
    document.querySelectorAll('#residentBody tr').forEach(row => {
        const info = data[row.id];
        if (!info) return;

        row.cells[0].innerText = info.odr || "";

        const tag        = isExpired(info.tagDelDate) ? "" : (info.tag        || "");
        const tagDelDate = isExpired(info.tagDelDate) ? "" : (info.tagDelDate || "");
        setupAddrCell(row.cells[1], info.adr || "", tag, tagDelDate);

        const frag = document.createDocumentFragment();
        (info.users || []).forEach(item => {
            const note    = isExpired(item.delDate) ? "" : (item.note    || "");
            const delDate = isExpired(item.delDate) ? "" : (item.delDate || "");
            frag.appendChild(createNameSpan({ ...item, note, delDate }));
        });
        row.cells[2].textContent = '';
        row.cells[2].appendChild(frag);
    });
}

// ── 地址欄設定 ────────────────────────────────────────────────────────────────
function setupAddrCell(td, adr, tag, tagDelDate) {
    td.innerText          = adr;
    td.dataset.tag        = tag;
    td.dataset.tagDelDate = tagDelDate;
    td.classList.toggle('has-tag', !!tag);
    td.style.cursor       = 'pointer';

    td.onclick = () => openPopup({
        label:   '地址標記',
        value:   td.dataset.tag,
        delDate: td.dataset.tagDelDate,
        onConfirm(newVal, newDate) {
            td.dataset.tag        = newVal;
            td.dataset.tagDelDate = newDate;
            td.classList.toggle('has-tag', !!newVal);
        }
    });
}

// ── 建立 name-tag span ────────────────────────────────────────────────────────
function createNameSpan(item) {
    const { name, note, delDate, pvt, isNew } = item;

    const span = document.createElement('span');
    span.className       = nameTagClass(note, pvt);
    span.dataset.name    = name;
    span.dataset.note    = note;
    span.dataset.delDate = delDate;
    span.dataset.pvt     = pvt ? "1" : "";

    const em = document.createElement('em');
    em.innerText = name;
    span.appendChild(em);

    span.addEventListener('click', (e) => {
        if (e.target.closest('.action-btns')) return;
        openPopup({
            label:   `${name} 備註`,
            value:   span.dataset.note,
            delDate: span.dataset.delDate,
            onConfirm(newVal, newDate) {
                span.dataset.note    = newVal;
                span.dataset.delDate = newDate;
                span.className = nameTagClass(newVal, span.dataset.pvt === "1");
            }
        });
    });

    if (isNew) {
        const btnGroup = document.createElement('div');
        btnGroup.className = 'action-btns';
        btnGroup.innerHTML =
            '<button class="btn-confirm">✔</button>' +
            '<button class="btn-cancel">✘</button>';
        btnGroup.firstChild.addEventListener('click',  (e) => { e.stopPropagation(); btnGroup.remove(); });
        btnGroup.lastChild.addEventListener('click',   (e) => { e.stopPropagation(); span.remove(); });
        span.appendChild(btnGroup);
    }
    return span;
}

// ── 浮動彈窗 ──────────────────────────────────────────────────────────────────
const _popup = {
    overlay:    null,
    title:      null,
    input:      null,
    dateInput:  null,
    _onConfirm: null,

    init() {
        this.overlay   = document.getElementById('rt-popup-overlay');
        this.title     = document.getElementById('rt-popup-title');
        this.input     = document.getElementById('rt-popup-input');
        this.dateInput = document.getElementById('rt-popup-date');

        document.getElementById('rt-popup-date-clear').onclick =
            () => { this.dateInput.value = ""; };

        document.querySelector('.rt-popup-btn.confirm').onclick = () => {
            this._onConfirm?.(this.input.value.trim(), this.dateInput.value);
            this.hide();
        };
        document.querySelector('.rt-popup-btn.cancel').onclick =
            () => this.hide();

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hide();
        });
    },

    show({ label, value, delDate, onConfirm }) {
        this.title.textContent     = label;
        this.input.value           = value   || "";
        this.dateInput.value       = delDate || "";
        this._onConfirm            = onConfirm;
        this.overlay.style.display = 'flex';
        this.input.focus();
        this.input.select();
    },

    hide() {
        this.overlay.style.display = 'none';
        this._onConfirm = null;
    }
};

function openPopup(opts) {
    if (_popup.overlay.style.display === 'flex') return;
    _popup.show(opts);
}

// ── 排序 ──────────────────────────────────────────────────────────────────────
function executeSort(field) {
    currentSort = {
        field,
        order: (currentSort.field === field && currentSort.order === 'asc') ? 'desc' : 'asc'
    };
    updateSortButtonsUI();

    const tbody    = document.getElementById('residentBody');
    const colIndex = field === 'odr' ? 0 : 1;
    const rows     = Array.from(tbody.querySelectorAll('tr'))
        .sort((a, b) => {
            const cmp = (a.cells[colIndex]?.textContent || "")
                .localeCompare(b.cells[colIndex]?.textContent || "",
                    undefined, { numeric: true, sensitivity: 'base' });
            return currentSort.order === 'asc' ? cmp : -cmp;
        });

    const frag = document.createDocumentFragment();
    rows.forEach(r => frag.appendChild(r));
    tbody.appendChild(frag);
}

function updateSortButtonsUI() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        const active = btn.getAttribute('data-field') === currentSort.field;
        btn.classList.toggle('active', active);
        active
            ? btn.setAttribute('data-order', currentSort.order)
            : btn.removeAttribute('data-order');
    });
}