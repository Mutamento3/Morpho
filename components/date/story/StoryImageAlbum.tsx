import React, { useEffect, useState } from 'react';
import TokenImg from '../../os/TokenImg';
import ConfirmDialog from '../../os/ConfirmDialog';
import { deleteStoryAlbumPhotos, loadStoryImageAlbum, type StoryAlbumPhoto } from '../../../utils/storyImageAlbum';

export default function StoryImageAlbum({ storyId, title, revision, onClose }: { storyId: string; title: string; revision: number; onClose: () => void }) {
    const [photos, setPhotos] = useState<StoryAlbumPhoto[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [selecting, setSelecting] = useState(false);
    const [detail, setDetail] = useState<StoryAlbumPhoto | null>(null);
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => { let cancelled = false; setLoading(true); void loadStoryImageAlbum(storyId).then(items => { if (!cancelled) { setPhotos(items); setError(''); } }).catch(() => { if (!cancelled) setError('相册读取失败，请关闭后重试'); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [storyId, revision]);
    const remove = async () => {
        if (busy) return;
        setBusy(true); setConfirm(false);
        try {
            await deleteStoryAlbumPhotos(storyId, [...selected]);
            setPhotos(await loadStoryImageAlbum(storyId)); setSelected(new Set()); setSelecting(false); setError('');
        } catch { setError('删除失败，请重试'); }
        finally { setBusy(false); }
    };
    return <section role="dialog" aria-modal="true" aria-label="剧情相册" className="fixed inset-0 z-[90] flex flex-col bg-stone-50 text-slate-700" style={{ paddingTop: 'var(--safe-top, 0px)' }}>
        <header className="flex shrink-0 items-center gap-3 border-b p-4">
            <button disabled={busy} onClick={detail ? () => setDetail(null) : onClose} className="p-2">返回</button>
            <div className="min-w-0 flex-1"><h2 className="font-semibold">剧情相册</h2><p className="truncate text-xs text-slate-400">{title} · {photos.length} 张</p></div>
            {!detail && <button disabled={busy || loading || !photos.length} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }} className="p-2 text-violet-600 disabled:opacity-40">{selecting ? '取消' : '多选'}</button>}
        </header>
        {error && <p role="alert" className="p-3 text-sm text-rose-600">{error}</p>}
        {detail ? <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-2"><TokenImg value={detail.imageRef} alt={detail.caption} className="max-h-full max-w-full object-contain" /></div> : <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? <p className="py-16 text-center text-sm">正在读取相册…</p> : !photos.length ? <p className="px-5 py-16 text-center text-sm text-slate-400">还没有收藏的配图，剧情生成的图片会自动收录在这里。</p> : <div className="grid grid-cols-3 gap-2">{photos.map(photo => <button key={photo.id} disabled={busy} aria-label={selecting ? '选择' + photo.caption : '查看' + photo.caption} aria-pressed={selecting ? selected.has(photo.id) : undefined} onClick={() => selecting ? setSelected(current => { const next = new Set(current); next.has(photo.id) ? next.delete(photo.id) : next.add(photo.id); return next; }) : setDetail(photo)} className="relative aspect-square overflow-hidden rounded-lg bg-stone-200">
                <TokenImg value={photo.imageRef} alt={photo.caption} loading="lazy" className="h-full w-full object-cover" />
                {selecting && <span className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-white text-white ${selected.has(photo.id) ? 'bg-violet-500' : 'bg-black/30'}`}>{selected.has(photo.id) ? '✓' : ''}</span>}
            </button>)}</div>}
        </div>}
        {selecting && !detail && <footer className="flex shrink-0 items-center gap-3 border-t bg-white p-4" style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)' }}>
            <button disabled={busy || loading} onClick={() => setSelected(selected.size === photos.length ? new Set() : new Set(photos.map(p => p.id)))} className="text-sm text-violet-600">{selected.size === photos.length ? '取消全选' : '全选'}</button>
            <span className="flex-1 text-xs">已选 {selected.size} 张</span><button disabled={busy || !selected.size} onClick={() => setConfirm(true)} className="rounded-xl bg-rose-500 px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? '删除中…' : '删除已选'}</button>
        </footer>}
        <ConfirmDialog isOpen={confirm} title="删除剧情照片" message={`确定从相册删除这 ${selected.size} 张图片吗？正文配图和剧情记录保留，删除后不会自动重新收录。`} variant="danger" onConfirm={() => void remove()} onCancel={() => setConfirm(false)} />
    </section>;
}
