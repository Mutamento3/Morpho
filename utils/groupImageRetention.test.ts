import { expect, it } from 'vitest';
import { DB } from './db';

it('retains 200 images per group, clears old quote payloads, preserves private chats and is repeatable', async () => {
    const groupId = 'retention-test';
    let first = 0;
    for (let i = 0; i < 202; i++) {
        const id = await DB.saveMessage({ charId: 'user', groupId, role: 'user', type: 'image', content: 'image-' + i });
        if (!i) first = id;
    }
    await DB.saveMessage({ charId: 'user', groupId, role: 'user', type: 'text', content: '文字保留', replyTo: { id: first, name: '我', content: 'image-0' } });
    await DB.saveMessage({ charId: 'user', groupId: 'other-retention', role: 'user', type: 'image', content: 'image-0' });
    const privateId = await DB.saveMessage({ charId: 'retention-private', role: 'user', type: 'image', content: 'image-0' });
    expect(await DB.pruneGroupImages(groupId)).toBe(2);
    const messages = await DB.getGroupMessages(groupId);
    expect(messages.filter(m => m.type === 'image')).toHaveLength(200);
    expect(messages[0].content).toContain('图片已自动清理');
    expect(messages[2].content).toBe('image-2');
    expect(messages.at(-1)?.content).toBe('文字保留');
    expect(messages.at(-1)?.replyTo?.content).toBe('[图片已自动清理]');
    expect((await DB.getGroupMessages('other-retention'))[0].type).toBe('image');
    expect((await DB.getMessagesByCharId('retention-private', true))[0].id).toBe(privateId);
    expect(await DB.pruneGroupImages(groupId)).toBe(0);
});
