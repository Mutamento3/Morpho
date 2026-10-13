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
    status?: { vitality: string; pressure: string; note: string; indicator: number | null };
}

const clean = (value: unknown, limit = 90): string => typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, limit) : '';
const lines = (value: unknown): string[] => Array.isArray(value) ? value.map(item => clean(item)).filter(Boolean).slice(0, 5) : [];
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
        const result = {
            location: clean(source.location),
            routes: lines(source.routes),
            inventory: parseInventory(source.inventory),
            tasks: lines(source.tasks),
            log: lines(source.log),
            ...(objective ? { objective } : {}),
            ...(status ? { status } : {}),
        };
        return result.location || result.routes.length || result.inventory.length || result.tasks.length || result.log.length || result.objective || result.status ? result : null;
    } catch {
        return null;
    }
}
