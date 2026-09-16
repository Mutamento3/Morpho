import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Microphone, PaperPlaneRight, Plus, SpinnerGap, User, X } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { synthesizeSpeechDetailed } from '../utils/ttsRouter';
import {
  BUILTIN_LIMITED_ROLES,
  callLimitedEncounter,
  characterToLimitedRole,
  IDENTITY_ARCHETYPES,
  LIMITED_EMOTIONS,
  type LimitedIdentity,
  type LimitedBlock,
  type LimitedRole,
  type LimitedTurn,
} from '../utils/limitedEncounter';
import './LimitedEncounterApp.css';

const STATE_KEY = 'morpho-limited-encounter-state-v1';
const IDENTITY_KEY = 'morpho-limited-encounter-identity-v1';
const TWIN_VOICE_KEY = 'shen-twins';
const baseAsset = (value: string) => value.startsWith('/assets/') ? `${import.meta.env.BASE_URL}${value.slice(1)}` : value;

const LABELS: Array<[string, string]> = [
  ['profile', '沿用个人档案'], ['heiress', '豪门大小姐'], ['innocent', '清纯小白花'],
  ['sunshine', '热情小辣椒'], ['cool', '冷艳御姐'], ['ceo', '霸道女总裁'],
  ['fragile', '柔弱小白莲'], ['sprite', '古灵精怪派'], ['healer', '温柔治愈系'],
];

const loadJson = <T,>(key: string, fallback: T): T => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; }
};

const makePrologue = (name: string) => `${name || '你'}和沈闻澜认识，是从一局快要输掉的游戏开始的。那时你们谁也没问对方现实里做什么，只记住了彼此的操作习惯、熬夜时间，还有输掉以后谁先嘴硬。后来双排变成固定队，游戏语音也从报点变成了漫无边际的闲聊。你知道他总爱笑着说些不着调的话，也知道每次你情绪不对，他都会像没发现似的，把话题轻轻接过去。\n\n你们隔着屏幕开过太多关于见面的玩笑，直到今天，它终于不再只是玩笑。约好的时间还没到，手机先震了一下。沈闻澜发来一句“别紧张，我又不会吃人”，后面跟着一个漫不经心的句号。可你偏偏想起，他提前问过你不吃什么，记住了你随口提过的店，甚至连路线都安排得过分顺手。\n\n窗外的光落在屏幕上。你忽然意识到，也许这场奔现并不是临时起意。那个看起来对什么都游刃有余的人，似乎已经在你不知道的时候，悄悄向现实里走了很久。`;

const emotionAsset = (emotion: string) => `${import.meta.env.BASE_URL}assets/limited-encounter/emotion-${encodeURIComponent(LIMITED_EMOTIONS.includes(emotion as any) ? emotion : '默认')}.png`;
const pixelEmotion: Record<string, string> = { 默认: '˙ᵕ˙', 开心: '◝(ᵔᵕᵔ)◜', 喜欢: '♡', 心动: '₍ᐢ.  ̫.ᐢ₎', 害羞: '(˶˃ ᵕ ˂˶)', 得意: '˃ ᵕ ˂', 坏笑: '◡̈⃝', 不爽: '¬_¬', 生气: 'ᕙ(⇀‸↼)ᕗ', 失落: '._.', 无语: '…', 震惊: '⊙_⊙' };

