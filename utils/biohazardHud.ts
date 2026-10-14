/** State carried by the biohazard story. Images are chosen locally by category. */
export const BIO_ITEM_CATEGORIES = {
    usb: '存储设备',
    fuse: '保险丝',
    knife: '刀具',
    virus: '病毒样本',
    floppy: '软盘',
    battery: '电池',
    parts: '机械零件',
    keycard: '门禁卡',
    spray: '急救喷雾',
    handgun: '手枪',
    document: '文件',
    chip: '电子芯片',
    medicine: '药品',
    injector: '注射器',
    ammo: '弹药',
} as const;

export type BioItemCategory = keyof typeof BIO_ITEM_CATEGORIES;

export interface BiohazardRosterMember { id: string; name: string }
export interface BiohazardMemberStatus extends BiohazardRosterMember {
    vitality: { value: number | null; text: string };
    pressure: { value: number | null; text: string };
}

export interface BiohazardInventoryItem {
    category: BioItemCategory | null;
    name: string;
    quantity: number;
    detail: string;
}

export interface BiohazardHudState {
    location: string;
    routes: string[];
    inventory: BiohazardInventoryItem[];
    tasks: string[];
    log: string[];
    objective?: string;
    members?: BiohazardMemberStatus[];
    storyTime?: string;
    alert?: string;
    tags?: string[];
    communications?: { sender: string; time: string; text: string }[];
    status?: { vitality: string; pressure: string; note: string; indicator: number | null };
}

const clean = (value: unknown, limit = 90): string => typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, limit) : '';
const lines = (value: unknown): string[] => Array.isArray(value) ? value.map(item => clean(item)).filter(Boolean).slice(0, 5) : [];
const score = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
const metric = (value: unknown): BiohazardMemberStatus['vitality'] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { value: null, text: '' };
    const raw = value as Record<string, unknown>;
    return { value: score(raw.value), text: clean(raw.text, 80) };
};
const parseMembers = (value: unknown): BiohazardMemberStatus[] => Array.isArray(value) ? value.slice(0, 50).flatMap(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const id = clean(raw.id, 100), name = clean(raw.name, 50);
    return id || name ? [{ id, name, vitality: metric(raw.vitality), pressure: metric(raw.pressure) }] : [];
}) : [];

export const biohazardRosterSnapshot = (value: unknown, fallback: BiohazardRosterMember[]): BiohazardRosterMember[] => {
    if (!Array.isArray(value)) return fallback;
    const roster = value.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string').map(item => ({ id: item.id, name: item.name }));
    return roster.length ? roster : fallback;
};

export const resolveBiohazardMembers = (state: BiohazardHudState | null, roster: BiohazardRosterMember[]): BiohazardMemberStatus[] => roster.map(person => {
    const match = state?.members?.find(item => item.id === person.id)
        || (roster.filter(item => item.name === person.name).length === 1 ? state?.members?.find(item => !item.id && item.name === person.name) : undefined);
    return { ...person, vitality: match?.vitality || { value: null, text: '' }, pressure: match?.pressure || { value: null, text: '' } };
});

export const buildBiohazardPartyGuide = (roster: BiohazardRosterMember[]): string => `主角团状态名单（用户在前，角色随后）：${JSON.stringify(roster)}。每轮 bio_state.members 必须按这个顺序逐人输出，准确复制 id 和 name；每人分别提供 vitality 与 pressure 对象，各含 value（0—100 整数）和 text（简短原因或状态）。体力越高越充沛，压力越高越紧张；两项都是虚构剧情游戏数值。首次根据该人开局情况建立数值，此后继承上一轮，按本轮行动、休息、受伤或事件独立变化；无变化保持，不自动全员下降、不把一个人的数值复制给全队。不省略暂时离队的主角团成员，无法观察时沿用最后记录并注明。`;
const validCategory = (value: unknown): BioItemCategory | null =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(BIO_ITEM_CATEGORIES, value) ? value as BioItemCategory : null;

