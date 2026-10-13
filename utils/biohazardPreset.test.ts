import { describe, expect, it } from 'vitest';
import { STORY_PRESET_SIMPLE_CHOICES } from '../components/date/story/StoryPresetMaker';
import { parseBiohazardHudState } from './biohazardHud';
import {
    applyStoryPresetChoice, BUILTIN_BIOHAZARD_PRESET, BUILTIN_EXPEDITION_PRESET,
    BUILTIN_NIGHT_SCREENING_PRESET, compileStoryPreset, duplicateStoryPreset,
    parseStoryTheaterPreset, resolveStoryPresetDocument, withBuiltInStoryPresets,
} from './storyTheater';

const preset = BUILTIN_BIOHAZARD_PRESET;
const choicesFor = (document: typeof preset.document) => STORY_PRESET_SIMPLE_CHOICES
    .filter(choice => choice.ids.some(id => document.prompts.some(prompt => prompt.id === id)));
const phase = choicesFor(preset.document).find(choice => choice.label === '开局感染程度')!;
const faction = choicesFor(preset.document).find(choice => choice.label === '主角团阵营')!;

describe('Morpho biohazard preset integration', () => {
    it('gives the task panel and lower log distinct model fields', () => {
        const hud = preset.document.prompts.find(prompt => prompt.id === 'bio-v1-hud')?.content || '';
        expect(hud).toContain('"tasks"');
        expect(hud).toContain('"log"');
        expect(hud).toContain('"objective"');
        expect(hud).toContain('"status"');
        expect(hud).toContain('每轮都更新状态卡');
        expect(hud).toContain('tasks 与 log 不混用');
        expect(hud).toContain('固定示意');
        const example = hud.match(/<bio_state>\{[\s\S]*?\}<\/bio_state>/)?.[0];
        expect(example).toBeTruthy();
        expect(parseBiohazardHudState(example || '')).toMatchObject({
            inventory: [{ category: 'keycard', name: '研究区二级门禁卡' }],
            tasks: ['调查东侧走廊的异常门禁记录'],
            log: ['已确认：警局广播曾重复三次'],
        });
    });

    it('adds one independent preset without replacing existing or user presets', () => {
        const custom = duplicateStoryPreset(preset);
        const list = withBuiltInStoryPresets([BUILTIN_EXPEDITION_PRESET, preset, preset, custom]);
        expect(list).toEqual([BUILTIN_NIGHT_SCREENING_PRESET, BUILTIN_EXPEDITION_PRESET, preset, custom]);
        expect(choicesFor(preset.document).map(choice => choice.label)).toEqual([
            '开局感染程度', '主角团阵营', '人称', '你的执笔权', '语言', '篇幅',
        ]);
        for (const existing of [BUILTIN_NIGHT_SCREENING_PRESET, BUILTIN_EXPEDITION_PRESET]) {
            expect(choicesFor(existing.document)).not.toContain(phase);
            expect(choicesFor(existing.document)).not.toContain(faction);
        }
        expect(preset.document.prompts.filter(p => phase.ids.includes(p.id) && p.enabled).map(p => p.id)).toEqual(['bio-v1-stage-initial']);
        expect(preset.document.prompts.filter(p => faction.ids.includes(p.id) && p.enabled).map(p => p.id)).toEqual(['bio-v1-faction-human']);
    });

    it.each(['initial', 'spread', 'apocalypse'].flatMap(stage =>
        ['human', 'umbrella', 'variant'].map(team => [stage, team])))('%s / %s survives saved overrides and reaches the model alone', (stage, team) => {
        const original = JSON.stringify(preset.document);
        let selected = applyStoryPresetChoice(preset.document, phase.ids, `bio-v1-stage-${stage}`);
        selected = applyStoryPresetChoice(selected, faction.ids, `bio-v1-faction-${team}`);
        const saved = JSON.parse(JSON.stringify(selected));
        const resolved = resolveStoryPresetDocument(preset, saved);
        const compiled = compileStoryPreset({
            preset: { ...preset, document: resolved }, userName: '测试主角', characterNames: ['测试同伴'],
            slots: { actors: 'CHARACTER_SENTINEL', persona: 'PERSONA_SENTINEL', scenario: 'SCENARIO_SENTINEL', worldBefore: 'WORLD_BEFORE_SENTINEL', worldAfter: 'WORLD_AFTER_SENTINEL', history: 'HISTORY_SENTINEL' },
        });
        const prompt = compiled.messages.map(message => message.content).join('\n');
        for (const id of [...phase.ids, ...faction.ids]) {
            const module = preset.document.prompts.find(p => p.id === id)!;
            if (id === `bio-v1-stage-${stage}` || id === `bio-v1-faction-${team}`) expect(prompt).toContain(module.content);
            else expect(prompt).not.toContain(module.content);
        }
        for (const sentinel of ['CHARACTER', 'PERSONA', 'SCENARIO', 'WORLD_BEFORE', 'WORLD_AFTER', 'HISTORY']) {
            expect(prompt.split(`${sentinel}_SENTINEL`)).toHaveLength(2);
        }
        expect(prompt).not.toContain('{{user}}');
        expect(prompt).not.toContain('{{char}}');
        expect(prompt).toContain('测试主角');
        expect(prompt).toContain('默认微恐与悬疑');
        expect(prompt).toContain('世界时间随行动合理流逝');
        expect(JSON.stringify(preset.document)).toBe(original);
    });

    it('exports a valid standalone preset and preserves user copies on resolution', () => {
        const imported = parseStoryTheaterPreset(JSON.stringify(preset.document), 'biohazard.json');
        expect(imported.document).toEqual(preset.document);
        const changed = { ...imported.document, prompts: imported.document.prompts.map(p => ({ ...p, content: 'User authored content' })) };
        expect(resolveStoryPresetDocument(imported, changed)).toBe(changed);
        const builtin = resolveStoryPresetDocument(preset, changed);
        expect(builtin.prompts.find(p => p.id === 'bio-v1-tone')?.content).toContain('默认微恐与悬疑');
    });
});
