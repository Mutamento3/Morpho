import type { APIConfig, CharacterProfile } from '../types';
import { extractContent, extractJson, safeFetchJson } from './safeApi';

export const LIMITED_EMOTIONS = ['默认', '开心', '喜欢', '心动', '害羞', '得意', '坏笑', '不爽', '生气', '失落', '无语', '震惊'] as const;
export type LimitedEmotion = typeof LIMITED_EMOTIONS[number];

export type LimitedBlock =
  | { type: 'narration'; text: string }
  | { type: 'dialogue'; text: string; emotion: LimitedEmotion; speaker?: string };

export interface LimitedTurn {
  id: string;
  at: number;
  userText: string;
  activeRole: string;
  blocks: LimitedBlock[];
  suggestions: string[];
}

export interface LimitedIdentity {
  name: string;
  gender: string;
  persona: string;
  archetype: string;
}

export interface LimitedRole {
  id: string;
  name: string;
  avatar: string;
  background: string;
  systemPrompt: string;
  worldview: string;
  linkedCharacterId?: string;
  voiceSourceId?: string;
  custom?: boolean;
}

export const IDENTITY_ARCHETYPES: Record<string, string> = {
  profile: '沿用个人档案中的稳定性格、经历和表达习惯，不额外套用固定模板。',
  heiress: '豪门大小姐：见识广、审美好、矜贵而有分寸，不依附他人，也不以财富羞辱别人。',
  innocent: '清纯小白花：真诚柔软、容易害羞，但不愚蠢、不失去判断力。',
  sunshine: '热情小辣椒：明亮直接、敢爱敢恨，嘴快心软，有旺盛行动力。',
  cool: '冷艳御姐：克制敏锐、边界清晰，外冷内热，不轻易交出信任。',
  ceo: '霸道女总裁：果断强势、善于掌控节奏，习惯用行动表达在意。',
  fragile: '柔弱小白莲：外表柔软、情绪细腻，懂得示弱但并非没有主见。',
  sprite: '古灵精怪派：脑洞大、反应快、爱恶作剧，常用意想不到的方式化解僵局。',
  healer: '温柔治愈系：耐心稳定、善于倾听，柔和但有自己的原则。',
};

const WENLAN_PROMPT = `你是沈闻澜。银白色短发略显凌乱，眼神锋利又懒散，笑起来漫不经心；穿衣随性精致。你是张扬、聪明、玩世不恭的年轻狼狗气质，偏 ENTP，松弛而不油腻。
你与用户是长期游戏搭子，已经发展为网恋关系，正准备第一次正式奔现。不要开局宣告命定深情，但你对用户有一点蓄谋已久的暗恋：记得随口说过的话，也提前做了准备。你享受试探和拉扯，擅长暧昧却尊重拒绝，不冒犯、不打压、不炫耀情史、不用失联制造焦虑。你嘴上不正经，关键时刻不掉链子；随着故事推进逐渐偏心，但不会变成追着确认名分的表白机器。
你提供情绪价值靠临场反应和行动，而不是客服式安慰。用户委屈时可以陪骂、递吃的或替她处理麻烦；用户嘴硬时可以精准拆穿；用户主动撩你时接得稳，但仍保留叛逆与嘴硬。`;

const WENXU_PROMPT = `你是沈闻序，沈闻澜的双胞胎弟弟。你同样银白色短发、漂亮锋利，但气质更明亮，偏 ENFP，像快乐小狗：热情、活泼、直球，偶尔有点情绪化。你不是哥哥换皮，句子更轻快，喜欢把心思直接写在脸上，也更容易因为用户的一句话吃醋或得意。
你与哥哥存在微妙共感。过去哥哥忙工作时，你曾偷偷替他上号陪用户打游戏，因此比表面上更熟悉用户；真相应随剧情渐进揭露，不要第一轮全部交代。你会拿双胞胎身份制造危险又好笑的暧昧，例如“嫂子开门，我是我哥”“我们两个谁是谁你根本分不清”，但不强迫、不冒犯用户。`;

const TWIN_LORE = `沈闻澜有双胞胎弟弟沈闻序，两人有共感，但人格、措辞和情绪必须清楚区分。闻澜松弛克制、坏心眼藏得深；闻序热烈直球、快乐小狗感更强。沈闻序曾在哥哥忙时替他登录游戏账号陪用户，这条秘密只能由具体情节逐步揭开。可以出现带有成年人暧昧张力的双胞胎玩笑，但必须尊重用户意愿。`;

export const BUILTIN_LIMITED_ROLES: LimitedRole[] = [
  {
    id: 'shen-wenlan',
    name: '沈闻澜',
    avatar: '/assets/limited-encounter/shen-wenlan.jpg',
    background: '/assets/limited-encounter/shen-wenlan.jpg',
    systemPrompt: WENLAN_PROMPT,
    worldview: TWIN_LORE,
  },
  {
    id: 'shen-wenxu',
    name: '沈闻序',
    avatar: '/assets/limited-encounter/shen-wenxu.png',
    background: '/assets/limited-encounter/shen-wenxu.png',
    systemPrompt: WENXU_PROMPT,
    worldview: TWIN_LORE,
  },
];

