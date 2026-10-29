export function allowedResource(raw) {
 try { const u=new URL(raw); return u.protocol==='https:' && !u.username && !u.password && ['', '443'].includes(u.port) && ['kdocs.cn','wps.cn','wps.com','wpscdn.cn','ksord.com','qinglue.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)); } catch {return false;}
}
export function validateShare(raw) {
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.hostname!=='www.kdocs.cn'||!/^\/l\/[A-Za-z0-9]+\/?$/.test(u.pathname)||u.username||u.password||u.port) throw new Error('目前支持 https://www.kdocs.cn/l/ 开头的金山文档分享链接');
 return u.href;
}
export function assemblePages(pages, bottom, height) {
 const ordered=[...pages.values()].sort((a,b)=>a.top-b.top);
 let edge=0, contiguous=true;
 for(const p of ordered){if(p.top-edge>80)contiguous=false;edge=p.top+p.height;}
 return {text:ordered.map((p,i)=>`【第 ${i+1} 个读取页面】\n${p.text}`).join('\n\n'),pages:ordered.length,complete:bottom&&contiguous&&edge>=height-80&&ordered.length>0&&ordered.every(p=>p.text.trim().length>0)};
}
