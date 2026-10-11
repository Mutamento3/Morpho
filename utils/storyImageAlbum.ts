import type { Message } from '../types';
import { DB } from './db';
export interface StoryAlbumPhoto { id: string; imageRef: string; timestamp: number; messageId: number; caption: string }
interface Album { photos: StoryAlbumPhoto[]; removed: string[] }
const key = (storyId: string) => 'story-image-album:' + storyId;
const empty = (): Album => ({ photos: [], removed: [] });
export async function collectStoryPhotos(messages: Message[]): Promise<StoryAlbumPhoto[]> {
    const photos: StoryAlbumPhoto[] = [];
    for (const message of messages) {
        if (message.metadata?.source !== 'story_theater') continue;
        const frames = Array.isArray(message.metadata?.theaterImageFrames) ? message.metadata.theaterImageFrames : [];
        const refs = frames.length ? frames.map((f: any, i: number) => ({ ref: f.imageRef, caption: '分镜 ' + (i + 1) })) : [{ ref: message.metadata?.theaterImageRef, caption: '剧情配图' }];
        for (const frame of refs) {
            if (typeof frame.ref !== 'string' || !frame.ref) continue;
            const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message.id + ':' + frame.ref));
            const id = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
            photos.push({ id, imageRef: frame.ref, timestamp: message.timestamp, messageId: message.id, caption: frame.caption });
        }
    }
    return photos;
}
export async function syncStoryImageAlbum(storyId: string, messages: Message[]): Promise<void> {
    const incoming = await collectStoryPhotos(messages);
    if (!incoming.length) return;
    await DB.updateAssetRaw(key(storyId), (saved: Album | null) => {
        const album = saved || empty();
        const known = new Set([...album.removed, ...album.photos.map(photo => photo.id)]);
        return { ...album, photos: [...album.photos, ...incoming.filter(photo => { if (known.has(photo.id)) return false; known.add(photo.id); return true; })] };
    });
}
export async function loadStoryImageAlbum(storyId: string): Promise<StoryAlbumPhoto[]> {
    const album: Album = await DB.getAssetRaw(key(storyId)) || empty();
    return [...album.photos].sort((a, b) => b.timestamp - a.timestamp);
}
export async function deleteStoryAlbumPhotos(storyId: string, ids: string[]): Promise<void> {
    const selected = new Set(ids);
    await DB.updateAssetRaw(key(storyId), (saved: Album | null) => {
        const album = saved || empty();
        const removed = album.photos.filter(photo => selected.has(photo.id)).map(photo => photo.id);
        return { photos: album.photos.filter(photo => !selected.has(photo.id)), removed: [...new Set([...album.removed, ...removed])] };
    });
}
