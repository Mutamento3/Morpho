import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, FileArrowUp, MagicWand, X } from '@phosphor-icons/react';
import { isPaperWallpaper, useOS } from '../../context/OSContext';
import { CharacterProfile } from '../../types';
import { DB } from '../../utils/db';

type ChatStat = {
  character: CharacterProfile;
  messageCount: number;
  firstMessageAt?: number;
};

type AnniversaryWidgetSettings = {
  characterId?: string;
  css?: string;
};

const SETTINGS_ASSET_KEY = 'launcher_anniversary_widget_settings_v1';

const BUILTIN_CSS = `/* 相识纪念卡默认样式 */
.morpho-anniversary-widget {
  --anniversary-accent: #9b7181;
  --anniversary-soft: rgba(210, 174, 189, .24);
}
.morpho-anniversary-days {
  font-family: Georgia, "Times New Roman", serif;
  letter-spacing: -.06em;
}`;

const AI_PROMPT = `请为 Morpho 手机桌面的“相识纪念卡”写一套 CSS 美化。

要求：
1. 只输出 CSS，不要 Markdown 代码框、解释或 HTML。
2. 卡片位于手机桌面的方形小组件中，文字必须清晰，不能溢出或遮挡。
3. 可以使用渐变、边框、阴影、纹理、伪元素和轻微动画，但不要加载外部字体或图片。
4. 请只使用下面这些选择器，不要修改 body、html 或其他页面元素：
   .morpho-anniversary-widget  整张卡片
   .morpho-anniversary-avatar  角色头像
   .morpho-anniversary-kicker  “ACQUAINTED WITH”小字
   .morpho-anniversary-name    角色名
   .morpho-anniversary-copy    “我们已经相识”
   .morpho-anniversary-days    天数大字
   .morpho-anniversary-unit    “DAYS / 天”
   .morpho-anniversary-since   相识日期
   .morpho-anniversary-edit    右上角编辑按钮
   .morpho-anniversary-orbit   装饰圆环
5. 可在 .morpho-anniversary-widget 中定义并使用：
   --anniversary-accent（主色）
   --anniversary-soft（浅色）
6. 必须兼顾 160px 左右的小尺寸，不要隐藏角色名、天数和相识日期。

请直接输出一套完整 CSS。`;

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
};

