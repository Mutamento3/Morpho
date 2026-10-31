import { isHalloweenActive, useHalloweenActive, visibleAvatarStyle } from '../../utils/halloweenEvent';
import React, { useRef, useState } from 'react';
import { BubbleStyle } from '../../types';
import { processImage } from '../../utils/file';

const presets = [
    { name: '南瓜黑猫', file: 'halloween-cats', scale: 1.5, y: 50 },
    { name: '幽灵巫师帽', file: 'halloween-ghosts', scale: 1.6, y: 32 },
];
const checker = { backgroundColor: '#f8fafc', backgroundImage: 'conic-gradient(#e2e8f0 25%, transparent 0 50%, #e2e8f0 0 75%, transparent 0)', backgroundSize: '16px 16px' };

export default function AvatarFrameEditor({ style, avatar, onChange, onError }: {
    style: BubbleStyle; avatar?: string;
    onChange: (patch: Partial<BubbleStyle>) => void; onError: (message: string) => void;
}) {
    const eventActive = useHalloweenActive();
    style = visibleAvatarStyle(style);
    const [busy, setBusy] = useState(false);
    const [dark, setDark] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const load = async (file: File, preset?: typeof presets[number]) => {
        if (file.type !== 'image/png') { onError('请上传透明底 PNG 图片'); return; }
        if (file.size > 8 * 1024 * 1024) { onError('头像框请控制在 8 MB 以内'); return; }
        setBusy(true);
        try {
            const image = await processImage(file, { maxWidth: 1200 });
            if (preset && !isHalloweenActive()) { onError('万圣节限定头像框活动已结束'); return; }
            onChange({ avatarDecorationEvent: preset ? 'halloween-2026' : undefined, avatarDecoration: image, avatarDecorationScale: preset?.scale ?? 1.5, avatarDecorationX: 50, avatarDecorationY: preset?.y ?? 50, avatarDecorationRotate: 0 });
        } catch { onError('头像框读取失败，请重新选择 PNG 图片'); }
        finally { setBusy(false); }
    };
    const choosePreset = async (preset: typeof presets[number]) => {
        if (!isHalloweenActive()) { onError('万圣节限定头像框活动已结束'); return; }
        setBusy(true);
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}avatar-frames/${preset.file}.png`);
            if (!response.ok) throw new Error();
            await load(new File([await response.blob()], `${preset.file}.png`, { type: 'image/png' }), preset);
        } catch { onError('内置头像框加载失败，请稍后重试'); }
        finally { setBusy(false); }
    };
    const render = (size: number) => <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div className="w-full h-full rounded-full overflow-hidden bg-slate-400 flex items-center justify-center text-white">
            {avatar ? <img src={avatar} alt="头像预览" className="w-full h-full object-cover" /> : <span>头像</span>}
        </div>
        {style.avatarDecoration && <img src={style.avatarDecoration} alt="头像框预览" className="absolute max-w-none pointer-events-none" style={{ width: size * (style.avatarDecorationScale ?? 1), height: 'auto', left: `${style.avatarDecorationX ?? 50}%`, top: `${style.avatarDecorationY ?? 50}%`, transform: `translate(-50%, -50%) rotate(${style.avatarDecorationRotate ?? 0}deg)` }} />}
    </div>;
    const sliders: { key: keyof BubbleStyle; label: string; min: number; max: number; step: number; fallback: number; unit: string }[] = [
        { key: 'avatarDecorationScale', label: '头像框大小', min: 0.5, max: 3, step: 0.05, fallback: 1, unit: '倍' },
        { key: 'avatarDecorationX', label: '水平位置', min: -50, max: 150, step: 1, fallback: 50, unit: '%' },
        { key: 'avatarDecorationY', label: '垂直位置', min: -50, max: 150, step: 1, fallback: 50, unit: '%' },
        { key: 'avatarDecorationRotate', label: '旋转角度', min: -180, max: 180, step: 1, fallback: 0, unit: '°' },
    ];
    return <div className="space-y-4">
        <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-xs text-orange-900 leading-relaxed">
            <b>{eventActive ? '万圣节 · 头像框' : '自定义头像框'}</b><br />上传透明底 PNG 图。中间请留透明区域，头像会显示在框的下方。用户与角色可分别设置，保存主题后给角色穿戴。
        </div>
        {eventActive && <p className="text-xs text-orange-700">内置限定款开放至北京时间 11 月 2 日 23:59，结束后入口与穿戴效果一并下线。</p>}
        <div className="grid grid-cols-2 gap-3">
            {(eventActive ? presets : []).map(p => <button key={p.file} disabled={busy} onClick={() => choosePreset(p)} className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600 disabled:opacity-50">
                <img src={`${import.meta.env.BASE_URL}avatar-frames/${p.file}.png`} alt={p.name} className="w-20 h-20 object-contain mx-auto mb-2 rounded-lg" style={checker} />{p.name}
            </button>)}
        </div>
        <div className="flex gap-2">
            <button disabled={busy} onClick={() => input.current?.click()} className="flex-1 rounded-xl bg-slate-100 py-3 text-xs font-semibold text-slate-600 disabled:opacity-50">{busy ? '正在读取…' : '上传透明底 PNG（≤ 8 MB）'}</button>
            <button disabled={busy || !style.avatarDecoration} onClick={() => onChange({ avatarDecoration: undefined, avatarDecorationEvent: undefined })} className="rounded-xl px-3 text-xs text-red-500 disabled:opacity-40">移除</button>
            <input ref={input} type="file" accept="image/png,.png" className="hidden" onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void load(file); }} />
        </div>
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex justify-between p-3 text-xs text-slate-500 bg-white"><span>实时预览 · 不改变头像原图</span><button onClick={() => setDark(!dark)}>切换{dark ? '浅色' : '深色'}底</button></div>
            <div className="flex items-center justify-center gap-12 py-20 px-8 overflow-hidden" style={{ background: dark ? '#18202c' : '#f1f5f9', minHeight: 260 }}>
                {render(96)}{render(36)}
            </div>
            <p className="px-3 py-2 bg-white text-[10px] text-slate-400">左侧放大调试，右侧参考聊天尺寸；实际随头像大小同比例缩放。</p>
        </div>
        {style.avatarDecoration && <div className="space-y-5 rounded-xl border border-slate-200 p-4">
            {sliders.map(s => <label key={s.key} className="block text-xs text-slate-500">
                <span className="flex justify-between mb-2"><span>{s.label}</span><span>{Number(style[s.key] ?? s.fallback).toFixed(s.step < 1 ? 2 : 0)} {s.unit}</span></span>
                <input aria-label={s.label} type="range" min={s.min} max={s.max} step={s.step} value={Number(style[s.key] ?? s.fallback)} disabled={busy} onChange={e => onChange({ [s.key]: Number(e.target.value) })} className="w-full accent-orange-400" />
            </label>)}
            <button onClick={() => onChange({ avatarDecorationX: 50, avatarDecorationY: 50, avatarDecorationScale: 1.5, avatarDecorationRotate: 0 })} className="text-xs text-slate-500">重置大小与位置</button>
        </div>}
    </div>;
}
