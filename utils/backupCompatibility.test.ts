import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { writeV2Backup } from './backupFormat';
import { assembleCompatibleBackup, COMPAT_ASSET_PREFIX, getBackupCompatibilityNotice } from './backupCompatibility';
import { DB } from './db';

async function sample() {
    const zip = new JSZip();
    const manifest = await writeV2Backup(zip, {
        characters: [{ id: 'compat-char', name: 'Test', avatar: 'blobref:sample', spriteConfig: { futureLive2d: true } }],
        vrLetters: [{ id: 'letter-test', content: 'keep' }],
        futureRoom: [{ id: 'room-test', image: 'assets/room.png' }],
        home3DLocal: { future: 'keep', encoded: JSON.stringify({ image: 'assets/room.png' }) },
    }, {});
    manifest.formatVersion = 3;
    zip.file('blobs/index.json', JSON.stringify([{ id: 'sample', type: 'image/png', size: 3 }]));
    zip.file('blobs/sample', new Uint8Array([1, 2, 3]));
    zip.file('assets/room.png', new Uint8Array([3, 2, 1]));
    return { zip, manifest };
}

describe('原版 v3 兼容', () => {
    it('仅识别兼容数据标记，普通备份不误报来源，往返后继续提示', () => {
        expect(getBackupCompatibilityNotice({})).toBeNull();
        expect(getBackupCompatibilityNotice({ assets: [{ id: 'wallpaper' }] })).toBeNull();
        const notice = getBackupCompatibilityNotice({ assets: [{ id: COMPAT_ASSET_PREFIX + 'metadata' }] });
        expect(notice).toContain('会保留其数据');
        expect(notice).toContain('不会在小手机中显示');
        expect(notice).toContain('完整备份');
    });
    it('恢复图片引用并保留角色未知字段、彼方和新增功能，完整备份往返保留', async () => {
        const { zip, manifest } = await sample();
        const data = await assembleCompatibleBackup(zip, manifest);
        expect(data.characters[0].avatar).toBe('data:image/png;base64,AQID');
        expect(data.characters[0].spriteConfig.futureLive2d).toBe(true);
        expect(data.vrLetters[0].content).toBe('keep');
        const retained = data.assets.find((a: any) => a.id === `${COMPAT_ASSET_PREFIX}futureRoom_0`);
        expect(retained.compatibility.value[0].image).toBe('assets/room.png');
        expect(data.assets.find((a: any) => a.id === COMPAT_ASSET_PREFIX + 'embedded_0').compatibility.files[0]).toEqual({ path: 'assets/room.png', content: 'assets/room.png' });
        await DB.importFullData(data, { beforeWrite: async root => {
            const visit = (obj: any) => { if (!obj || typeof obj !== 'object') return; for (const key of Object.keys(obj)) { if (obj[key] === 'assets/room.png') obj[key] = 'data:image/png;base64,AwIB'; else visit(obj[key]); } };
            visit(root);
        } });
        const assets = await DB.getAllAssets();
        expect((assets.find(a => a.id === retained.id) as any).compatibility.value[0].image).toBe('data:image/png;base64,AwIB');
        const output = new JSZip();
        const v2 = await writeV2Backup(output, { assets }, {});
        const restored = await assembleCompatibleBackup(output, v2);
        expect(restored.assets).toEqual(assets);
    });
    it('缺少图片文件时写库之前失败', async () => {
        const { zip, manifest } = await sample(); zip.remove('blobs/sample');
        await expect(assembleCompatibleBackup(zip, manifest)).rejects.toThrow('缺少 Blob');
    });
    it('未随包附带的旧图片引用保留并报告，不删其他数据', async () => {
        const { zip, manifest } = await sample(); zip.remove('blobs/index.json');
        let warning = '';
        const data = await assembleCompatibleBackup(zip, manifest, { onCompatibilityWarning: message => { warning = message; } });
        expect(data.characters[0].avatar).toBe('blobref:sample');
        expect(warning).toContain('1 个图片引用');
    });
    it('仍然校验分片条数与图片长度', async () => {
        const { zip, manifest } = await sample(); manifest.stores.characters.count = 9;
        await expect(assembleCompatibleBackup(zip, manifest)).rejects.toThrow('对不上');
        manifest.stores.characters.count = 1; zip.file('blobs/sample', new Uint8Array([1]));
        await expect(assembleCompatibleBackup(zip, manifest)).rejects.toThrow('大小不符');
    });
    it('不猜测未来格式', async () => {
        const { zip, manifest } = await sample(); manifest.formatVersion = 4;
        await expect(assembleCompatibleBackup(zip, manifest)).rejects.toThrow('不支持');
    });
});
