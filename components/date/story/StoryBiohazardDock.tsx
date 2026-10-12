import React, { useEffect, useMemo, useState } from 'react';
import { X } from '@phosphor-icons/react';
import type { Message, StoryTheaterPresetDocument } from '../../../types';
import { BIO_ITEM_CATEGORIES, parseBiohazardHudState } from '../../../utils/biohazardHud';
import StoryBiohazardMap from './StoryBiohazardMap';

type Panel = 'map' | 'inventory' | 'tasks';

const PANELS: Array<{ id: Panel; label: string; file: string }> = [
    { id: 'map', label: '地图', file: 'map.png' },
    { id: 'inventory', label: '背包', file: 'inventory.png' },
    { id: 'tasks', label: '当前任务', file: 'tasks.png' },
];

interface Props {
    document: StoryTheaterPresetDocument;
    messages: Message[];
}

const StoryBiohazardDock: React.FC<Props> = ({ document, messages }) => {
    const [open, setOpen] = useState<Panel | null>(null);
    const [selectedItem, setSelectedItem] = useState<number | null>(null);
    const phaseId = document.prompts.find(prompt => prompt.enabled && prompt.id.startsWith('bio-v1-stage-'))?.id;
    const factionId = document.prompts.find(prompt => prompt.enabled && prompt.id.startsWith('bio-v1-faction-'))?.id;
    const theme = factionId === 'bio-v1-faction-umbrella' ? 'umbrella' : factionId === 'bio-v1-faction-variant' ? 'variant' : 'human';
    const phase = phaseId === 'bio-v1-stage-apocalypse' ? '末世' : phaseId === 'bio-v1-stage-spread' ? '扩散' : '初期';
    const state = useMemo(() => {
        for (let index = messages.length - 1; index >= 0; index--) {
            if (messages[index].role !== 'assistant') continue;
            const parsed = parseBiohazardHudState(messages[index].content);
            if (parsed) return parsed;
        }
        return null;
    }, [messages]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(null); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open]);

    const section = PANELS.find(item => item.id === open);
    const entries = state?.tasks;
    const inventory = state?.inventory || [];
    const selected = selectedItem === null ? null : inventory[selectedItem];

    return <>
        <nav className='story-bio-tools' aria-label='生化危机剧情工具'>
            {PANELS.map(item => <button key={item.id} type='button' aria-label={`打开${item.label}`} title={item.label} onClick={() => { setSelectedItem(null); setOpen(item.id); }}>
                <img src={`${import.meta.env.BASE_URL}story-biohazard/${item.file}`} alt='' />
            </button>)}
        </nav>
        {open && <div className='story-bio-shade' onClick={event => { if (event.target === event.currentTarget) setOpen(null); }}>
            <section className={`story-bio-panel story-bio-panel-${theme}`} role='dialog' aria-modal='true' aria-label={`生化危机${section?.label}`} onClick={event => event.stopPropagation()}>
                <header><div><small>WORLD / {phase} · {theme === 'umbrella' ? '保护伞卧底' : theme === 'variant' ? '变异者' : '普通人'}</small><h2>{section?.label}</h2></div><button type='button' aria-label='关闭面板' onClick={event => { event.stopPropagation(); setOpen(null); }}><X size={18} /></button></header>
                {open === 'map' && <StoryBiohazardMap />}
                {open === 'inventory' ? <div className='story-bio-inventory'>
                    <div className='story-bio-inventory-meta'><span>随身背包 / 20 格</span><span>{inventory.length} / 20</span></div>
                    <div className='story-bio-inventory-grid' aria-label='背包物品格'>
                        {Array.from({ length: 20 }, (_, index) => {
                            const item = inventory[index];
                            if (!item) return <div key={index} className='story-bio-slot story-bio-slot-empty' aria-hidden='true'><span>{String(index + 1).padStart(2, '0')}</span></div>;
                            return <button key={index} type='button' className={`story-bio-slot ${selectedItem === index ? 'story-bio-slot-selected' : ''}`} title={item.detail || item.name} aria-label={`${item.name}${item.quantity > 1 ? `，${item.quantity} 个` : ''}`} onClick={() => setSelectedItem(index)}>
                                <span className='story-bio-slot-image'>{item.category ? <img loading='lazy' src={`${import.meta.env.BASE_URL}story-biohazard/items/${item.category}.png`} alt='' /> : <span className='story-bio-no-art'>未分类</span>}</span>
                                <span className='story-bio-slot-name'>{item.name}</span>
                                {item.quantity > 1 && <span className='story-bio-slot-count'>×{item.quantity}</span>}
                            </button>;
                        })}
                    </div>
                    {selected && <div className='story-bio-item-detail'><strong>{selected.name}</strong><span>{selected.category ? BIO_ITEM_CATEGORIES[selected.category] : '未归类物品'} · 数量 {selected.quantity}</span>{selected.detail && <p>{selected.detail}</p>}</div>}
                    {!inventory.length && <p className='story-bio-empty'>第一轮剧情后，这里会出现实际随身携带的物品。</p>}
                </div> : open === 'tasks' && <div className='story-bio-panel-list'>{entries?.length ? entries.map((entry, index) => <div key={`${index}-${entry}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{entry}</p></div>) : <p className='story-bio-empty'>第一轮剧情后，这里会列出当前仍需处理的任务。</p>}</div>}
                <footer>{open === 'map' ? '浣熊市区域总览 · 示意地图' : '随剧情更新 · 未知信息不会提前显示'}</footer>
            </section>
        </div>}
    </>;
};

export const StoryBiohazardLogBar: React.FC<{ messages: Message[] }> = ({ messages }) => {
    const log = useMemo(() => {
        for (let index = messages.length - 1; index >= 0; index--) {
            if (messages[index].role !== 'assistant') continue;
            const state = parseBiohazardHudState(messages[index].content);
            if (state) return state.log;
        }
        return [];
    }, [messages]);
    return <details className='story-bio-log-bar'>
        <summary>日志 <span>{log.length ? `${log.length} 条记录` : '暂无记录'}</span></summary>
        <div>{log.length ? log.map((entry, index) => <p key={`${index}-${entry}`}>{entry}</p>) : <p>第一轮剧情后，这里会留下已发现的线索。</p>}</div>
    </details>;
};

export default StoryBiohazardDock;