/** Old string entries can still be displayed; ambiguous items deliberately get no artwork. */
const legacyCategory = (name: string): BioItemCategory | null => {
    const patterns: Array<[BioItemCategory, RegExp]> = [
        ['usb', /U盘|优盘|闪存盘/i], ['fuse', /保险丝|熔断器/], ['knife', /刀|匕首/],
        ['virus', /病毒样本|病毒试剂/], ['floppy', /软盘/], ['battery', /电池|电源模块/],
        ['parts', /齿轮|机械零件|螺栓/], ['keycard', /门禁卡|磁卡|通行卡/],
        ['spray', /急救喷雾|医疗喷雾/], ['handgun', /手枪/], ['document', /文件|档案|笔记/],
        ['chip', /芯片|处理器/], ['medicine', /药盒|药瓶|药片/],
        ['injector', /注射器|针剂/], ['ammo', /子弹|弹药|弹匣/],
    ];
    return patterns.find(([, pattern]) => pattern.test(name))?.[0] || null;
};

const parseInventory = (value: unknown): BiohazardInventoryItem[] => {
    if (!Array.isArray(value)) return [];
    const items: BiohazardInventoryItem[] = [];
    for (const source of value.slice(0, 25)) {
        if (items.length >= 20) break;
        if (typeof source === 'string') {
            const name = clean(source, 38);
            if (name) items.push({ category: legacyCategory(name), name, quantity: 1, detail: '' });
            continue;
        }
        if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
        const candidate = source as Record<string, unknown>;
        const name = clean(candidate.name, 38);
        if (!name) continue;
        const category = validCategory(candidate.category);
        const rawQuantity = candidate.quantity;
        const quantity = typeof rawQuantity === 'number' && Number.isInteger(rawQuantity) && rawQuantity > 0 && rawQuantity <= 99 ? rawQuantity : 1;
        items.push({ category, name, quantity, detail: clean(candidate.detail, 70) });
    }
    return items;
};

const parseStatus = (value: unknown): BiohazardHudState['status'] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const source = value as Record<string, unknown>;
    const vitality = clean(source.vitality, 55);
    const pressure = clean(source.pressure, 55);
    const note = clean(source.note, 100);
    const indicator = typeof source.indicator === 'number' && Number.isFinite(source.indicator)
        ? Math.max(0, Math.min(100, Math.round(source.indicator))) : null;
    return vitality || pressure || note || indicator !== null ? { vitality, pressure, note, indicator } : undefined;
};

export function parseBiohazardHudState(content: string): BiohazardHudState | null {
    const matches = [...String(content || '').matchAll(/<bio_state\b[^>]*>([\s\S]*?)<\/bio_state\s*>/gi)];
    const raw = matches[matches.length - 1]?.[1];
    if (!raw || raw.length > 12000) return null;
    try {
        const source = JSON.parse(raw) as Record<string, unknown>;
        if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
        const objective = clean(source.objective);
        const status = parseStatus(source.status);
        const members = parseMembers(source.members);
        const communications = Array.isArray(source.communications) ? source.communications.slice(0, 5).flatMap(entry => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
            const text = clean(entry.text, 240);
            return text ? [{ sender: clean(entry.sender, 40) || '来源未记录', time: clean(entry.time, 40), text }] : [];
        }) : [];
        const result = {
            location: clean(source.location),
            routes: lines(source.routes),
            inventory: parseInventory(source.inventory),
            tasks: lines(source.tasks),
            log: lines(source.log),
            ...(objective ? { objective } : {}),
            ...(status ? { status } : {}),
            ...(members.length ? { members } : {}),
            ...(clean(source.storyTime, 50) ? { storyTime: clean(source.storyTime, 50) } : {}),
            ...(clean(source.alert, 30) ? { alert: clean(source.alert, 30) } : {}),
            ...(lines(source.tags).length ? { tags: lines(source.tags).slice(0, 3) } : {}),
            ...(communications.length ? { communications } : {}),
        };
        return result.location || result.routes.length || result.inventory.length || result.tasks.length || result.log.length || result.objective || result.status || result.storyTime || result.communications || result.members ? result : null;
    } catch {
        return null;
    }
}
