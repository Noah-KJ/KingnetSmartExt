/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  bridge.js  · world: MAIN                           ║
 * ║  代理呼叫頁面 JS 方法，透過 CustomEvent 回傳結果     ║
 * ╚══════════════════════════════════════════════════════╝
 * 僅注入於 collectionRecord_v2.aspx。
 * 在 MAIN world 執行，可直接存取頁面變數。
 */

window.addEventListener("__smartlife_request", async (e) => {
    const { type, id } = e.detail ?? {};

    if (type === "getEditRecord") {
        try {
            const data = await collectionRecord._getEditRecord(id);

            // 修正：改與「下一筆」比較
            const filtered = data.filter((record, i) => {
                // 如果是最後一筆，沒有下一筆可以比較，直接保留
                if (i === data.length - 1) return true;

                // 如果當前金額跟下一筆（更舊或更新，取決於排序）不同，才保留
                // 這代表這筆紀錄是該金額狀態的「轉折點」
                return record.col_money !== data[i + 1].col_money;
            });

            window.dispatchEvent(new CustomEvent("__smartlife_response", {
                detail: { type: "getEditRecord", id, data: filtered }
            }));
        } catch (err) {
            window.dispatchEvent(new CustomEvent("__smartlife_response", {
                detail: { type: "getEditRecord", id, data: [], error: err.message }
            }));
        }
    }
});