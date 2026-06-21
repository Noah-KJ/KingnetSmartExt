/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Global Utils               ║
 * ║  存放 DOM 操作、延遲與非同步處理工具                 ║
 * ╚══════════════════════════════════════════════════════╝
 */

export const Utils = {
    /**
     * 等待元素出現於 DOM
     * @param {string} by - "id" | "class"
     * @param {string} selector - ID 名稱或 Class 選擇器
     * @param {number} index - 若為 class，指定第幾個元素
     * @param {number} timeout - 逾時毫秒
     */
    waitFor(by = "id", selector, index = 0, timeout = 3000) {
        return new Promise(resolve => {
            const getEl = () => by === "id"
                ? document.getElementById(selector)
                : document.querySelectorAll(selector)[index] ?? null;

            const found = getEl();
            if (found) return resolve(found);

            const observer = new MutationObserver(() => {
                const el = getEl();
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.documentElement, { 
                childList: true, 
                subtree: true 
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    },

    /**
     * 延遲點擊（用於處理 SPA 頁面渲染時間差）
     */
    delayedClick(parent, path, delay = 400) {
        if (!parent) return;
        setTimeout(() => {
            path.reduce((el, i) => el?.children[i], parent)?.click();
            if (!parent) {
                console.log("⚠️ 延遲點擊失敗，找不到父元素:", parent);
            }
        }, delay);
    },

    /**
     * 非同步睡眠
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};