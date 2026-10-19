import { expect, it } from 'vitest';
import { DB } from './db';

it('deletes matching private image messages only and supports older records without message ids', async () => {
    const charId = 'gallery-delete-test';
    await DB.saveGalleryImage({ id: 'delete-image', charId, url: 'data:image/png;base64,AAAA', timestamp: 1 });
    await DB.saveGalleryImage({ id: 'keep-image', charId, url: 'different-image', timestamp: 2 });
    await DB.saveMessage({ charId, role: 'user', type: 'image', content: 'data:image/png;base64,AAAA' });
    await DB.saveMessage({ charId, role: 'assistant', type: 'image', content: 'data:image/png;base64,AAAA' });
    await DB.saveMessage({ charId, role: 'user', type: 'text', content: 'data:image/png;base64,AAAA' });
    await DB.saveMessage({ charId, role: 'assistant', type: 'image', content: 'different-image' });
    await DB.saveMessage({ charId: charId + '-other', role: 'user', type: 'image', content: 'data:image/png;base64,AAAA' });
    await DB.deleteGalleryImages(['delete-image', 'delete-image', 'missing'], true);
    const messages = await DB.getMessagesByCharId(charId, true);
    expect(messages.map(m => m.type)).toEqual(['text', 'image']);
    expect((await DB.getMessagesByCharId(charId + '-other', true))).toHaveLength(1);
    expect((await DB.getGalleryImages(charId)).map(i => i.id)).toEqual(['keep-image']);
});

it('keeps the old gallery-only API semantics for other callers', async () => {
    await DB.saveGalleryImage({ id: 'gallery-only', charId: 'gallery-only', url: 'image-only', timestamp: 1 });
    await DB.saveMessage({ charId: 'gallery-only', role: 'user', type: 'image', content: 'image-only' });
    await DB.deleteGalleryImage('gallery-only');
    expect(await DB.getGalleryImages('gallery-only')).toHaveLength(0);
    expect(await DB.getMessagesByCharId('gallery-only', true)).toHaveLength(1);
});
