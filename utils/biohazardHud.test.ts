import { describe, expect, it } from 'vitest';
import { parseBiohazardHudState, resolveBiohazardMembers, biohazardRosterSnapshot, buildBiohazardPartyGuide } from './biohazardHud';
import { parseStoryDisplayBlocks } from './storyTheater';

describe('biohazard story tools', () => {
    it('matches scores by identity, preserves zero, and keeps historical rosters', () => {
        const roster = [{ id: 'user', name: '同名' }, { id: 'char:a', name: '同名' }];
        const state = parseBiohazardHudState('<bio_state>{"members":[{"id":"char:a","name":"同名","vitality":{"value":140},"pressure":{"value":0}},{"id":"user","name":"同名","vitality":{"value":65},"pressure":{"value":40}}]}</bio_state>');
        const people = resolveBiohazardMembers(state, roster);
        expect(people.map(p => [p.vitality.value, p.pressure.value])).toEqual([[65, 40], [100, 0]]);
        const missing = resolveBiohazardMembers(state, [{ id: 'char:new', name: '同名' }]);
        expect(missing[0].vitality.value).toBeNull();
        expect(biohazardRosterSnapshot(roster, [...roster, { id: 'char:new', name: '新人' }])).toEqual(roster);
        expect(buildBiohazardPartyGuide(roster)).toContain(JSON.stringify(roster));
    });
    it('keeps state out of prose and accepts older string inventories', () => {
        const message = '<story_text>广播突然停了。</story_text><worldline>地点：北侧街区</worldline><bio_state>{"location":"北侧街区","routes":["警局入口待确认"],"inventory":["手电电量半格"],"log":["已确认：广播曾重复三次"]}</bio_state>';
        expect(parseBiohazardHudState(message)).toEqual({ location: '北侧街区', routes: ['警局入口待确认'], inventory: [{ category: null, name: '手电电量半格', quantity: 1, detail: '' }], tasks: [], log: ['已确认：广播曾重复三次'] });
        const blocks = parseStoryDisplayBlocks(message);
        expect(blocks.map(block => block.kind)).toEqual(['story', 'worldline']);
        expect(blocks.map(block => block.text).join(' ')).not.toContain('bio_state');
        expect(parseStoryDisplayBlocks('<bio_state>{"location":"北侧街区"}</bio_state>')).toEqual([]);
    });

    it('keeps specific names distinct while reusing category artwork', () => {
        const items = [
            { category: 'keycard', name: '研究区二级门禁卡', quantity: 1, detail: '东侧走廊' },
            { category: 'keycard', name: 'B栋员工门禁卡', quantity: 2, detail: '西侧通道' },
            { category: 'unknown', name: '奇怪的铜牌', quantity: 1, detail: '' },
        ];
        const state = parseBiohazardHudState(`<bio_state>${JSON.stringify({ location: '警局', routes: [], inventory: items, log: [] })}</bio_state>`);
        expect(state?.inventory).toEqual([items[0], items[1], { category: null, name: '奇怪的铜牌', quantity: 1, detail: '' }]);
        expect(state?.tasks).toEqual([]);
    });

    it('keeps current tasks separate from the lower log', () => {
        const message = `<bio_state>${JSON.stringify({ location: '警局', routes: [], inventory: [], tasks: ['调查东侧门禁', '寻找备用电源'], log: ['已确认：广播记录被覆盖'] })}</bio_state>`;
        const state = parseBiohazardHudState(message);
        expect(state?.tasks).toEqual(['调查东侧门禁', '寻找备用电源']);
        expect(state?.log).toEqual(['已确认：广播记录被覆盖']);
    });

    it('reads per-round status without inventing an indicator', () => {
        const message = `<bio_state>${JSON.stringify({ location: '酒店套房', objective: '守住出口', status: { vitality: '有些脱力', pressure: '可以行动', note: '警笛声靠近', indicator: null }, routes: [], inventory: [], tasks: [], log: [] })}</bio_state>`;
        expect(parseBiohazardHudState(message)?.status).toEqual({ vitality: '有些脱力', pressure: '可以行动', note: '警笛声靠近', indicator: null });
        expect(parseBiohazardHudState(message)?.objective).toBe('守住出口');
        expect(parseBiohazardHudState('<bio_state>{"status":{"indicator":145}}</bio_state>')?.status?.indicator).toBe(100);
    });

    it('handles incomplete state and bounds untrusted model output', () => {
        expect(parseBiohazardHudState('<bio_state>{bad}</bio_state>')).toBeNull();
        expect(parseBiohazardHudState('<bio_state>{"location":""}</bio_state>')).toBeNull();
        const message = '<story_text>正文还在。</story_text><bio_state>{"location":"<b>地下室</b>","routes":["A","B","C","D","E","F"],"inventory":[42,"药盒"],"log":[]}</bio_state>';
        expect(parseBiohazardHudState(message)).toEqual({ location: 'b 地下室 /b', routes: ['A', 'B', 'C', 'D', 'E'], inventory: [{ category: 'medicine', name: '药盒', quantity: 1, detail: '' }], tasks: [], log: [] });
        expect(parseStoryDisplayBlocks('<story_text>正文还在。</story_text><bio_state>{broken')).toEqual([{ kind: 'story', text: '正文还在。' }]);
        const many = Array.from({ length: 22 }, (_, index) => ({ category: 'ammo', name: `弹药 ${index}`, quantity: 999, detail: '' }));
        expect(parseBiohazardHudState(`<bio_state>${JSON.stringify({ inventory: many })}</bio_state>`)?.inventory).toHaveLength(20);
        expect(parseBiohazardHudState(`<bio_state>${JSON.stringify({ inventory: many })}</bio_state>`)?.inventory[0].quantity).toBe(1);
    });
});
