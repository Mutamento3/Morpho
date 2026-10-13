import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StoryBiohazardRoundStatus from '../components/date/story/StoryBiohazardRoundStatus';

describe('biohazard per-round status', () => {
    it.each(['human', 'variant', 'umbrella'] as const)('renders %s status after a reply', theme => {
        const content = `<story_text>门外传来脚步声。</story_text><bio_state>${JSON.stringify({ location: '地下通道', objective: '找到出口', status: { vitality: '稳定', pressure: '警戒中', note: '门禁失效', indicator: null }, routes: [], inventory: [], tasks: [], log: [] })}</bio_state>`;
        const markup = renderToStaticMarkup(React.createElement(StoryBiohazardRoundStatus, { content, theme }));
        expect(markup).toContain(`story-bio-round-${theme}`);
        expect(markup).toContain('找到出口');
        expect(markup).toContain('生存记录');
        expect(markup.match(/role="tab"/g)).toHaveLength(3);
        expect(markup).toContain('门禁失效');
        expect(markup).not.toContain('role="meter"');
    });

    it('keeps this rounds time, logs and communications inside its own record', () => {
        const content = `<bio_state>${JSON.stringify({ location: '警局', storyTime: '第一日 09:32', log: ['已经找到备用钥匙'], communications: [{ sender: '无线电', time: '09:30', text: '东门暂时关闭' }] })}</bio_state>`;
        const markup = renderToStaticMarkup(React.createElement(StoryBiohazardRoundStatus, { content, theme: 'human' }));
        expect(markup).toContain('第一日 09:32');
        expect(markup).toContain('已经找到备用钥匙');
        expect(markup).toContain('无线电');
        expect(markup).toContain('东门暂时关闭');
        expect(markup.match(/hidden=""/g)).toHaveLength(2);
        expect(markup).not.toContain('世界线仍在镜头外前进');
    });

    it('shows known facts from older worldline-only replies', () => {
        const content = '<story_text>广播中断。</story_text><worldline>当前地点：酒店套房\n队伍目标：等待苏郁\n身体状态：受到惊吓，有些脱力</worldline>';
        const markup = renderToStaticMarkup(React.createElement(StoryBiohazardRoundStatus, { content, theme: 'human' }));
        expect(markup).toContain('酒店套房');
        expect(markup).toContain('等待苏郁');
        expect(markup).toContain('受到惊吓，有些脱力');
        expect(markup).toContain('未记录');
    });

    it('still shows an honest status card when a reply omits structured state', () => {
        const markup = renderToStaticMarkup(React.createElement(StoryBiohazardRoundStatus, { content: '<story_text>广播中断。</story_text>', theme: 'human' }));
        expect(markup).toContain('目标尚未明确');
        expect(markup).toContain('地点未记录');
        expect(markup).not.toContain('role="meter"');
    });
});