const LimitedEncounterApp: React.FC = () => {
  const { closeApp, apiConfig, userProfile, characters, addToast } = useOS();
  const initial = loadJson(STATE_KEY, { roleId: 'shen-wenlan', roles: [] as LimitedRole[], turns: [] as LimitedTurn[], hidden: false, voiceSources: {} as Record<string, string> });
  const [customRoles, setCustomRoles] = useState<LimitedRole[]>(initial.roles || []);
  const allRoles = useMemo(() => [...BUILTIN_LIMITED_ROLES, ...customRoles], [customRoles]);
  const [roleId, setRoleId] = useState(initial.roleId || 'shen-wenlan');
  const role = allRoles.find(item => item.id === roleId) || BUILTIN_LIMITED_ROLES[0];
  const [turns, setTurns] = useState<LimitedTurn[]>(initial.turns || []);
  const [hidden, setHidden] = useState(Boolean(initial.hidden));
  const [voiceSources, setVoiceSources] = useState<Record<string, string>>(initial.voiceSources || {});
  const [identity, setIdentity] = useState<LimitedIdentity | null>(() => {
    try { return JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null'); } catch { return null; }
  });
  const [identityDraft, setIdentityDraft] = useState<LimitedIdentity>({ name: userProfile.name || '', gender: '', persona: userProfile.bio || '', archetype: 'profile' });
  const [inputOpen, setInputOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', prompt: '', worldview: '', background: '' });
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ roleId, roles: customRoles, turns, hidden, voiceSources }));
  }, [roleId, customRoles, turns, hidden, voiceSources]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [turns.length, busy]);

  const latest = turns.at(-1);
  const latestDialogue = [...(latest?.blocks || [])].reverse().find((block): block is Extract<LimitedBlock, { type: 'dialogue' }> => block.type === 'dialogue');
  const background = baseAsset(role.background || '/assets/limited-encounter/custom-default.jpg');
  const userAvatar = userProfile.avatar || '';
  const isBuiltinTwin = role.id === 'shen-wenlan' || role.id === 'shen-wenxu';
  const selectedVoiceSourceId = isBuiltinTwin
    ? (voiceSources[TWIN_VOICE_KEY] || voiceSources['shen-wenlan'] || voiceSources['shen-wenxu'] || '')
    : (voiceSources[role.id] || role.voiceSourceId || role.linkedCharacterId || '');

  const submit = async (value: string) => {
    const message = value.trim();
    if (!message || busy || !identity) return;
    setBusy(true); setText(''); setInputOpen(false);
    try {
      const result = await callLimitedEncounter(apiConfig, role, identity, turns, message);
      const nextRole = allRoles.find(item => item.id === result.activeRole || item.name === result.activeRole);
      if (nextRole) setRoleId(nextRole.id);
      setTurns(prev => [...prev, { id: `turn-${Date.now()}`, at: Date.now(), userText: message, activeRole: nextRole?.name || role.name, blocks: result.blocks, suggestions: result.suggestions }]);
    } catch (error: any) {
      addToast(error?.message || '这一幕没有接上，请再试一次。', 'error');
    } finally { setBusy(false); }
  };

  const playVoice = async () => {
    if (!latestDialogue || voiceBusy) return;
    const sourceId = selectedVoiceSourceId;
    const source = characters.find(char => char.id === sourceId) || characters.find(char => char.name === role.name);
    if (!source) {
      addToast('请先在人物按钮里为限定角色选择一个神经链接音色来源。', 'info');
      setRoleOpen(true); return;
    }
    setVoiceBusy(true);
    try {
      const { url } = await synthesizeSpeechDetailed(latestDialogue.text, source, apiConfig, {
        languageBoost: source.chatVoiceLang || undefined,
        groupId: apiConfig.minimaxGroupId || undefined,
        emotion: source.voiceProfile?.emotion,
      });
      const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); await audio.play();
    } catch (error: any) { addToast(error?.message || '语音生成失败', 'error'); }
    finally { setVoiceBusy(false); }
  };

  const saveIdentity = () => {
    const next = { ...identityDraft, persona: identityDraft.persona || IDENTITY_ARCHETYPES[identityDraft.archetype] || userProfile.bio || '' };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(next)); setIdentity(next);
    if (!turns.length) setTurns([{ id: `prologue-${Date.now()}`, at: Date.now(), userText: '', activeRole: '序章', blocks: [{ type: 'narration', text: makePrologue(next.name) }], suggestions: ['按约定的时间出门。', '先发消息问他到了没有。', '临出门又换了一套衣服。'] }]);
  };

  const addLinkedRole = (charId: string) => {
    const char = characters.find(item => item.id === charId); if (!char) return;
    const next = characterToLimitedRole(char);
    setCustomRoles(prev => [...prev.filter(item => item.id !== next.id), next]); setRoleId(next.id); setRoleOpen(false);
  };

  const saveFreeRole = () => {
    if (!newRole.name.trim()) return;
    const created: LimitedRole = { id: `custom:${Date.now()}`, name: newRole.name.trim(), avatar: '', background: newRole.background || '/assets/limited-encounter/custom-default.jpg', systemPrompt: newRole.prompt || `你是${newRole.name}。`, worldview: newRole.worldview, custom: true };
    setCustomRoles(prev => [...prev, created]); setRoleId(created.id); setCreateOpen(false); setRoleOpen(false);
  };

  const setVoiceSource = (id: string) => {
    setVoiceSources(prev => isBuiltinTwin
      ? ({ ...prev, [TWIN_VOICE_KEY]: id, 'shen-wenlan': id, 'shen-wenxu': id })
      : ({ ...prev, [role.id]: id }));
  };

  return <div className="le-app" style={{ backgroundImage: `linear-gradient(180deg,rgba(21,17,22,.12),rgba(18,13,17,.52)),url("${background}")` }}>
    <div className="le-topline">LIMITED ENCOUNTER · 01</div>
    <button className="le-back" onClick={closeApp}>‹</button>
    <div className="le-user-chip">{userAvatar ? <img src={userAvatar} /> : <span>{(identity?.name || userProfile.name || '你').slice(0, 1)}</span>}<b>{identity?.name || userProfile.name || '此刻的你'}</b></div>
    <div className="le-role-tools">
      <button className="le-role-chip" onClick={() => setRoleOpen(true)}><User size={15} weight="fill" /><span>限定角色 · {role.name}</span></button>
      <button className="le-mic" onClick={playVoice} disabled={!latestDialogue || voiceBusy} aria-label="播放角色语音" title="使用私聊的 MiniMax / 鱼声配置朗读本轮台词">{voiceBusy ? <SpinnerGap className="le-spin" size={17} /> : <Microphone size={17} weight="fill" />}</button>
    </div>

    <div ref={scroller} className={`le-story ${hidden ? 'is-hidden' : ''}`}>
      {turns.flatMap(turn => turn.blocks.map((block, index) => ({ ...block, key: `${turn.id}-${index}`, custom: role.custom })) ).filter((_, index, arr) => !hidden || index === arr.length - 1).map((block: any) => block.type === 'narration'
        ? <p className="le-narration" key={block.key}>{block.text}</p>
        : <div className="le-dialogue-row" key={block.key}>
            <div className={`le-emotion ${block.custom ? 'pixel' : ''}`}>{block.custom ? (pixelEmotion[block.emotion] || pixelEmotion.默认) : <img src={emotionAsset(block.emotion)} />}</div>
            <div className="le-dialogue"><small>{block.speaker || role.name}<i>{block.emotion}</i></small><div>{block.text}</div></div>
          </div>)}
      {busy && <div className="le-thinking"><SpinnerGap className="le-spin" /> 正在续写这一幕……</div>}
    </div>

    <div className="le-actions"><button onClick={() => setInputOpen(true)}>输入</button><button onClick={() => setHidden(v => !v)}>{hidden ? '展开' : '隐藏'}</button></div>

    {inputOpen && <div className="le-sheet-shade" onClick={() => setInputOpen(false)}><section className="le-response-sheet" onClick={e => e.stopPropagation()}><header>你想怎么回应？<button onClick={() => setInputOpen(false)}><X /></button></header>{(latest?.suggestions || ['先问清楚他到底在打什么主意。', '笑着接住这句话，再慢慢靠近。', '临时换个完全出乎他预料的玩法。']).map((item, idx) => <button className="le-suggestion" key={`${item}-${idx}`} onClick={() => submit(item)}>{item}</button>)}<div className="le-compose"><textarea value={text} onChange={e => setText(e.target.value)} placeholder="或者，亲自写下这一轮的回应……" /><button onClick={() => submit(text)}><PaperPlaneRight weight="fill" /></button></div></section></div>}

    {!identity && <div className="le-modal-shade"><section className="le-identity"><div className="le-modal-kicker">BEFORE THE STORY</div><h2>此刻的你</h2><p>默认跟随个人档案，也可以只为这段故事换一种身份。</p><label>姓名<input value={identityDraft.name} onChange={e => setIdentityDraft(v => ({ ...v, name: e.target.value }))} /></label><label>性别<input value={identityDraft.gender} onChange={e => setIdentityDraft(v => ({ ...v, gender: e.target.value }))} placeholder="可留空" /></label><label>基本人设<textarea value={identityDraft.persona} onChange={e => setIdentityDraft(v => ({ ...v, persona: e.target.value }))} placeholder="默认读取个人档案" /></label><div className="le-archetypes">{LABELS.map(([id, label]) => <button className={identityDraft.archetype === id ? 'active' : ''} key={id} onClick={() => setIdentityDraft(v => ({ ...v, archetype: id, persona: id === 'profile' ? userProfile.bio || '' : IDENTITY_ARCHETYPES[id] }))}>{label}</button>)}</div><button className="le-primary" onClick={saveIdentity}>以此刻的我，进入故事</button></section></div>}

    {roleOpen && <div className="le-modal-shade" onClick={() => setRoleOpen(false)}><section className="le-role-modal" onClick={e => e.stopPropagation()}><header><div><small>CAST</small><h2>限定人物</h2></div><button onClick={() => setRoleOpen(false)}><X /></button></header><div className="le-role-list">{allRoles.map(item => <button className={item.id === role.id ? 'active' : ''} key={item.id} onClick={() => { setRoleId(item.id); setRoleOpen(false); }}><span style={{ backgroundImage: `url("${baseAsset(item.avatar || item.background)}")` }} />{item.name}{item.id === role.id && <Check weight="bold" />}</button>)}</div><label className="le-voice-select">{isBuiltinTwin ? '双胞胎共用语音' : '语音来源'}<select value={selectedVoiceSourceId} onChange={e => setVoiceSource(e.target.value)}><option value="">选择神经链接角色的 MiniMax / 鱼声配置</option>{characters.map(char => <option value={char.id} key={char.id}>{char.name}</option>)}</select></label><button className="le-add" onClick={() => setCreateOpen(true)}><Plus />自由创建角色</button><div className="le-linked"><b>从神经链接添加</b>{characters.map(char => <button key={char.id} onClick={() => addLinkedRole(char.id)}>{char.name}</button>)}</div></section></div>}

    {createOpen && <div className="le-modal-shade"><section className="le-role-modal le-create"><header><h2>自由创建</h2><button onClick={() => setCreateOpen(false)}><X /></button></header><input placeholder="角色名" value={newRole.name} onChange={e => setNewRole(v => ({ ...v, name: e.target.value }))} /><textarea placeholder="核心设定" value={newRole.prompt} onChange={e => setNewRole(v => ({ ...v, prompt: e.target.value }))} /><textarea placeholder="世界观 / 补充设定" value={newRole.worldview} onChange={e => setNewRole(v => ({ ...v, worldview: e.target.value }))} /><label className="le-upload">上传聊天背景<input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setNewRole(v => ({ ...v, background: String(reader.result || '') })); reader.readAsDataURL(file); }} /></label><button className="le-primary" onClick={saveFreeRole}>保存并进入</button></section></div>}
  </div>;
};

export default LimitedEncounterApp;
