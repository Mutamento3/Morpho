export const UNIVERSAL_CHROME_CSS = `/* 通用版：原有头像、名字与在线状态布局 */
.sully-chat-header{background:#fff!important;border-bottom:1px solid #e2e8f0!important;backdrop-filter:none!important;}
.sully-chat-ios-title{display:none!important;}
`;

export const IOS_CHROME_CSS = `/* IOS27.01.1 · 手动选择；不按系统自动启用 */
.sully-chat-header{
  --ios-title-bottom:2px;


  padding-top:var(--safe-top,0px)!important;
  background:#fff!important;border-bottom:1px solid #e2e8f0!important;
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
}
/* 原内容隐形但保留占位，沿用通用版的密度、安全区与实际撑开高度。 */
.sully-chat-header > .sully-chat-main{visibility:hidden!important;pointer-events:none!important;}
.sully-chat-header > .sully-chat-main .sully-chat-back,
.sully-chat-header > .sully-chat-main .sully-chat-trigger{display:none!important;}
.sully-chat-ios-title{display:flex!important;position:absolute!important;left:20px!important;right:20px!important;bottom:var(--ios-title-bottom)!important;align-items:center!important;gap:8px!important;}
.sully-chat-ios-title .sully-chat-ios-identity{height:24px!important;align-self:flex-end!important;line-height:24px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;flex:1!important;min-width:0!important;padding:0!important;background:none!important;border:0!important;}
.sully-chat-ios-title .sully-chat-name{font-size:16px!important;font-weight:700!important;color:#263244!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}
.sully-chat-ios-title .sully-chat-status{display:flex!important;align-items:center!important;gap:4px!important;flex-shrink:0!important;font-size:10px!important;color:#94a3b8!important;white-space:nowrap!important;}
.sully-chat-ios-title .sully-chat-online-dot{width:6px!important;height:6px!important;border-radius:50%!important;background:#34d399!important;}
.sully-chat-ios-title > button{width:36px!important;height:36px!important;display:flex!important;align-items:center!important;justify-content:center!important;flex-shrink:0!important;}
`;
