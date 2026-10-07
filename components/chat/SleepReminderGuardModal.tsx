import React, { useState } from 'react';
import type { CharacterProfile } from '../../types';
import { DEFAULT_SLEEP_REMINDER_BOUNDARIES } from '../../utils/sleepReminderGuard';

export default function SleepReminderGuardModal({ char, onClose, onSave }: {
    char: CharacterProfile;
    onClose: () => void;
    onSave: (settings: NonNullable<CharacterProfile['sleepReminderGuard']>) => void;
}) {
    const [enabled, setEnabled] = useState(!!char.sleepReminderGuard?.enabled);
    const [boundaries, setBoundaries] = useState(char.sleepReminderGuard?.boundaries || DEFAULT_SLEEP_REMINDER_BOUNDARIES);
    return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/40 p-5" onClick={onClose}>
        <section role="dialog" aria-modal="true" aria-labelledby="sleep-guard-title" className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 text-slate-700 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 id="sleep-guard-title" className="text-lg font-bold">防催睡</h2><button type="button" onClick={onClose} className="px-3 py-2" aria-label="关闭防催睡设置">关闭</button></div>
            <p className="mt-2 text-xs leading-5 text-slate-500">仅用于与 {char.name} 的私聊，保存后从下一次回复生效。你主动想睡或需要晚安时，仍可正常回应。</p>
            <label className="my-4 flex items-center justify-between rounded-xl bg-violet-50 p-3 font-medium">开启防催睡<input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="h-5 w-5 accent-violet-500" /></label>
            <label className="block text-sm font-semibold" htmlFor="sleep-guard-boundaries">互动边界</label>
            <textarea id="sleep-guard-boundaries" value={boundaries} onChange={event => setBoundaries(event.target.value)} className="mt-2 min-h-[240px] w-full rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-violet-400" />
            <button type="button" onClick={() => setBoundaries(DEFAULT_SLEEP_REMINDER_BOUNDARIES)} className="mt-2 text-xs text-violet-600">恢复默认边界</button>
            <button type="button" onClick={() => onSave({ enabled, boundaries: boundaries.trim() || DEFAULT_SLEEP_REMINDER_BOUNDARIES })} className="mt-4 w-full rounded-xl bg-violet-500 py-3 font-semibold text-white">保存</button>
        </section>
    </div>;
}
