import { describe, expect, it } from 'vitest';
import { DB } from './db';
import type { Message } from '../types';
import { syncStoryImageAlbum, loadStoryImageAlbum, deleteStoryAlbumPhotos } from './storyImageAlbum';
const message = (ref: string, legacy = false): Message => ({ id: 9001, charId: 'story-album-test', role: 'assistant', type: 'text', content: '正文', timestamp: 100, metadata: { source: 'story_theater', ...(legacy ? { theaterImageRef: ref } : { theaterImageFrames: [{ imageRef: ref }] }) } } as Message);
describe('剧情相册', () => {
  it('兼容旧配图，重复收录去重，重生成保留旧图', async () => {
    await syncStoryImageAlbum('album-history', [message('old', true)]);
    await syncStoryImageAlbum('album-history', [message('old', true), message('new')]);
    await syncStoryImageAlbum('album-history', [message('new')]);
    expect((await loadStoryImageAlbum('album-history')).map(p => p.imageRef)).toEqual(['old', 'new']);
  });
  it('删除只影响本相册，旧图不会重新收录，正文保留', async () => {
    const original = message('shared-image');
    await DB.saveMessage(original);
    await syncStoryImageAlbum('album-a', [original]);
    await syncStoryImageAlbum('album-b', [original]);
    const photos = await loadStoryImageAlbum('album-a');
    await deleteStoryAlbumPhotos('album-a', photos.map(p => p.id));
    await syncStoryImageAlbum('album-a', [original]);
    expect(await loadStoryImageAlbum('album-a')).toHaveLength(0);
    expect(await loadStoryImageAlbum('album-b')).toHaveLength(1);
    expect((await DB.getMessagesByCharId(original.charId, true)).find(p => p.id === original.id)?.metadata?.theaterImageFrames[0].imageRef).toBe('shared-image');
  });
  it('并发收录不会覆盖其他图片', async () => {
    await Promise.all([syncStoryImageAlbum('album-race', [message('one')]), syncStoryImageAlbum('album-race', [message('two')])]);
    expect(await loadStoryImageAlbum('album-race')).toHaveLength(2);
  });
});
