import React, {useState} from 'react';
import {getSharedCloudflareToken,rememberCloudflareToken,forgetCloudflareToken} from '../../utils/cloudflareTokenSession';
import {inspectReaderToken,deployReader,testReaderService,Report,Check} from '../../utils/documentReaderSetup';
import {getProxyWorkerUrl} from '../../utils/proxyWorker';
import {READER_CONFIG_KEY} from '../../utils/workDocuments';
export default function DocumentReaderSetup({config,onConfigured}:{config:{endpoint?:string;token?:string};onConfigured:(c:{endpoint:string;token:string})=>void}){
 const [token,T]=useState(()=>getSharedCloudflareToken()?.token||'');
 const [source,S]=useState(()=>getSharedCloudflareToken()?.source||'');
 const [report,R]=useState<Report>();const [account,A]=useState('');const [busy,B]=useState(false);const [notice,N]=useState('');const [check,C]=useState<Check>();
 const run=async(fn:()=>Promise<void>)=>{B(true);N('');try{await fn();}catch(e){N(e instanceof Error?e.message:'操作未完成，请重试');}finally{B(false);}};
 const change=(value:string)=>{T(value);S('手动输入');R(undefined);A('');rememberCloudflareToken(value,'协同工作');};
 return <details className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3" open><summary className="font-semibold text-sm cursor-pointer">链接读取 · Token 配置与体检</summary>
 <p className="text-xs mt-3 text-slate-600">可以使用主动消息那枚 Cloudflare API Token。它不是模型 Key，也不是下方的读取口令。</p>
 <p className="text-xs my-2 text-slate-500">{source?`已带入：${source}。仅在本次打开期间共享，30 分钟后不再自动带入。`:'未发现本次会话的 Token。旧版主动消息只把它存为云端密钥，无法读回；首次请再粘贴一次原来的 Token。'}</p>
 <input aria-label="Cloudflare API Token" type="password" autoComplete="off" disabled={busy} value={token} onChange={e=>change(e.target.value)} placeholder="粘贴已有的 Cloudflare API Token" className="w-full border rounded-lg p-2 text-sm"/>
 <div className="flex flex-wrap gap-3 mt-2 text-xs text-indigo-700"><button disabled={busy} onClick={()=>{const shared=getSharedCloudflareToken();if(shared){T(shared.token);S(shared.source);R(undefined);A('');N('已带入本次会话的 Token');}else N('没有可复用的会话 Token，请粘贴原来的 Token。');}}>复用本次会话 Token</button><button disabled={busy} onClick={()=>{forgetCloudflareToken();T('');S('');R(undefined);A('');N('会话 Token 已清除，已部署服务不受影响');}}>清除会话 Token</button></div>
 <p className="text-xs text-slate-500 my-3 break-all">体检和部署沿用主动消息的网络代理，Token 会经过：{getProxyWorkerUrl()}。仅在信任这个代理时操作；可在网络设置中换成自己的代理。</p>
 <p className="text-xs text-slate-500 mb-3">建议权限：Account Settings:Read、Workers Scripts:Edit，资源范围选自己的账号。此服务不需要 D1。只读体检不会创建资源，也无法证明写入权限。</p>
 {!!report?.accounts.length&&<label className="block text-xs my-2">部署账号<select aria-label="部署账号" disabled={busy} value={account} onChange={e=>{A(e.target.value);R(prev=>prev?{...prev,canDeploy:false}:prev);}} className="block border rounded-lg p-2 w-full"><option value="">选择账号</option>{report.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
 <button disabled={busy||!token.trim()} className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm disabled:opacity-40" onClick={()=>void run(async()=>{N('正在进行只读体检……');const r=await inspectReaderToken(token.trim(),account);R(r);if(r.accountId)A(r.accountId);N(r.canDeploy?'只读体检完成，可尝试部署；黄色项仍需实际验证。':'体检已结束，请查看下面的提示。');})}>体检 Token</button>
 {report&&<ul className="space-y-2 my-3 text-xs">{report.checks.map((c,i)=><li key={i} className={c.state==='fail'?'text-rose-700':c.state==='warn'?'text-amber-800':'text-emerald-700'}>{c.state==='pass'?'✓':c.state==='warn'?'△':'×'} {c.title}：{c.detail}</li>)}</ul>}
 {report?.canDeploy&&<div className="mt-3"><p className="text-xs mb-2">将创建或更新独立的 morpho-document-reader；不修改主动消息。更新可能更换读取口令，其他设备需同步新口令。</p><button disabled={busy} className="rounded-lg bg-slate-800 text-white p-2 text-sm disabled:opacity-40" onClick={()=>void run(async()=>{const c=await deployReader(token.trim(),account,N);localStorage.setItem(READER_CONFIG_KEY,JSON.stringify(c));onConfigured(c);N('部署完成，地址和读取口令已自动保存。新域名可能需要稍等再测试连接。');})}>部署／更新文档读取服务</button></div>}
 {config.endpoint&&<div className="flex flex-wrap gap-3 mt-3 text-xs text-indigo-700"><button disabled={busy} onClick={()=>void run(async()=>{C(await testReaderService(config));})}>测试已配置的服务</button><button disabled={busy} onClick={()=>void run(async()=>{C(await testReaderService(config,true));})}>测试浏览器启动（使用少量额度）</button></div>}
 {check&&<p className="text-xs mt-2" role="status">{check.title}：{check.detail}</p>}{notice&&<p className="text-xs mt-3 whitespace-pre-wrap" role="status">{notice}</p>}
 </details>;
}
