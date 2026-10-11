import { describe, it, expect, vi } from 'vitest';
import { DB } from './db';
import type { Message } from '../types';

describe('相册批量删除', () => {
  it('只删除选中的相册记录，保留其他照片、其他角色和聊天消息', async () => {
    const charId = 'gallery-batch-a';
    const url = 'data:image/png;base64,test';
    for (const [id, owner] of [['batch-a', charId], ['batch-b', charId], ['batch-keep', charId], ['batch-other', 'gallery-batch-b']]) {
      await DB.saveGalleryImage({ id, charId: owner, url, timestamp: 1 });
    }
    await DB.saveMessage({ id: 987654321, charId, role: 'user', type: 'image', content: url, timestamp: 1 } as Message);
    await DB.deleteGalleryImages(['batch-a', 'batch-b', 'batch-a', 'not-present']);
    expect((await DB.getGalleryImages(charId)).map(img => img.id)).toEqual(['batch-keep']);
    expect((await DB.getGalleryImages('gallery-batch-b')).map(img => img.id)).toEqual(['batch-other']);
    expect((await DB.getMessagesByCharId(charId)).find(msg => msg.id === 987654321)?.content).toBe(url);
  });
  it('事务中止时不会留下部分删除', async () => {
    for (const id of ['rollback-a', 'rollback-b']) await DB.saveGalleryImage({ id, charId: 'gallery-rollback', url: 'test', timestamp: 1 });
    const original = IDBObjectStore.prototype.delete;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key: IDBValidKey) {
      const request = original.call(this, key);
      if (key === 'rollback-b') this.transaction.abort();
      return request;
    });
    try { await expect(DB.deleteGalleryImages(['rollback-a', 'rollback-b'])).rejects.toThrow(); }
    finally { spy.mockRestore(); }
    expect((await DB.getGalleryImages('gallery-rollback')).map(img => img.id).sort()).toEqual(['rollback-a', 'rollback-b']);
  });
  it('空选择不执行删除', async () => { await expect(DB.deleteGalleryImages([])).resolves.toBeUndefined(); });
});
