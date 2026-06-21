/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          智生活小幫手  ·  Global Config              ║
 * ║  存放全域常數、表格 ID 與頁面路由配置                ║
 * ╚══════════════════════════════════════════════════════╝
 */

export const LIST_CONFIG = {
    // 包裹清單頁面
    unreceived: { 
        tableId: "body_unreceived", 
        memoCell: 8, 
        pattern: "postalList.aspx" 
    },
    // 退貨清單頁面
    returns: { 
        tableId: "body_return", 
        memoCell: 7, 
        pattern: "postalReturnList.aspx" 
    },
    // 寄物清單頁面
    collection: { 
        tableId: "body_collection", 
        memoCell: 5, 
        pattern: "collectionRecord_v2.aspx" 
    }
};

// waitFor 預設逾時（ms）
export const WAIT_TIMEOUT = 3000;
