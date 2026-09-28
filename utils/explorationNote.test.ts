import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseExplorationNote } from './explorationNote';
import { BUILTIN_EXPEDITION_PRESET, withBuiltInStoryPresets, parseStoryDisplayBlocks, resolveStoryPresetDocument } from './storyTheater';
import ExplorationNote from '../components/date/story/ExplorationNote';

const sample = { location: '墓道', time: '子时', objective: '检查石门', risk: 3, people: [{ name: '沈欢', stamina: 73, spirit: 91, intelligence: 17, agility: 12, modifiers: '腿伤 -2', injuries: '擦伤' }], clues: ['墙上存在通风孔'] };
describe('Morpho native expedition preset', () => {
  it('registers once and keeps native protocol when applying saved toggle choices', () => {
    const all = withBuiltInStoryPresets([BUILTIN_EXPEDITION_PRESET]);
    expect(all.filter(p => p.id === BUILTIN_EXPEDITION_PRESET.id)).toHaveLength(1);
    expect(all[0].id).toBe('builtin-night-screening');
    expect(all[0].name).toContain('夜班放映室');
    expect(all).toHaveLength(2);
    const doc = resolveStoryPresetDocument(BUILTIN_EXPEDITION_PRESET, { ...BUILTIN_EXPEDITION_PRESET.document, prompts: [] });
    const note = doc.prompts.find(p => p.id === 'exp-v1-explore-note')!;
    expect(note.content).toContain('<explore_note>');
    expect(note.content).not.toContain('<style>');
    expect(note.content).not.toContain('<div');
  });
  it('keeps prose separate and passes structured panel data to the renderer', () => {
    const raw = `<story_text>石门动了一下。</story_text><explore_note>${JSON.stringify(sample)}</explore_note>`;
    const blocks = parseStoryDisplayBlocks(raw);
    expect(blocks.map(b => b.kind)).toEqual(['story', 'exploration']);
    expect(blocks[1].exploration?.people[0].stamina).toBe(73);
    expect(blocks[0].text).toBe('石门动了一下。');
    expect(raw).toContain('stamina');
  });
  it('handles missing fields and clamps bars without allowing markup injection', () => {
    const note = parseExplorationNote(JSON.stringify({ ...sample, risk: 99, people: [{ name: '<script>alert(1)</script>', stamina: 150, spirit: -5 }] }))!;
    expect(note.risk).toBe(5); expect(note.people[0].stamina).toBe(100); expect(note.people[0].spirit).toBe(0);
    expect(note.people[0].intelligence).toBeNull();
    const html = renderToStaticMarkup(React.createElement(ExplorationNote, { note }));
    expect(html).toContain('width:100%'); expect(html).toContain('<details');
    expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;');
  });
  it('preserves story and offers readable fallback for malformed/truncated notes', () => {
    for (const suffix of ['<explore_note>{bad}</explore_note>', '<explore_note>{"location":"墓道"']) {
      const blocks = parseStoryDisplayBlocks('<story_text>正文仍在。</story_text>' + suffix);
      expect(blocks[0].text).toBe('正文仍在。');
      expect(blocks[1].kind).toBe('exploration');
      expect(blocks[1].text).toContain('原始记录已保留');
      expect(blocks[1].exploration).toBeUndefined();
    }
    expect(parseExplorationNote('{}')).toBeNull(); expect(parseExplorationNote('null')).toBeNull();
  });
});