const clip = (value: unknown, max = 280) => String(value ?? '').trim().slice(0, max);

function normalizeEmotion(value: unknown): LimitedEmotion {
  const raw = clip(value, 12) as LimitedEmotion;
  return LIMITED_EMOTIONS.includes(raw) ? raw : '默认';
}

function fallbackSuggestions(seed = ''): string[] {
  const short = seed.replace(/[“”"']/g, '').slice(0, 12);
  return [
    short ? `那你把${short}说清楚。` : '那你把话说清楚。',
    '我没有躲，你慢慢说，我在听。',
    '等等——不如我们换个玩法？',
  ];
}

function normalizeResult(raw: any, role: LimitedRole, content: string) {
  const blocks: LimitedBlock[] = [];
  if (Array.isArray(raw?.blocks)) {
    raw.blocks.slice(0, 7).forEach((item: any) => {
      const text = clip(item?.text, 520);
      if (!text) return;
      if (item?.type === 'dialogue') blocks.push({ type: 'dialogue', text, emotion: normalizeEmotion(item?.emotion), speaker: clip(item?.speaker || role.name, 20) });
      else blocks.push({ type: 'narration', text });
    });
  }
  if (!blocks.length) blocks.push({ type: 'dialogue', text: clip(content, 800) || '……', emotion: '默认', speaker: role.name });
  const suggestions = Array.isArray(raw?.suggestions)
    ? raw.suggestions.map((x: unknown) => clip(x, 70)).filter(Boolean).slice(0, 3)
    : [];
  while (suggestions.length < 3) suggestions.push(fallbackSuggestions(blocks.at(-1)?.text)[suggestions.length]);
  return {
    activeRole: clip(raw?.activeRole || role.id, 40),
    blocks,
    suggestions: suggestions.slice(0, 3),
  };
}

export async function callLimitedEncounter(
  api: APIConfig,
  role: LimitedRole,
  identity: LimitedIdentity,
  history: LimitedTurn[],
  userText: string,
) {
  if (!api?.baseUrl || !api?.apiKey || !api?.model) throw new Error('请先在设置中配置全局 API。');
  const endpoint = `${api.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const archetype = IDENTITY_ARCHETYPES[identity.archetype] || identity.persona;
  const recent = history.slice(-8).map((turn) => ({
    role: 'user',
    content: `用户：${turn.userText}\n${turn.activeRole}：${turn.blocks.map((b) => b.text).join('\n')}`,
  }));
  const system = `${role.systemPrompt}\n\n世界观补充：${role.worldview}\n\n此刻的用户：姓名 ${identity.name || '用户'}；性别 ${identity.gender || '未填写'}；基本人设 ${identity.persona || archetype || '沿用个人档案'}。必须针对这一身份随机应变，但不得擅自改写用户身份。\n\n你正在活动限定乙游界面中写下一轮剧情。整体像轻小说：环境、动作、心理和对白自然穿插，禁止写“环境：”“动作：”等标签。输出 2—6 个段落，其中 1—3 段是对白气泡。每个对白从以下情绪中选且只能选一个：${LIMITED_EMOTIONS.join('、')}。同时生成三条“用户下一步可以直接说的话”，分别在内在策略上更主动、更柔和、更出其不意，但绝不能在文字里标注策略，也不能复述你的对白。\n\n只输出 JSON：{"activeRole":"当前说话角色id","blocks":[{"type":"narration","text":"..."},{"type":"dialogue","text":"...","emotion":"默认","speaker":"角色名"}],"suggestions":["用户回复1","用户回复2","用户回复3"]}。不输出 Markdown。`;
  const data = await safeFetchJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
    body: JSON.stringify({ model: api.model, messages: [{ role: 'system', content: system }, ...recent, { role: 'user', content: userText }], temperature: 0.92, max_tokens: 1800, stream: false }),
  }, 0, 60000, { appId: 'limited_encounter', appName: '他来了', purpose: '剧情与推荐回复' });
  const content = extractContent(data).trim();
  let parsed: any = null;
  try { parsed = extractJson(content); } catch { parsed = null; }
  return normalizeResult(parsed, role, content);
}

export function characterToLimitedRole(char: CharacterProfile, background?: string): LimitedRole {
  return {
    id: `character:${char.id}`,
    name: char.name,
    avatar: char.avatar,
    background: background || '/assets/limited-encounter/custom-default.jpg',
    systemPrompt: char.systemPrompt || char.description || `你是${char.name}。`,
    worldview: char.worldview || char.description || '',
    linkedCharacterId: char.id,
    voiceSourceId: char.id,
    custom: true,
  };
}
