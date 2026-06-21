/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  inescript.js  ·  現金收付帳本                       ║
 * ╚══════════════════════════════════════════════════════╝
 */

let localInEStore = {};
let localDiffLog  = { total: 0, entries: [] };

// ─── 0. Template 工具 ─────────────────────────────────────
function cloneTpl(id) {
    return document.getElementById(id).content.cloneNode(true).firstElementChild;
}

// ─── 1. 時鐘 ──────────────────────────────────────────────
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

// ─── 2. 回存 ──────────────────────────────────────────────
let _saveTimer = null;

function saveStore() {
    localDiffLog.total = grandTotal();
    chrome.runtime.sendMessage({
        action: "SET_INESTORE",
        data: localInEStore,
        diffLog: localDiffLog
    });
    const btn = document.getElementById('saveBtn');
    btn.textContent = '✔ 已回存';
    btn.classList.add('success');
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        btn.textContent = '💾 回存';
        btn.classList.remove('success');
    }, 2000);
}

// ─── 3. 金額工具 ──────────────────────────────────────────
function getCidCurrent(c) {
    if (c.current != null) return c.current;
    return c.history?.length ? c.history[c.history.length - 1].cash : 0;
}

function bucketTotal(bucket) {
    return (bucket.c_id ?? [])
        .filter(c => !c.dep)
        .reduce((acc, c) => acc + getCidCurrent(c), 0);
}

function grandTotal() {
    return Object.values(localInEStore)
        .reduce((acc, b) => acc + bucketTotal(b), 0);
}

