import React from 'react';
import { parseBiohazardHudState } from '../../../utils/biohazardHud';
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

export const StoryBiohazardRoundStatus: React.FC<{ content: string; theme: Theme }> = ({ content, theme }) => {
    const state = parseBiohazardHudState(content);
    const fields = worldlineFields(content);
    const labels = LABELS[theme];
    const objective = state?.objective || state?.tasks[0] || firstField(fields, ['队伍目标', '当前目标', '目标', '任务']) || '目标尚未明确';
    const location = state?.location || firstField(fields, ['当前地点', '地点', '位置']) || '地点未记录';
    const vitality = state?.status?.vitality || firstField(fields, ['身体状态', '身体', '体力', '伤势']) || '未记录';
    const pressure = state?.status?.pressure || firstField(fields, ['压力', '警戒', '风险']) || '未记录';
    const note = state?.status?.note || '';
    const indicator = state?.status?.indicator;

    return <section className={`story-bio-round story-bio-round-${theme}`} aria-label='本轮剧情状态'>
        <div className='story-bio-round-top'><span>{location}</span><span>本轮状态</span></div>
        <div className='story-bio-round-objective'><small>{labels.eyebrow}</small><strong>{objective}</strong>{note && <p>{note}</p>}</div>
        <div className='story-bio-round-heading'><strong>{labels.heading}</strong><span>STATUS / {theme === 'human' ? '01' : theme === 'variant' ? '02' : '03'}</span></div>
        <div className='story-bio-round-stats'><div><small>{labels.vitality}</small><span>{vitality}</span></div><div><small>{labels.pressure}</small><span>{pressure}</span></div></div>
        {indicator !== undefined && indicator !== null && <div className='story-bio-round-indicator'><small>状态读数 / VISUAL INDICATOR</small><div role='meter' aria-label='状态读数' aria-valuemin={0} aria-valuemax={100} aria-valuenow={indicator}><span style={{ width: `${indicator}%` }} /></div><p>读数仅在剧情明确给出时显示。</p></div>}
    </section>;
};

export default StoryBiohazardRoundStatus;
