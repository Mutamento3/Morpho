import React, { useId, useState } from 'react';
import { parseBiohazardHudState, resolveBiohazardMembers, type BiohazardRosterMember } from '../../../utils/biohazardHud';
import { parseStoryDisplayBlocks } from '../../../utils/storyTheater';

type Theme = 'human' | 'variant' | 'umbrella';

const LABELS: Record<Theme, { eyebrow: string; heading: string; vitality: string; pressure: string }> = {
    human: { eyebrow: 'CURRENT OBJECTIVE', heading: '身体与警戒', vitality: '体力', pressure: '压力' },
    variant: { eyebrow: 'CASE FILE / ACTIVE LEAD', heading: '观察记录', vitality: '身体反应', pressure: '追踪压力' },
    umbrella: { eyebrow: 'PRIORITY DIRECTIVE', heading: '终端监控', vitality: '体征', pressure: '暴露风险' },
};

const worldlineFields = (content: string): Record<string, string> => {
    const worldline = parseStoryDisplayBlocks(content).find(block => block.kind === 'worldline')?.text || '';
    const fields: Record<string, string> = {};
    for (const line of worldline.split(/\r?\n/)) {
        const match = line.trim().match(/^([^：:]{2,12})[：:]\s*(.+)$/);
        if (match) fields[match[1].trim()] = match[2].trim();
    }
    return fields;
};

const firstField = (fields: Record<string, string>, names: string[]): string => {
    const key = Object.keys(fields).find(label => names.some(name => label.includes(name)));
    return key ? fields[key] : '';
};

export const StoryBiohazardRoundStatus: React.FC<{ content: string; theme: Theme; timestamp?: number; roster?: BiohazardRosterMember[] }> = ({ content, theme, timestamp, roster }) => {
    const [tab, setTab] = useState<'status' | 'log' | 'communications'>('status');
    const panelId = useId();
    const state = parseBiohazardHudState(content);
    const fields = worldlineFields(content);
    const labels = LABELS[theme];
    const objective = state?.objective || state?.tasks[0] || firstField(fields, ['队伍目标', '当前目标', '目标', '任务']) || '目标尚未明确';
    const location = state?.location || firstField(fields, ['当前地点', '地点', '位置']) || '地点未记录';
    const vitality = state?.status?.vitality || firstField(fields, ['身体状态', '身体', '体力', '伤势']) || '未记录';
    const pressure = state?.status?.pressure || firstField(fields, ['压力', '警戒', '风险']) || '未记录';
    const note = state?.status?.note || '';
    const members = resolveBiohazardMembers(state, roster || state?.members || [{ id: 'user', name: '你' }]);
    const storyTime = state?.storyTime || firstField(fields, ['时间', '日期']);
    const recordedAt = timestamp && Number.isFinite(timestamp) ? new Date(timestamp) : null;
    const log = state?.log.length ? state.log : Object.entries(fields).map(([label, value]) => `${label}：${value}`);
    const communications = state?.communications || [];
    const tabs = [{ id: 'status', label: '状态', icon: '+' }, { id: 'log', label: '日志', icon: '≡' }, { id: 'communications', label: '通讯', icon: '◎' }] as const;

    return <section className={`story-bio-round story-bio-round-${theme}`} aria-label='本轮生存记录'>
        <header className='story-bio-record-header'><small>SURVIVAL CHANNEL / {theme === 'human' ? '01' : theme === 'variant' ? '02' : '03'}</small><h2>生存记录</h2><p>{storyTime ? `剧情时间 · ${storyTime}` : recordedAt && !Number.isNaN(recordedAt.getTime()) ? <>记录于 <time dateTime={recordedAt.toISOString()}>{recordedAt.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</time></> : '本轮时间未记录'}</p></header>
        <div className='story-bio-round-top'><span>{location}</span><span>{state?.alert || '态势未记录'}</span></div>
        <div className='story-bio-round-objective'><small>{labels.eyebrow}</small><strong>{objective}</strong>{note && <p>{note}</p>}</div>
        {!!state?.tags?.length && <div className='story-bio-record-tags'>{state.tags.map((tag, index) => <span key={index}>{tag}</span>)}</div>}
        <div className='story-bio-record-tabs' role='tablist' aria-label='生存记录栏目' onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()}>
            {tabs.map((item, index) => <button key={item.id} type='button' role='tab' id={`${panelId}-${item.id}-tab`} aria-controls={`${panelId}-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => {
                const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault(); setTab(tabs[next].id);
                (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
            }}><span aria-hidden='true'>{item.icon}</span>{item.label}</button>)}
        </div>
        <div role='tabpanel' id={`${panelId}-status`} aria-labelledby={`${panelId}-status-tab`} hidden={tab !== 'status'}>
        <div className='story-bio-round-heading'><strong>{labels.heading}</strong><span>STATUS / {theme === 'human' ? '01' : theme === 'variant' ? '02' : '03'}</span></div>
        <div className='story-bio-party'>
            {members.map(person => <section className='story-bio-member' key={person.id} aria-label={person.name + '的状态'}>
                <h3>{person.name}<small>{person.id === 'user' ? 'USER' : 'CHAR'}</small></h3>
                <div className='story-bio-round-stats'>
                    {([{ key: 'vitality', label: '体力', value: person.vitality }, { key: 'pressure', label: '压力', value: person.pressure }] as const).map(item => <div key={item.key} className={'story-bio-member-metric story-bio-member-' + item.key}>
                        <small>{item.label}</small><strong>{item.value.value === null ? '未记录' : <>{item.value.value}<small> / 100</small></>}</strong>
                        {item.value.value !== null && <div className='story-bio-member-meter' role='meter' aria-label={person.name + '的' + item.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.value.value}><i style={{ width: item.value.value + '%' }} /></div>}
                        {item.value.text && <p>{item.value.text}</p>}
                    </div>)}
                </div>
            </section>)}
        </div>
        {!state?.members?.length && (vitality !== '未记录' || pressure !== '未记录') && <p className='story-bio-legacy-note'>旧版队伍记录：{vitality}；{pressure}。本轮未保存逐人数值。</p>}
        </div>
        <div role='tabpanel' id={`${panelId}-log`} aria-labelledby={`${panelId}-log-tab`} hidden={tab !== 'log'}>
            <div className='story-bio-round-heading'><strong>本轮日志</strong><span>LOG / 02</span></div>
            <div className='story-bio-record-entries'>{log.length ? log.map((entry, index) => <p key={index}>{entry}</p>) : <p>本轮暂无日志记录。</p>}</div>
        </div>
        <div role='tabpanel' id={`${panelId}-communications`} aria-labelledby={`${panelId}-communications-tab`} hidden={tab !== 'communications'}>
            <div className='story-bio-round-heading'><strong>通讯记录</strong><span>COMMS / 03</span></div>
            <div className='story-bio-record-entries'>{communications.length ? communications.map((entry, index) => <article key={index}><div><strong>{entry.sender}</strong>{entry.time && <span>{entry.time}</span>}</div><p>{entry.text}</p></article>) : <p>本轮暂无通讯记录。</p>}</div>
        </div>
    </section>;
};

export default StoryBiohazardRoundStatus;