// ─── 4. 頁籤切換 ──────────────────────────────────────────
function handleTabSwitch(evt) {
    const map = { 'btn-changed': 'changedTab', 'btn-normal': 'normalTab', 'btn-diff': 'diffTab' };
    const targetId = map[evt.currentTarget.id];
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(el => el.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');
    evt.currentTarget.classList.add('active');
}

// ─── 5. 渲染 ──────────────────────────────────────────────
function renderLogs() {
    const cc = document.getElementById('container-changed');
    const cn = document.getElementById('container-normal');
    cc.innerHTML = '';
    cn.innerHTML = '';

    let sumChanged = 0, sumNormal = 0;
    let hasChanged = false, hasNormal = false;

    for (const [a_id, bucket] of Object.entries(localInEStore)) {
        const isChanged = bucket.c_chk || bucket.p_chk;
        const card  = createCard(a_id, bucket);
        const total = bucketTotal(bucket);

        if (isChanged) {
            cc.appendChild(card);
            sumChanged += total;
            hasChanged = true;
        } else {
            cn.appendChild(card);
            sumNormal += total;
            hasNormal = true;
        }
    }

    if (!hasChanged) cc.appendChild(makeNoData('目前無待確認資料'));
    if (!hasNormal)  cn.appendChild(makeNoData('暫無已確認資料'));

    document.getElementById('totalCash').textContent  = `$${grandTotal().toLocaleString()}`;
    document.getElementById('sumChanged').textContent = `($${sumChanged.toLocaleString()})`;
    document.getElementById('sumNormal').textContent  = `($${sumNormal.toLocaleString()})`;
}

function makeNoData(text) {
    const el = cloneTpl('tpl-no-data');
    el.textContent = text;
    return el;
}

// ─── 6a. 歷史紀錄 row ─────────────────────────────────────
function buildHistoryRow(c) {
    const current = getCidCurrent(c);
    const history = c.history ?? [];
    const row     = document.createElement('div');
    row.className = 'history-row';

    if (history.length === 0) {
        const cur = document.createElement('em');
        cur.className = 'cash-current';
        cur.dataset.title = c.start ?? '';
        cur.textContent = `$${current.toLocaleString()}`;
        row.appendChild(cur);
        return row;
    }

    for (let i = 0; i < history.length; i++) {
        const h        = history[i];
        const nextCash = (i + 1 < history.length) ? history[i + 1].cash : current;
        const isRed    = nextCash < h.cash;

        const node = document.createElement('em');
        node.className = `cash-node${isRed ? ' red' : ''}`;
        if (i === 0) node.dataset.title = c.start ?? '';
        node.textContent = `$${h.cash.toLocaleString()}`;
        row.appendChild(node);

        const arrow = document.createElement('span');
        arrow.className = 'cash-arrow';
        arrow.dataset.title = h.time ?? '';
        arrow.textContent = '➜';
        row.appendChild(arrow);
    }

    const cur = document.createElement('em');
    cur.className = 'cash-current';
    cur.textContent = `$${current.toLocaleString()}`;
    row.appendChild(cur);

    return row;
}

// ─── 6b. 包裹區塊 ─────────────────────────────────────────
function buildPidSection(a_id, bucket) {
    const pids = bucket.p_id ?? [];
    if (!pids.length) return null;

    const section = cloneTpl('tpl-pid-section');
    for (const p of pids) {
        const item = cloneTpl('tpl-pid-item');
        item.dataset.aid = a_id;
        item.dataset.pid = p.id;
        item.querySelector('.pid-odr').textContent  = p.odr;
        item.querySelector('.pid-name').textContent = p.name;
        item.querySelector('.pid-ts').textContent   = p.time;
        const btn = item.querySelector('.pid-confirm');
        btn.dataset.aid = a_id;
        btn.dataset.pid = p.id;
        section.appendChild(item);
    }
    return section;
}

// ─── 6c. 建立卡片 ─────────────────────────────────────────
function createCard(a_id, bucket) {
    const card      = cloneTpl('tpl-card');
    const isOrange  = !!(bucket.c_chk ^ bucket.p_chk);
    const isChanged = bucket.c_chk || bucket.p_chk;

    card.classList.toggle('is-changed', isChanged);
    card.classList.toggle('is-orange',  isOrange);
    card.dataset.aid = a_id;

    card.querySelector('.addr').textContent        = bucket.adr;
    card.querySelector('.group-total').textContent = `$${bucketTotal(bucket).toLocaleString()}`;

    const right = card.querySelector('.card-header-right');
    if (isChanged) {
        const btn = cloneTpl('tpl-chk-btn');
        btn.dataset.aid = a_id;
        right.appendChild(btn);
    } else {
        right.appendChild(cloneTpl('tpl-chk-done'));
    }

    for (const c of (bucket.c_id ?? [])) {
        const block = cloneTpl('tpl-cid-block');
        block.classList.toggle('is-dep', !!c.dep);
        block.querySelector('.cid-odr').textContent  = c.odr;
        block.querySelector('.cid-name').textContent = c.name;

        const cidRight = block.querySelector('.cid-right');
        if (c.dep) {
            const depBadge = cloneTpl('tpl-dep-badge');
            const delBtn   = document.createElement('button');
            delBtn.className      = 'cid-del-btn';
            delBtn.textContent    = '✕';
            delBtn.dataset.aid    = a_id;
            delBtn.dataset.cid    = c.id;
            cidRight.replaceWith(depBadge);
            block.appendChild(delBtn);
        } else {
            const cur = cloneTpl('tpl-cid-current');
            cur.textContent = `$${getCidCurrent(c).toLocaleString()}`;
            cidRight.replaceWith(cur);
        }

        block.appendChild(buildHistoryRow(c));
        card.appendChild(block);
    }

    const pidSection = buildPidSection(a_id, bucket);
    if (pidSection) card.appendChild(pidSection);

    return card;
}

// ─── 7. 確認整個 a_id ────────────────────────────────────
function confirmBucket(a_id) {
    const bucket = localInEStore[a_id];
    if (!bucket) return;
    bucket.c_chk = false;
    bucket.p_chk = false;
    localDiffLog.entries = localDiffLog.entries.filter(e => e.a_id !== a_id);
    rerender();
}

// ─── 8. 移除 c_id 單筆 ───────────────────────────────────
function removeCid(a_id, cid) {
    const bucket = localInEStore[a_id];
    if (!bucket) return;
    bucket.c_id = bucket.c_id.filter(c => String(c.id) !== String(cid));
    rerender();
}

// ─── 9. 移除 p_id 單筆 ───────────────────────────────────
function removePid(a_id, pid) {
    const bucket = localInEStore[a_id];
    if (!bucket) return;
    bucket.p_id = bucket.p_id.filter(p => String(p.id) !== String(pid));
    rerender();
}

// ─── 9. 重新渲染 ──────────────────────────────────────────
function rerender() {
    renderLogs();
    renderDiff();
}

// ─── 10. 差異表渲染 ───────────────────────────────────────
function renderDiff() {
    const container = document.getElementById('container-diff');
    if (!container) return;
    container.innerHTML = '';

    const entries   = localDiffLog.entries ?? [];
    const baseTotal = localDiffLog.total   ?? 0;
    const curTotal  = grandTotal();

    if (!entries.length) {
        container.appendChild(makeNoData('自上次確認後尚無變動'));
    }

    const footer    = cloneTpl('tpl-diff-footer');
    const totalLine = footer.querySelector('.diff-total-line');

    for (const e of entries) {
        const row     = cloneTpl('tpl-diff-entry');
        const infoEl  = row.querySelector('.diff-entry-info');
        const deltaEl = row.querySelector('.diff-delta');

        infoEl.textContent = `${e.adr}　${e.odr}　${e.name}`;
        if (e.time) infoEl.dataset.title = e.time;

        deltaEl.textContent = `${e.delta >= 0 ? '+' : ''}${e.delta.toLocaleString()}`;
        deltaEl.classList.add(e.delta >= 0 ? 'diff-pos' : 'diff-neg');

        footer.insertBefore(row, totalLine);
    }

    footer.querySelector('.diff-base-total').textContent    = `$${baseTotal.toLocaleString()}`;
    footer.querySelector('.diff-current-total').textContent = `$${curTotal.toLocaleString()}`;
    container.appendChild(footer);
}

// ─── 11. 事件綁定 ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // 時鐘
    updateClock();
    setInterval(updateClock, 1000);

    // 回存
    document.getElementById('saveBtn').addEventListener('click', saveStore);

    // 頁籤
    document.getElementById('btn-changed').addEventListener('click', handleTabSwitch);
    document.getElementById('btn-normal').addEventListener('click', handleTabSwitch);
    document.getElementById('btn-diff').addEventListener('click', handleTabSwitch);

    // 事件委派
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('chk-btn')) {
            confirmBucket(e.target.dataset.aid);
            return;
        }
        if (e.target.classList.contains('cid-del-btn')) {
            removeCid(e.target.dataset.aid, e.target.dataset.cid);
            return;
        }
        if (e.target.classList.contains('pid-confirm')) {
            removePid(e.target.dataset.aid, e.target.dataset.pid);
        }
    });

    // 載入資料
    chrome.runtime.sendMessage({ action: "GET_INESTORE" }, (res) => {
        if (chrome.runtime.lastError) {
            console.warn('[InEScript] GET_INESTORE:', chrome.runtime.lastError.message);
            return;
        }
        if (res?.data)    localInEStore = res.data;
        if (res?.diffLog) localDiffLog  = res.diffLog;
        renderLogs();
        renderDiff();
    });
});