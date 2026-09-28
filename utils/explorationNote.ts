export interface ExplorationPerson {
  name: string; stamina: number | null; spirit: number | null;
  intelligence: number | null; agility: number | null;
  modifiers: string; state: string; injuries: string; items: string;
}
export interface ExplorationNote {
  location: string; time: string; objective: string; progress: string; risk: number | null;
  people: ExplorationPerson[]; supplies: string[]; clues: string[];
  states: string[]; consequences: string[]; cooperation: string[];
}
const text = (value: unknown, max = 1500): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value: unknown, max: number): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.round(parsed))) : null;
};
const lines = (value: unknown): string[] => (Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : [])
  .map(item => text(item)).filter(Boolean).slice(0, 30);

export function parseExplorationNote(source: string): ExplorationNote | null {
  try {
    const raw = JSON.parse(source.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const people = (Array.isArray(raw.people) ? raw.people : []).filter((p: unknown) => p && typeof p === 'object').slice(0, 12).map((p: any) => ({
      name: text(p.name, 80), stamina: number(p.stamina, 100), spirit: number(p.spirit, 100),
      intelligence: number(p.intelligence, 20), agility: number(p.agility, 20),
      modifiers: text(p.modifiers), state: text(p.state), injuries: text(p.injuries), items: text(p.items),
    }));
    const note = { location: text(raw.location), time: text(raw.time), objective: text(raw.objective), progress: text(raw.progress), risk: number(raw.risk, 5), people,
      supplies: lines(raw.supplies), clues: lines(raw.clues), states: lines(raw.states), consequences: lines(raw.consequences), cooperation: lines(raw.cooperation) };
    if (!note.location && !note.objective && !people.length && !note.clues.length && !note.supplies.length) return null;
    return note;
  } catch { return null; }
}
