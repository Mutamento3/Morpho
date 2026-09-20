import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, PaperPlaneRight, SpeakerHigh, SpinnerGap, User, X } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { synthesizeSpeechDetailed } from '../utils/ttsRouter';
import {
  BUILTIN_LIMITED_ROLES,
  callLimitedEncounter,
  IDENTITY_ARCHETYPES,
  LIMITED_EMOTIONS,
  type LimitedIdentity,
  type LimitedBlock,
  type LimitedRole,
  type LimitedTurn,
} from '../utils/limitedEncounter';
import './LimitedEncounterApp.css';
import type { CharacterProfile } from '../types';
import { characterHasVoice } from '../utils/ttsRouter';
import { fetchMiniMaxVoices, type MiniMaxVoiceItem } from '../utils/minimaxVoice';
import { resolveMiniMaxApiKey } from '../utils/minimaxApiKey';
import VoiceDesignerApp from './VoiceDesignerApp';
type VoiceProfile = NonNullable<CharacterProfile['voiceProfile']>;

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
  const initial = loadJson(STATE_KEY, { roleId: 'shen-wenlan', roles: [] as LimitedRole[], turns: [] as LimitedTurn[], hidden: false, voiceSources: {} as Record<string, string>, voiceProfiles: {} as Record<string, VoiceProfile> });
  const [customRoles] = useState<LimitedRole[]>(initial.roles || []);
  const allRoles = useMemo(() => [...BUILTIN_LIMITED_ROLES, ...customRoles], [customRoles]);
  const [roleId, setRoleId] = useState(initial.roleId || 'shen-wenlan');
  const role = allRoles.find(item => item.id === roleId) || BUILTIN_LIMITED_ROLES[0];
  const [turns, setTurns] = useState<LimitedTurn[]>(initial.turns || []);
  const [hidden, setHidden] = useState(Boolean(initial.hidden));
  const [voiceSources] = useState<Record<string, string>>(initial.voiceSources || {});
  const [identity, setIdentity] = useState<LimitedIdentity | null>(() => {
    try { return JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null'); } catch { return null; }
  });
  const [identityDraft, setIdentityDraft] = useState<LimitedIdentity>({ name: userProfile.name || '', gender: '', persona: userProfile.bio || '', archetype: 'profile' });
  const [inputOpen, setInputOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState<string | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [voiceProfiles, setVoiceProfiles] = useState(initial.voiceProfiles);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<MiniMaxVoiceItem[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [turnActionId, setTurnActionId] = useState<string | null>(null);
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [editingBlocks, setEditingBlocks] = useState<LimitedBlock[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ roleId, roles: customRoles, turns, hidden, voiceSources, voiceProfiles }));
  }, [roleId, customRoles, turns, hidden, voiceSources, voiceProfiles]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [turns.length, busy]);

  const latest = turns[turns.length - 1];
  const latestDialogue = [...(latest?.blocks || [])].reverse().find((block): block is Extract<LimitedBlock, { type: 'dialogue' }> => block.type === 'dialogue');
  const background = baseAsset(role.background || '/assets/limited-encounter/custom-default.jpg');
  const userAvatar = userProfile.avatar || '';
  const isBuiltinTwin = role.id === 'shen-wenlan' || role.id === 'shen-wenxu';
  const selectedVoiceSourceId = isBuiltinTwin
    ? (voiceSources[TWIN_VOICE_KEY] || voiceSources['shen-wenlan'] || voiceSources['shen-wenxu'] || '')
    : (voiceSources[role.id] || role.voiceSourceId || role.linkedCharacterId || '');

  const voiceKey = isBuiltinTwin ? TWIN_VOICE_KEY : role.id;
  const legacySource = characters.find(char => char.id === selectedVoiceSourceId) || characters.find(char => char.name === role.name);
  const voiceProfile = voiceProfiles[voiceKey] ?? legacySource?.voiceProfile ?? {};
  const voiceCharacter: CharacterProfile = {
    id: voiceKey, name: isBuiltinTwin ? '双胞胎' : role.name,
    avatar: role.avatar, description: '', systemPrompt: role.systemPrompt,
    memories: [], voiceProfile,
  };
  // Copy legacy bindings once, then keep the app's voice independent of linked characters.
  useEffect(() => {
    if (!voiceProfiles[voiceKey] && legacySource?.voiceProfile) {
      setVoiceProfiles(prev => prev[voiceKey] ? prev : { ...prev, [voiceKey]: { ...legacySource.voiceProfile } });
    }
  }, [voiceKey, voiceProfiles, legacySource]);
  const updateVoice = (patch: Partial<VoiceProfile>) => {
    setVoiceProfiles(prev => ({ ...prev, [voiceKey]: { ...voiceProfile, ...prev[voiceKey], ...patch } }));
  };
  const loadVoices = async () => {
    if (loadingVoices) return;
    setLoadingVoices(true);
    try {
      const result = await fetchMiniMaxVoices(resolveMiniMaxApiKey(apiConfig));
      const voices = [...result.voice_cloning, ...result.voice_generation, ...result.system_voice];
      setAvailableVoices(voices);
      addToast(voices.length ? '音色已拉取，请选择。' : '暂未查询到可用音色，也可以直接填写 voice_id。', 'info');
    } catch (error: any) { addToast(error?.message || '音色拉取失败', 'error'); }
    finally { setLoadingVoices(false); }
  };

  const submit = async (value: string, replaceId?: string) => {
    const message = value.trim();
    if (!message || busy || !identity) return;
    setBusy(true); setText(''); setInputOpen(false);
    const turnId = replaceId || `turn-${Date.now()}`;
    const replaceIndex = replaceId ? turns.findIndex(turn => turn.id === replaceId) : -1;
    const history = replaceIndex >= 0 ? turns.slice(0, replaceIndex) : turns;
    if (!replaceId) {
      setTurns(prev => [...prev, { id: turnId, at: Date.now(), userText: message, activeRole: role.name, blocks: [], suggestions: [] }]);
    }
    try {
      const result = await callLimitedEncounter(apiConfig, role, identity, history, message);
      const nextRole = allRoles.find(item => item.id === result.activeRole || item.name === result.activeRole);
      if (nextRole) setRoleId(nextRole.id);
      const completed: LimitedTurn = { id: turnId, at: Date.now(), userText: message, activeRole: nextRole?.name || role.name, blocks: result.blocks, suggestions: result.suggestions };
      setTurns(prev => replaceId ? prev.map(turn => turn.id === replaceId ? completed : turn) : prev.map(turn => turn.id === turnId ? completed : turn));
    } catch (error: any) {
      addToast(error?.message || '这一幕没有接上，请再试一次。', 'error');
    } finally { setBusy(false); }
  };

  const playVoice = async (content: string, key: string) => {
    if (!content.trim() || voiceBusy) return;
    const source = voiceCharacter;
    if (!characterHasVoice(source, apiConfig)) {
      addToast('请先在限定人物中配置当前语音服务的音色。', 'info');
      setRoleOpen(true); return;
    }
    setVoiceBusy(key);
    try {
      const { url } = await synthesizeSpeechDetailed(content, source, apiConfig, {
        languageBoost: source.chatVoiceLang || undefined,
        groupId: apiConfig.minimaxGroupId || undefined,
        emotion: source.voiceProfile?.emotion,
      });
      const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); await audio.play();
    } catch (error: any) { addToast(error?.message || '语音生成失败', 'error'); }
    finally { setVoiceBusy(null); }
  };

  const openTurnActions = (turnId: string) => {
    if (busy || !turns.find(turn => turn.id === turnId)?.blocks.length) return;
    setTurnActionId(turnId);
  };
  const startLongPress = (turnId: string) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => openTurnActions(turnId), 560);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  const regenerateTurn = () => {
    const target = turns.find(turn => turn.id === turnActionId);
    setTurnActionId(null);
    if (target?.userText) void submit(target.userText, target.id);
  };
  const beginEditTurn = () => {
    const target = turns.find(turn => turn.id === turnActionId);
    if (!target) return;
    setEditingTurnId(target.id);
    setEditingBlocks(target.blocks.map(block => ({ ...block })));
    setTurnActionId(null);
  };
  const saveEditedTurn = () => {
    if (!editingTurnId) return;
    const cleaned = editingBlocks.map(block => ({ ...block, text: block.text.trim() })).filter(block => block.text) as LimitedBlock[];
    if (!cleaned.length) return addToast('至少保留一段内容。', 'info');
    setTurns(prev => prev.map(turn => turn.id === editingTurnId ? { ...turn, blocks: cleaned } : turn));
    setEditingTurnId(null); setEditingBlocks([]);
  };

  const saveIdentity = () => {
    const next = { ...identityDraft, persona: identityDraft.persona || IDENTITY_ARCHETYPES[identityDraft.archetype] || userProfile.bio || '' };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(next)); setIdentity(next);
    if (!turns.length) setTurns([{ id: `prologue-${Date.now()}`, at: Date.now(), userText: '', activeRole: '序章', blocks: [{ type: 'narration', text: makePrologue(next.name) }], suggestions: ['按约定的时间出门。', '先发消息问他到了没有。', '临出门又换了一套衣服。'] }]);
  };

  const visibleTurns = hidden && latest
    ? [{ ...latest, userText: '', blocks: latestDialogue ? [latestDialogue] : latest.blocks.slice(-1) }]
    : turns;

  return <div className="le-app" style={{ backgroundImage: `linear-gradient(180deg,rgba(21,17,22,.12),rgba(18,13,17,.52)),url("${background}")` }}>
    <div className="le-topline">LIMITED ENCOUNTER · 01</div>
    <button className="le-back" onClick={closeApp}>‹</button>
    <div className="le-user-chip">{userAvatar ? <img src={userAvatar} /> : <span>{(identity?.name || userProfile.name || '你').slice(0, 1)}</span>}<b>{identity?.name || userProfile.name || '此刻的你'}</b></div>
    <div className="le-role-tools">
      <button className="le-role-chip" onClick={() => setRoleOpen(true)}><User size={15} weight="fill" /><span>限定角色 · {role.name}</span></button>
    </div>

    <div ref={scroller} className={`le-story ${hidden ? 'is-hidden' : ''}`}>
      {visibleTurns.map(turn => {
        const turnRole = allRoles.find(item => item.name === turn.activeRole) || role;
        return <React.Fragment key={turn.id}>
          {turn.userText && <div className="le-user-dialogue-row"><div className="le-user-dialogue">{turn.userText}</div></div>}
          <div className="le-role-turn"
            onPointerDown={() => startLongPress(turn.id)} onPointerUp={cancelLongPress}
            onPointerCancel={cancelLongPress} onPointerMove={cancelLongPress} onPointerLeave={cancelLongPress}
            onContextMenu={event => { event.preventDefault(); cancelLongPress(); openTurnActions(turn.id); }}>
            {turn.blocks.map((block, index) => {
              const key = `${turn.id}-${index}`;
              return block.type === 'narration'
                ? <p className="le-narration" key={key}>{block.text}</p>
                : <div className="le-dialogue-row" key={key}>
                    <div className={`le-emotion ${turnRole.custom ? 'pixel' : ''}`}>{turnRole.custom ? (pixelEmotion[block.emotion] || pixelEmotion.默认) : <img src={emotionAsset(block.emotion)} />}</div>
                    <div className="le-dialogue"><small>{block.speaker || turnRole.name}</small><div>{block.text}</div><button className="le-bubble-voice" aria-label="播放这一句" title="播放这一句" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); void playVoice(block.text, key); }}>{voiceBusy === key ? <SpinnerGap className="le-spin" /> : <SpeakerHigh weight="fill" />}</button></div>
                  </div>;
            })}
          </div>
        </React.Fragment>;
      })}
      {busy && <div className="le-thinking"><SpinnerGap className="le-spin" /> 正在续写这一幕……</div>}
    </div>

    <div className="le-actions"><button onClick={() => setInputOpen(true)}>输入</button><button onClick={() => setHidden(v => !v)}>{hidden ? '展开' : '隐藏'}</button></div>

    {inputOpen && <div className="le-sheet-shade" onClick={() => setInputOpen(false)}><section className="le-response-sheet" onClick={e => e.stopPropagation()}><header>你想怎么回应？<button onClick={() => setInputOpen(false)}><X /></button></header>{(latest?.suggestions || ['先问清楚他到底在打什么主意。', '笑着接住这句话，再慢慢靠近。', '临时换个完全出乎他预料的玩法。']).map((item, idx) => <button className="le-suggestion" key={`${item}-${idx}`} onClick={() => submit(item)}>{item}</button>)}<div className="le-compose"><textarea value={text} onChange={e => setText(e.target.value)} placeholder="或者，亲自写下这一轮的回应……" /><button onClick={() => submit(text)}><PaperPlaneRight weight="fill" /></button></div></section></div>}

    {turnActionId && <div className="le-sheet-shade" onClick={() => setTurnActionId(null)}><section className="le-turn-actions" onClick={event => event.stopPropagation()}><div className="le-turn-actions-hint">这一轮想怎么处理？</div><button onClick={regenerateTurn}>重新生成整段</button><button onClick={beginEditTurn}>编辑整段内容</button><button className="muted" onClick={() => setTurnActionId(null)}>取消</button></section></div>}

    {editingTurnId && <div className="le-modal-shade"><section className="le-edit-turn"><header><div><small>EDIT THIS TURN</small><h2>编辑这一轮</h2></div><button onClick={() => { setEditingTurnId(null); setEditingBlocks([]); }}><X /></button></header>{editingBlocks.map((block, index) => <label key={index}>{block.type === 'dialogue' ? `台词 · ${block.speaker || role.name}` : '叙述'}<textarea value={block.text} onChange={event => setEditingBlocks(prev => prev.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} /></label>)}<button className="le-primary" onClick={saveEditedTurn}>保存这一轮</button></section></div>}

    {!identity && <div className="le-modal-shade"><section className="le-identity"><div className="le-modal-kicker">BEFORE THE STORY</div><h2>此刻的你</h2><p>默认跟随个人档案，也可以只为这段故事换一种身份。</p><label>姓名<input value={identityDraft.name} onChange={e => setIdentityDraft(v => ({ ...v, name: e.target.value }))} /></label><label>性别<input value={identityDraft.gender} onChange={e => setIdentityDraft(v => ({ ...v, gender: e.target.value }))} placeholder="可留空" /></label><label>基本人设<textarea value={identityDraft.persona} onChange={e => setIdentityDraft(v => ({ ...v, persona: e.target.value }))} placeholder="默认读取个人档案" /></label><div className="le-archetypes">{LABELS.map(([id, label]) => <button className={identityDraft.archetype === id ? 'active' : ''} key={id} onClick={() => setIdentityDraft(v => ({ ...v, archetype: id, persona: id === 'profile' ? userProfile.bio || '' : IDENTITY_ARCHETYPES[id] }))}>{label}</button>)}</div><button className="le-primary" onClick={saveIdentity}>以此刻的我，进入故事</button></section></div>}

    {roleOpen && <div className="le-modal-shade" onClick={() => setRoleOpen(false)}><section className="le-role-modal" onClick={e => e.stopPropagation()}>
      <header><div><small>CAST</small><h2>限定人物</h2></div><button aria-label="关闭限定人物" onClick={() => setRoleOpen(false)}><X /></button></header>
      <div className="le-role-list">{allRoles.map(item => <button className={item.id === role.id ? 'active' : ''} key={item.id} onClick={() => setRoleId(item.id)}><span style={{ backgroundImage: 'url("' + baseAsset(item.avatar || item.background) + '")' }} />{item.name}{item.id === role.id && <Check weight="bold" />}</button>)}</div>
      <p className="le-voice-hint">{isBuiltinTwin ? '沈闻澜与沈闻序共用以下声线。' : '当前角色声线。'}修改后自动保存。</p>
      <section className="le-voice-card">
        <div className="le-voice-heading"><b><SpeakerHigh /> MiniMax 音色设定</b><div><button onClick={() => setDesignerOpen(true)}>捏声音</button><button disabled={loadingVoices} onClick={() => void loadVoices()}>{loadingVoices ? '拉取中…' : '拉取可用音色'}</button></div></div>
        <p>使用总设置中的语音服务配置。已有 voice_id 可直接填写。</p>
        <input aria-label="MiniMax voice_id" placeholder="voice_id（可直接贴）" value={voiceProfile.voiceId || ''} onChange={e => updateVoice({ voiceId: e.target.value.trim(), voiceName: '', timberWeights: undefined })} />
        {availableVoices.length > 0 && <select aria-label="可用音色" value="" onChange={e => { const voice = availableVoices.find(v => v.voice_id === e.target.value); if (voice) updateVoice({ voiceId: voice.voice_id, voiceName: voice.voice_name || '', timberWeights: undefined }); }}><option value="">选择已拉取的音色</option>{availableVoices.map((v, i) => <option key={v.voice_id + i} value={v.voice_id}>{v.voice_name || v.voice_id}</option>)}</select>}
        {voiceProfile.timberWeights?.length ? <p>已应用混合音色：{voiceProfile.voiceName}，可在「捏声音」中微调。</p> : null}
        <input aria-label="MiniMax TTS 模型" placeholder="speech-2.8-hd" value={voiceProfile.model ?? 'speech-2.8-hd'} onChange={e => updateVoice({ model: e.target.value })} />
        <div className="le-fish-card"><b>鱼声 FISH 音色</b><input aria-label="鱼声音色" placeholder="reference_id 或 fish.audio 链接" value={voiceProfile.fishReferenceId || ''} onChange={e => updateVoice({ fishReferenceId: e.target.value.trim() })} /><p>在总设置中选择「鱼声 Fish」后使用此音色，与 MiniMax 音色分别保存。</p></div>
        <label className="le-speed">语速 <span>{(voiceProfile.speed ?? 1).toFixed(2)}×</span><input aria-label="语速" type="range" min="0.5" max="1.5" step="0.05" value={voiceProfile.speed ?? 1} onChange={e => updateVoice({ speed: Number(e.target.value) })} /></label>
        <p>1.0 为正常语速，数值越小越慢。MiniMax 与鱼声共用。</p>
      </section>
    </section></div>}
    {designerOpen && <div className="le-voice-designer"><VoiceDesignerApp character={voiceCharacter} onClose={() => setDesignerOpen(false)} onApply={profile => { updateVoice(profile); setDesignerOpen(false); }} /></div>}

  </div>;
};

export default LimitedEncounterApp;
