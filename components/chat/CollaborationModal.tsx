import React, { useState } from 'react';
import { readWorkFile, readWorkLink, loadReaderConfig, READER_CONFIG_KEY, WorkDocument } from '../../utils/workDocuments';
import WorkDocumentCard from './WorkDocumentCard';
export default function CollaborationModal({ enabled, onToggle, onClose, onSend }: { enabled: boolean; onToggle: (value: boolean) => void; onClose: () => void; onSend: (doc: WorkDocument) => Promise<void> }) {
 const [config, setConfig] = useState(loadReaderConfig);
 const [url, setUrl] = useState('');
 const [doc, setDoc] = useState<WorkDocument>();
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const run = async (fn: () => Promise<WorkDocument>) => { setBusy(true); setError(''); setDoc(undefined); try { setDoc(await fn()); } catch(e) { setError(e instanceof Error ? e.message : '读取失败'); } finally { setBusy(false); } };
 return <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="协同工作">
 <div className="bg-white text-slate-800 rounded-3xl p-5 w-full max-w-md max-h-[90dvh] overflow-auto space-y-4">
 <div className="flex justify-between items-center"><h2 className="text-lg font-bold">协同工作</h2><button aria-label="关闭协同工作" onClick={onClose}>✕</button></div>
 <label className="flex gap-3"><input type="checkbox" checked={enabled} onChange={e=>onToggle(e.target.checked)}/>在当前私聊启用文档卡片</label>
 <p className="text-xs text-slate-500">开启后，聊天中发送的链接会作为协同文档处理。发送卡片后，照常点闪电让角色阅读。</p>
 <label className="block rounded-xl border p-3">选择文件<input disabled={busy} className="block mt-2 w-full text-xs" type="file" accept=".docx,.pdf,.txt,.md,.csv,.json" onChange={e=>{const f=e.target.files?.[0]; if(f) void run(()=>readWorkFile(f)); e.target.value='';}}/></label>
 <p className="text-xs text-slate-500">单个文件最多 10 MB。Word 提取正文；PDF 作为原附件发送，需要模型和中转接口支持。</p>
 <div className="flex gap-2"><input aria-label="文档链接" className="border rounded-lg p-2 min-w-0 flex-1" placeholder="粘贴文档分享链接" value={url} onChange={e=>setUrl(e.target.value)}/><button disabled={busy||!url.trim()} onClick={()=>void run(()=>readWorkLink(url,config))}>读取</button></div>
 <details><summary className="text-sm cursor-pointer">浏览器读取服务设置</summary><p className="text-xs my-2">仅填写你自己部署的服务。读取时会将分享链接发送给它；需要登录或没有权限的文档不会绕过限制。</p>
 <input aria-label="读取服务地址" className="border rounded p-2 w-full mb-2" placeholder="https://你的服务.workers.dev" value={config.endpoint||''} onChange={e=>setConfig({...config,endpoint:e.target.value.trim()})}/>
 <input aria-label="读取服务令牌" type="password" className="border rounded p-2 w-full" placeholder="服务访问令牌" value={config.token||''} onChange={e=>setConfig({...config,token:e.target.value})}/>
 <button className="mt-2 text-indigo-600" onClick={()=>{try{localStorage.setItem(READER_CONFIG_KEY,JSON.stringify(config));setError('设置已保存');}catch{setError('本地设置保存失败');}}}>保存服务设置</button></details>
 {busy&&<p role="status">正在读取，请稍候……</p>}{error&&<p role="status" className="text-sm">{error}</p>}
 {doc&&<><WorkDocumentCard doc={doc}/><button disabled={busy} className="w-full bg-indigo-600 text-white rounded-xl p-3 disabled:opacity-50" onClick={async()=>{setBusy(true);try{await onSend(doc);onClose();}catch{setError('发送未完成，请重试');}finally{setBusy(false);}}}>发送文档卡片</button></>}
 </div></div>;
}
