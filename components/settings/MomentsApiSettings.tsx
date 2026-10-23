import React, { useEffect, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import type { APIConfig, MomentsSettings } from '../../types';
import { normalizeMomentsApi, resolveMomentsApi } from '../../utils/momentsApi';
import { extractContent, safeResponseJson } from '../../utils/safeApi';

export default function MomentsApiSettings({ settings, onChange }: {
    settings: MomentsSettings; onChange: (settings: MomentsSettings) => void;
}) {
    const { apiPresets, apiConfig } = useOS();
    const api = settings.independentApi || { baseUrl: '', apiKey: '', model: '' };
    const [models, setModels] = useState<string[]>([]);
    const [query, setQuery] = useState('');
    const [selectedPreset, setSelectedPreset] = useState('');
    const [busy, setBusy] = useState<'models' | 'test' | null>(null);
    const [status, setStatus] = useState('');
    const request = useRef<AbortController | null>(null);
    const cancel = () => { request.current?.abort(); request.current = null; setBusy(null); setStatus(''); };
    useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
    const changeApi = (next: Partial<APIConfig>) => {
        cancel();
        if (next.baseUrl !== undefined || next.apiKey !== undefined) { setModels([]); setQuery(''); }
        setSelectedPreset('');
        onChange({ ...settings, independentApi: { ...api, ...next } });
    };
    const run = async (kind: 'models' | 'test') => {
        cancel();
        let config: APIConfig;
        try {
            config = resolveMomentsApi({ ...settings, independentApiEnabled: true,
                independentApi: { ...api, model: kind === 'models' ? '__list__' : api.model } }, apiConfig);
        } catch (error: any) { setStatus(error.message); return; }
        const controller = new AbortController(); request.current = controller;
        setBusy(kind); setStatus(kind === 'models' ? '正在获取模型列表…' : '正在测试所选模型…');
        const timeout = window.setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch(`${config.baseUrl}/${kind === 'models' ? 'models' : 'chat/completions'}`, {
                method: kind === 'models' ? 'GET' : 'POST',
                headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
                signal: controller.signal,
                ...(kind === 'test' ? { body: JSON.stringify({ model: config.model, stream: false, max_tokens: 128,
                    messages: [{ role: 'system', content: '只输出一个合法JSON对象。' }, { role: 'user', content: '连接测试，请返回 {"ok":true}' }] }) } : {}),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}：${response.status === 401 || response.status === 403 ? '请检查 Key 和模型权限' : '请检查接口地址、模型或中转服务状态'}`);
            const data = await safeResponseJson(response);
            if (request.current !== controller) return;
            if (kind === 'models') {
                const entries = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
                const ids = [...new Set<string>(entries.map((entry: any) => typeof entry === 'string' ? entry : entry?.id || entry?.name).filter((id: unknown): id is string => typeof id === 'string' && !!id.trim()))].sort();
                setModels(ids);
                setStatus(ids.length ? `已获取 ${ids.length} 个模型，可搜索选择` : '接口未提供模型列表，可手动填写模型 ID');
            } else {
                if (!extractContent(data)?.trim()) throw new Error('接口已响应，但没有返回正文；请检查模型是否支持此接口');
                setStatus('连接成功，所选模型已返回正文。保存后生效。');
            }
        } catch (error: any) {
            if (request.current === controller) setStatus(error?.name === 'AbortError' ? '请求超时（30秒），请检查网络或稍后重试' : error?.message?.startsWith('HTTP ') || error?.message?.startsWith('接口已响应') ? error.message : '请求失败，请检查地址、网络及中转站是否允许浏览器跨域访问');
        } finally {
            window.clearTimeout(timeout);
            if (request.current === controller) { request.current = null; setBusy(null); }
        }
    };
    const field = 'w-full rounded-xl bg-slate-100 px-3 py-2 outline-none';
    const filtered = models.filter(id => id.toLowerCase().includes(query.toLowerCase()));
    return <section className="space-y-3">
        <label className="flex items-center justify-between gap-3"><span><b className="block">朋友圈独立 API</b><span className="text-xs text-slate-400">用于自动发帖、手动生成和发布动态后的评论；关闭则跟随全局。</span></span>
            <input type="checkbox" className="w-5 h-5 shrink-0" checked={!!settings.independentApiEnabled} onChange={e => { cancel(); onChange({ ...settings, independentApiEnabled: e.target.checked, independentApi: settings.independentApi || normalizeMomentsApi(apiConfig) }); }} /></label>
        {settings.independentApiEnabled && <>
            <label className="block">填入已有 API 预设<select aria-label="朋友圈 API 预设" className={`${field} mt-1`} value={selectedPreset} onChange={e => {
                const preset = apiPresets.find(p => p.id === e.target.value); if (!preset) return;
                cancel(); setModels([]); setQuery(''); setSelectedPreset(preset.id);
                onChange({ ...settings, independentApi: normalizeMomentsApi(preset.config) });
            }}><option value="">选择预设（复制 URL、Key 和模型）</option>{apiPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            {!apiPresets.length && <p className="text-xs text-slate-400">尚无已保存的 API 预设，也可以在下方直接填写。</p>}
            <label className="block">URL<input className={`${field} mt-1`} placeholder="https://你的中转站/v1" value={api.baseUrl} onChange={e => changeApi({ baseUrl: e.target.value })} autoCapitalize="none" spellCheck={false} /></label>
            <label className="block">Key<input type="password" autoComplete="off" className={`${field} mt-1`} value={api.apiKey} onChange={e => changeApi({ apiKey: e.target.value })} /></label>
            <label className="block">模型 ID<input className={`${field} mt-1`} placeholder="选择或手动输入模型 ID" value={api.model} onChange={e => changeApi({ model: e.target.value })} spellCheck={false} /></label>
            <div className="flex gap-2"><button type="button" disabled={!!busy} onClick={() => run('models')} className="flex-1 rounded-xl border p-2 disabled:opacity-40">{busy === 'models' ? '获取中…' : '获取模型列表'}</button><button type="button" disabled={!!busy} onClick={() => run('test')} className="flex-1 rounded-xl border p-2 disabled:opacity-40">{busy === 'test' ? '测试中…' : '测试连接'}</button></div>
            {!!models.length && <><input aria-label="搜索朋友圈模型" className={field} placeholder="搜索模型名称" value={query} onChange={e => setQuery(e.target.value)} /><div className="max-h-40 overflow-y-auto border rounded-xl">{filtered.length ? filtered.map(id => <button type="button" key={id} className={`block text-left w-full px-3 py-2 break-all ${api.model === id ? 'bg-emerald-50 text-emerald-700' : ''}`} onClick={() => changeApi({ model: id })}>{api.model === id ? '✓ ' : ''}{id}</button>) : <p className="p-3 text-slate-400">没有匹配模型，可手动填写 ID。</p>}</div></>}
            <p role="status" className="text-xs text-slate-500 break-words">{status}</p>
            <p className="text-xs text-slate-400">测试会发送一次简短请求，可能计费。更改后点击本页底部「保存」；不会修改原 API 预设或私聊配置。</p>
        </>}
    </section>;
}
