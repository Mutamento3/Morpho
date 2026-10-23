const DAY_MS = 24 * 60 * 60 * 1000;
export type MomentChatSource = { role: string; type: string; content: string; timestamp: number; metadata?: any };
const clean = (text: string) => text.replace(/\[\[[\s\S]*?\]\]/g, '').replace(/\s+/g, ' ').trim();
const meaningful = (text: string) => {
    const words = clean(text).replace(/[\p{P}\p{S}\s]/gu, '');
    return words.length >= 2 && !/^(?:嗯|哦|啊|哈|好|好的|收到|知道了|晚安|早安|ok)+$/i.test(words);
};

export function selectMomentsRecentChat<T extends MomentChatSource>(rows: T[], now: number, before = now, limit = 5): T[] {
    return rows.filter(row => Number.isFinite(row.timestamp)
        && row.timestamp > now - DAY_MS && row.timestamp <= Math.min(now, before)
        && (row.role === 'user' || row.role === 'assistant')
        && (row.type === 'text' ? meaningful(row.content)
            : row.type === 'travel_card' && meaningful(String(row.metadata?.travelCard?.body || row.content || ''))))
        .sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
}

