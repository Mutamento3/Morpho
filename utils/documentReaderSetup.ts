import { getProxyWorkerUrl } from './proxyWorker';
export const READER_SCRIPT = 'morpho-document-reader';
export const READER_ID = 'morpho-document-reader-v1';
export type Check = { title:string; state:'pass'|'warn'|'fail'; detail:string };
export type Account = {id:string;name:string};
export type Report = {checks:Check[];accounts:Account[];accountId?:string;subdomain?:string;canDeploy:boolean};
const DRAFT_KEY='morpho_reader_deployment_draft_v1';
async function timedFetch(url:string,init:RequestInit={}) {
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try{return await fetch(url,{...init,signal:controller.signal});}finally{clearTimeout(timer);}
}
async function cf(token:string,path:string,method='GET',body?:FormData|string) {
 try {
  const r=await timedFetch(`${getProxyWorkerUrl()}/cf-api?path=${encodeURIComponent(path)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-CF-Method':method,...(typeof body==='string'?{'Content-Type':'application/json'}:{})},body});
  const data=await r.json();return {ok:r.ok&&data.success===true,status:r.status,data};
 }catch{return {ok:false,status:0,data:null};}
}
export async function inspectReaderToken(token:string,accountId?:string):Promise<Report>{
 const report:Report={checks:[],accounts:[],canDeploy:false};
 const add=(title:string,state:Check['state'],detail:string)=>report.checks.push({title,state,detail});
 if(!token.trim()){add('Token','fail','请粘贴原来的 Cloudflare API Token；读取口令和模型 API Key 不能替代。');return report;}
 if(token.trim().startsWith('cfat_')){add('Token 类型','fail','此流程暂不支持账号级 Token，请使用用户 API Token。');return report;}
 try{const r=await timedFetch(`${getProxyWorkerUrl()}/cf-api`);if(!r.ok||(await r.json()).relay!=='cf-api')throw Error();add('网络代理','pass','支持 Cloudflare 部署接口');}catch{add('网络代理','fail','代理不支持 /cf-api 或连接超时，请在网络设置中检查代理。');return report;}
 const v=await cf(token,'/user/tokens/verify');
 if(!v.ok||v.data?.result?.status!=='active'||v.data?.messages?.some((m:any)=>m.code===10002)){add('Token 有效性','fail','验证未通过：请检查有效期、是否尚未生效、Token 是否复制完整。');return report;}
 add('Token 有效性','pass','Cloudflare 确认为 active');
 const accounts=await cf(token,'/accounts?per_page=50');
 if(!accounts.ok){add('账号列表','fail','无法读取账号；请检查 Account Settings:Read 权限和账号授权范围。');return report;}
 report.accounts=(accounts.data?.result||[]).filter((a:any)=>typeof a.id==='string'&&/^[a-f0-9]{32}$/i.test(a.id)).map((a:any)=>({id:a.id,name:a.name||a.id}));
 if(!report.accounts.length){add('账号列表','fail','没有找到可用账号。');return report;}
 const selected=report.accounts.find(a=>a.id===accountId)||(report.accounts.length===1?report.accounts[0]:undefined);
 if(!selected){add('部署账号','warn','请先选择账号，再运行体检。');return report;}
 report.accountId=selected.id;add('部署账号','pass',selected.name);
 const base=`/accounts/${selected.id}/workers`;
 const scripts=await cf(token,`${base}/scripts`);
 if(!scripts.ok){add('Workers 访问','fail','无法读取 Worker 列表；请检查 Workers Scripts:Edit 权限和所选账号范围。');return report;}
 add('Workers 访问','pass','可读取 Worker 列表');
 const existing=(scripts.data?.result||[]).some((s:any)=>s.id===READER_SCRIPT);
 if(existing){
  const settings=await cf(token,`${base}/scripts/${READER_SCRIPT}/settings`);
  const mine=settings.ok&&settings.data?.result?.bindings?.some((b:any)=>b.name==='MORPHO_READER_ID'&&b.text===READER_ID);
  if(!mine){add('服务名称','fail',`${READER_SCRIPT} 已存在，但不能确认是本功能创建的服务。为避免覆盖，停止自动部署；可继续手动填写服务地址。`);return report;}
  add('服务名称','pass','识别到本功能创建的读取服务，可以更新');
 }else add('服务名称','pass','将创建独立的读取服务，不改动主动消息');
 const sub=await cf(token,`${base}/subdomain`);
 if(sub.ok&&typeof sub.data?.result?.subdomain==='string'&&/^[a-z0-9-]+$/.test(sub.data.result.subdomain)){report.subdomain=sub.data.result.subdomain;add('服务域名','pass',`${report.subdomain}.workers.dev`);}else{add('服务域名','fail','未能读取 workers.dev 子域名。请先在 Cloudflare Workers 页面启用子域名，或检查 Account Settings:Read 权限。');return report;}
 add('写入权限与浏览器','warn','只读体检不会试写资源，不能证明写入权限或浏览器额度可用；部署时检查写入，部署后可测试浏览器。无需 D1 权限。');
 report.canDeploy=true;return report;
}
export async function testReaderService(config:{endpoint?:string;token?:string},launch=false):Promise<Check>{
 const title=launch?'云端浏览器启动':'读取服务连接';
 try{
  const u=new URL(config.endpoint||'');if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error();
  const r=await timedFetch(new URL(launch?'./browser-check':'./health',u.href.endsWith('/')?u.href:u.href+'/').href,{method:launch?'POST':'GET',headers:{Authorization:`Bearer ${config.token||''}`}});
  const d=await r.json();if(!r.ok||d.service!==READER_ID||d.ok!==true) return {title,state:'fail',detail:`检查未通过（HTTP ${r.status}），请检查地址、读取口令或更新服务。`};
  return {title,state:'pass',detail:launch?'浏览器已启动并关闭；未打开任何文档。':'服务身份和读取口令正确。'};
 }catch{return {title,state:'fail',detail:'连接失败或超时；请检查服务地址、网络和允许的网站来源。'};}
}
export async function deployReader(token:string,accountId:string,onProgress:(s:string)=>void){
 onProgress('重新核验账号和服务名称……');
 const report=await inspectReaderToken(token,accountId);
 if(!report.canDeploy||!report.accountId||!report.subdomain)throw Error(report.checks.find(c=>c.state==='fail')?.detail||'体检未通过，请重新选择账号。');
 const endpoint=`https://${READER_SCRIPT}.${report.subdomain}.workers.dev`;
 onProgress('读取本版本配套的服务代码……');
 const res=await timedFetch(new URL(`${import.meta.env.BASE_URL}document-reader.bundle.js`,location.href).href,{cache:'no-store'});
 if(!res.ok)throw Error('读取部署代码失败，请更新小手机后重试。');
 const code=await res.text();if(code.length<10000||code.length>3000000||!code.includes(READER_ID))throw Error('部署代码不完整，已停止。');
 let draft:any;try{draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');}catch{}
 const key=draft?.endpoint===endpoint&&typeof draft.token==='string'&&/^[a-f0-9]{64}$/.test(draft.token)?draft.token:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 // Save before upload so an interrupted deployment can be retried without losing its secret.
 localStorage.setItem(DRAFT_KEY,JSON.stringify({endpoint,token:key}));
 const meta={main_module:'worker.bundle.js',compatibility_date:'2026-10-01',compatibility_flags:['nodejs_compat'],bindings:[{type:'browser',name:'BROWSER'},{type:'plain_text',name:'ALLOWED_ORIGIN',text:location.origin},{type:'plain_text',name:'MORPHO_READER_ID',text:READER_ID},{type:'secret_text',name:'READER_TOKEN',text:key}]};
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));form.set('worker.bundle.js',new Blob([code],{type:'application/javascript+module'}),'worker.bundle.js');
 onProgress('部署独立的文档读取服务……');
 const path=`/accounts/${report.accountId}/workers/scripts/${READER_SCRIPT}`;
 const up=await cf(token,path,'PUT',form);if(!up.ok)throw Error(`服务写入失败（HTTP ${up.status}）。请检查 Workers Scripts:Edit 权限、账号额度及 Browser Run 可用性；主动消息未被改动。`);
 const expose=await cf(token,`${path}/subdomain`,'POST',JSON.stringify({enabled:true,previews_enabled:false}));if(!expose.ok)throw Error(`开启服务地址失败（HTTP ${expose.status}），可用同一 Token 重试部署。`);
 onProgress('部署完成，正在保存连接配置……');return {endpoint,token:key};
}
