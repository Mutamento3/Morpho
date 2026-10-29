import React, { useState } from 'react';
import type { WorkDocument } from '../../utils/workDocuments';
const labels = { ready: '文字已读取', partial: '部分正文', native: 'PDF 原件 · 由模型读取', 'needs-service': '待接入读取服务', failed: '读取未完成' };
export default function WorkDocumentCard({ doc, onRead }: { doc: WorkDocument; onRead?: () => Promise<void> }) {
    const [reading, setReading] = useState(false);
    const [readError, setReadError] = useState('');
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    return <div className="w-64 max-w-full rounded-2xl border border-indigo-200 bg-white p-4 text-slate-800 shadow-sm" onClick={e => e.stopPropagation()}>
        <div className="text-xs text-indigo-500">▤ 协同工作 · {doc.source === 'file' ? '文件' : '文档链接'}</div>
        <button className="mt-2 block text-left font-semibold break-all" onClick={() => setOpen(!open)}>{doc.name}</button>
        <div className="mt-2 text-xs text-slate-500">{labels[doc.status]}{doc.text ? ` · ${doc.text.length} 字` : ''}</div>
        {doc.detail && <p className="mt-2 text-xs text-slate-500">{doc.detail}</p>}
        {doc.url && onRead && <button disabled={reading} className="mt-3 text-xs text-indigo-600" onClick={async () => { setReading(true); setReadError(''); try { await onRead(); } catch { setReadError('重新读取未完成，请重试'); } finally { setReading(false); } }}>{reading ? '正在读取……' : '重新读取正文'}</button>}
        {readError && <p role="status" className="text-xs mt-2">{readError}</p>}
        {doc.text && <button className="mt-3 text-xs text-indigo-600" onClick={() => setOpen(!open)}>{open ? '收起正文' : '查看已读取正文'}</button>}
        {open && doc.text && <div className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{doc.text}</div>}
        {doc.url && <div className="mt-3 flex gap-4 text-xs text-indigo-600"><a href={/^https?:\/\//i.test(doc.url) ? doc.url : undefined} target="_blank" rel="noopener noreferrer">原始网页 ↗</a><button onClick={async () => { try { await navigator.clipboard.writeText(doc.url!); setCopied(true); } catch { setOpen(true); } }}>{copied ? '已复制' : '复制链接'}</button></div>}
        {open && doc.url && <div className="mt-2 select-text break-all text-xs">{doc.url}</div>}
    </div>;
}
