import React from 'react';
import type { ExplorationNote as Note } from '../../../utils/explorationNote';
import './ExplorationNote.css';

const Meter = ({ label, value, kind }: { label: string; value: number | null; kind: string }) => <div className="me-note-stat"><span>{label}</span><div className={`me-note-meter ${kind}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}><i style={{ width: `${value ?? 0}%` }} /></div><span>{value === null ? '未记录' : `${value} / 100`}</span></div>;
const Group = ({ title, rows, open = false }: { title: string; rows: string[]; open?: boolean }) => <details open={open}><summary>{title}</summary><div className="me-note-lines">{rows.length ? rows.map((row, i) => <p key={i}>{row}</p>) : <p className="me-note-muted">暂无记录</p>}</div></details>;

export default function ExplorationNote({ note }: { note: Note }) {
  return <section className="me-exploration-note" aria-label="探险笔记">
    <header>✦ 探 险 笔 记 ✦<small>MORPHO · EXPEDITION LOG</small></header>
    <div className="me-note-meta"><p><b>所在</b>{note.location || '未记录'}<b>时辰</b>{note.time || '未记录'}</p><p><b>目标</b>{note.objective || '未记录'}</p><p><b>探索</b>{note.progress || '未记录'}<b>风险</b><span aria-label={note.risk === null ? '风险未记录' : `风险 ${note.risk} / 5`}>{note.risk === null ? '未记录' : '●'.repeat(note.risk) + '○'.repeat(5 - note.risk)}</span></p></div>
    {note.people.map((person, i) => <details open key={`${person.name}-${i}`}><summary>{person.name || `同行者 ${i + 1}`}</summary><div className="me-note-person">
      <Meter label="体力" value={person.stamina} kind="me-note-hp" /><Meter label="精神" value={person.spirit} kind="me-note-sp" />
      <div className="me-note-attrs"><span>智慧 <b>{person.intelligence ?? '—'}</b></span><span>敏捷 <b>{person.agility ?? '—'}</b></span></div>
      {person.modifiers && <p className="me-note-muted">临时修正：{person.modifiers}</p>}
      <p>状态：{person.state || '未记录'}</p><p>伤势：{person.injuries || '未记录'}</p><p>持有：{person.items || '未记录'}</p>
    </div></details>)}
    <Group title="共同行囊" rows={note.supplies} /><Group title="已知线索" rows={note.clues} open />
    <Group title="人物当前状态" rows={note.states} /><Group title="剧情走向" rows={note.consequences} />
    <Group title="同行协作" rows={note.cooperation} />
  </section>;
}