const parseMemoryDate = (raw?: string): Date | null => {
  if (!raw) return null;
  const ymd = raw.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (ymd) {
    const date = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const resolveKnownSince = (character: CharacterProfile, firstMessageAt?: number): Date => {
  const memoryDates = (character.memories || [])
    .map(memory => parseMemoryDate(memory.date))
    .filter((date): date is Date => !!date)
    .sort((a, b) => a.getTime() - b.getTime());
  if (memoryDates[0]) return memoryDates[0];
  if (firstMessageAt) return new Date(firstMessageAt);
  return new Date();
};

const localDayNumber = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

const formatDate = (date: Date) =>
  `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

const AnniversarySquareWidget: React.FC<{ contentColor: string }> = ({ contentColor }) => {
  const { characters, theme, lastMsgTimestamp, isDataLoaded } = useOS();
  const [stats, setStats] = useState<ChatStat[]>([]);
  const [settings, setSettings] = useState<AnniversaryWidgetSettings>({ css: BUILTIN_CSS });
  const [draftCharacterId, setDraftCharacterId] = useState('auto');
  const [draftCss, setDraftCss] = useState(BUILTIN_CSS);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const importRef = useRef<HTMLInputElement>(null);

  const paper = theme.skin !== 'animalcrossing'
    && theme.skin !== 'mobilegame'
    && theme.skin !== 'tamagotchi'
    && isPaperWallpaper(theme.wallpaper);

  useEffect(() => {
    let alive = true;
    DB.getAssetRaw(SETTINGS_ASSET_KEY)
      .then((saved) => {
        if (!alive || !saved || typeof saved !== 'object') return;
        const next = saved as AnniversaryWidgetSettings;
        setSettings({
          characterId: typeof next.characterId === 'string' ? next.characterId : undefined,
          css: typeof next.css === 'string' ? next.css : BUILTIN_CSS,
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isDataLoaded) return;
    let alive = true;
    setLoading(true);
    Promise.all((characters || []).map(async (character): Promise<ChatStat> => {
      try {
        const messages = await DB.getMessagesByCharId(character.id, true);
        const visible = messages.filter(message => !message.groupId && message.role !== 'system');
        return {
          character,
          messageCount: visible.length,
          firstMessageAt: visible.reduce<number | undefined>((earliest, message) => {
            if (!message.timestamp) return earliest;
            return earliest === undefined ? message.timestamp : Math.min(earliest, message.timestamp);
          }, undefined),
        };
      } catch {
        return { character, messageCount: 0 };
      }
    })).then((next) => {
      if (!alive) return;
      setStats(next);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [characters, isDataLoaded, lastMsgTimestamp]);

  const autoStat = useMemo(() => [...stats].sort((a, b) => {
    if (b.messageCount !== a.messageCount) return b.messageCount - a.messageCount;
    return (a.character.name || '').localeCompare(b.character.name || '', 'zh-CN');
  })[0], [stats]);

  const selectedStat = useMemo(() => {
    if (settings.characterId) {
      const manual = stats.find(item => item.character.id === settings.characterId);
      if (manual) return manual;
    }
    return autoStat;
  }, [autoStat, settings.characterId, stats]);

  const knownSince = useMemo(
    () => selectedStat ? resolveKnownSince(selectedStat.character, selectedStat.firstMessageAt) : new Date(),
    [selectedStat],
  );
  const days = Math.max(1, Math.floor((localDayNumber(new Date()) - localDayNumber(knownSince)) / 86400000) + 1);

  const openEditor = () => {
    setDraftCharacterId(settings.characterId || 'auto');
    setDraftCss(settings.css ?? BUILTIN_CSS);
    setOpen(true);
  };

  const save = async () => {
    const next: AnniversaryWidgetSettings = {
      characterId: draftCharacterId === 'auto' ? undefined : draftCharacterId,
      css: draftCss,
    };
    setSettings(next);
    try { await DB.saveAssetRaw(SETTINGS_ASSET_KEY, next); } catch {}
    setOpen(false);
  };

  const importTxt = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const css = (await file.text()).replace(/^\uFEFF/, '');
      if (css.trim()) setDraftCss(css);
    } finally {
      event.target.value = '';
    }
  };

  const handleCopyPrompt = async () => {
    if (!(await copyText(AI_PROMPT))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const character = selectedStat?.character;
  const cardBackground = paper
    ? 'linear-gradient(145deg, rgba(238,234,226,.82), rgba(220,214,204,.68))'
    : 'linear-gradient(145deg, rgba(255,255,255,.84), rgba(244,232,238,.74))';
  const cardText = paper ? '#51483d' : '#4a3440';

  return (
    <>
      <style>{settings.css || ''}</style>
      <button
        type="button"
        onClick={openEditor}
        className="morpho-anniversary-widget relative h-full w-full overflow-hidden rounded-[1.75rem] p-3 text-left animate-fade-in transition-transform active:scale-[.98]"
        style={{
          background: cardBackground,
          border: paper ? '1px solid rgba(91,72,51,.10)' : '1px solid rgba(124,81,100,.14)',
          boxShadow: paper ? '0 5px 16px rgba(91,72,51,.08)' : '0 9px 25px rgba(103,68,85,.14)',
          color: cardText,
        }}
      >
        <span className="morpho-anniversary-orbit pointer-events-none absolute -right-7 -top-7 h-24 w-24 rounded-full border border-current opacity-[.08]" />
        <span className="morpho-anniversary-orbit pointer-events-none absolute -bottom-5 right-6 h-14 w-14 rounded-full bg-[var(--anniversary-soft)] opacity-70" />
        <span className="morpho-anniversary-edit absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white/45 opacity-65">
          <MagicWand size={12} weight="bold" />
        </span>

        {character ? (
          <span className="relative z-10 flex h-full flex-col">
            <span className="flex items-center gap-2 pr-7">
              <span className="morpho-anniversary-avatar h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-white/50 bg-white/45 shadow-sm">
                {character.avatar
                  ? <img src={character.avatar} alt="" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-sm font-bold opacity-50">{character.name?.slice(0, 1) || '?'}</span>}
              </span>
              <span className="min-w-0">
                <span className="morpho-anniversary-kicker block text-[7px] font-semibold uppercase tracking-[.2em] opacity-45">Acquainted with</span>
                <span className="morpho-anniversary-name block truncate text-[12px] font-bold">{character.name}</span>
              </span>
            </span>
            <span className="mt-auto">
              <span className="morpho-anniversary-copy block text-[9px] font-medium opacity-55">我们已经相识</span>
              <span className="mt-[-2px] flex items-end gap-1">
                <span className="morpho-anniversary-days max-w-full truncate text-[38px] font-semibold leading-none">{days}</span>
                <span className="morpho-anniversary-unit mb-[3px] text-[7px] font-bold uppercase tracking-[.16em] opacity-45">Days · 天</span>
              </span>
              <span className="morpho-anniversary-since mt-1 block text-[7px] tracking-[.12em] opacity-42">SINCE {formatDate(knownSince)}</span>
            </span>
          </span>
        ) : (
          <span className="relative z-10 flex h-full flex-col items-center justify-center text-center" style={{ color: contentColor }}>
            <span className="text-2xl opacity-45">∞</span>
            <span className="mt-2 text-[11px] font-bold">相识纪念</span>
            <span className="mt-1 text-[8px] opacity-45">{loading ? '正在整理共同时间…' : '开始聊天后会自动记录'}</span>
          </span>
        )}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/35 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <section
            className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#fbf8f5] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 text-slate-800 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-300" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[.28em] text-[#a47687]">Anniversary styling</div>
                <h2 className="mt-1 text-xl font-bold">相识纪念卡</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">默认读取聊天最多的角色，并从最早一条记忆开始计日。</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
                <X size={18} />
              </button>
            </div>

            <label className="mt-5 block text-[11px] font-bold text-slate-500">纪念对象</label>
            <select
              value={draftCharacterId}
              onChange={event => setDraftCharacterId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#eadde2] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#b98598]"
            >
              <option value="auto">自动 · 聊天内容最多</option>
              {stats.map(item => <option key={item.character.id} value={item.character.id}>{item.character.name}</option>)}
            </select>

            <button
              type="button"
              onClick={handleCopyPrompt}
              className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-[#eadde2] bg-gradient-to-r from-[#f9edf2] to-[#f4eef8] px-4 py-3 text-left active:scale-[.99]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#a47687] shadow-sm">
                {copied ? <Check size={17} weight="bold" /> : <Copy size={17} weight="bold" />}
              </span>
              <span>
                <span className="block text-xs font-bold text-[#765160]">{copied ? '提示词已复制' : '复制美化提示词给 AI'}</span>
                <span className="mt-0.5 block text-[10px] text-[#aa8b97]">说出你想要的风格，再把生成的 CSS 粘回来</span>
              </span>
            </button>

            <div className="mt-5 flex items-center justify-between gap-3">
              <label className="text-[11px] font-bold text-slate-500">自定义 CSS</label>
              <div className="flex items-center gap-1">
                <input ref={importRef} type="file" accept=".txt,text/plain,text/css" className="hidden" onChange={importTxt} />
                <button type="button" onClick={() => importRef.current?.click()} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-[#a47687] hover:bg-[#f6e9ee]">
                  <FileArrowUp size={12} /> 导入 TXT
                </button>
                <button type="button" onClick={() => setDraftCss(BUILTIN_CSS)} className="rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-400 hover:bg-slate-100">恢复默认</button>
              </div>
            </div>
            <textarea
              value={draftCss}
              onChange={event => setDraftCss(event.target.value)}
              rows={9}
              spellCheck={false}
              placeholder="把 AI 生成的 CSS 粘贴到这里"
              className="mt-2 w-full resize-y rounded-2xl border border-slate-700 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 outline-none focus:border-[#bd8198]"
            />
            <button type="button" onClick={save} className="mt-4 flex w-full items-center justify-center rounded-2xl bg-[#30242a] py-3.5 text-sm font-bold text-white shadow-lg active:scale-[.99]">
              保存纪念卡
            </button>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
};

export default AnniversarySquareWidget;
