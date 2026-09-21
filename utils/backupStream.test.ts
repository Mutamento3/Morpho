import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { DB, openDB } from './db';
import { assembleV2Backup, writeV2Backup } from './backupFormat';
import { writeCompressedBackupFile, writeStreamedBackupStore } from './backupStream';

// These exercise the export format with the real ZIP implementation and real DB
// methods (fake-indexeddb only supplies the browser storage API).
async function seedStore(name: string, records: any[]): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(name, 'readwrite');
        const store = transaction.objectStore(name);
        store.clear();
        records.forEach(record => store.put(record));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

const imageBytes = new Uint8Array([137, 80, 78, 71, 0, 255, 1, 127, 128, 42]);
const blobBytes = new Uint8Array([0, 254, 13, 10, 99, 200, 255, 2]);
const dataURL = (bytes: Uint8Array, mime = 'image/png') =>
    `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const imageURL = dataURL(imageBytes);
const blobURL = dataURL(blobBytes, 'image/webp');
const character = { id: 'c1', name: 'Morpho', bio: 'Keep my words', avatar: '' };

async function finishArchive(zip: JSZip, store: { parts: number; count: number }, mode: string, metadata: Record<string, any>, field = 'messages') {
    await writeV2Backup(zip, metadata, { mode, prewrittenStores: { [field]: store } });
    // Serialize and reopen: an in-memory JSZip object alone is not a valid backup.
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const reopened = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const manifest = JSON.parse(await reopened.file('manifest.json')!.async('string'));
    return { zip: reopened, manifest, data: await assembleV2Backup(reopened, manifest) };
}

// DB.importFullData's public beforeWrite hook is where the UI restores ZIP assets.
// Keep this small test adapter independent of the exporter and verify bytes first.
async function restoreZipAssets(root: any, zip: JSZip): Promise<void> {
    if (!root || typeof root !== 'object') return;
    for (const key of Object.keys(root)) {
        const value = root[key];
        if (typeof value === 'string' && value.startsWith('assets/')) {
            const file = zip.file(value);
            expect(file, `Missing referenced file ${value}`).not.toBeNull();
            const ext = value.split('.').pop()!;
            const mime = ({ webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp' } as Record<string, string>)[ext] || 'image/png';
            root[key] = dataURL(await file!.async('uint8array'), mime);
        } else if (value && typeof value === 'object') {
            await restoreZipAssets(value, zip);
        }
    }
}

beforeEach(async () => {
    for (const name of ['messages', 'characters', 'gallery', 'blob_assets']) await seedStore(name, []);
});

afterEach(() => vi.restoreAllMocks());

describe('streamed backup: real archive and database round-trip', () => {
    it('exports 1,200 messages without getAll; removes nested images before retaining rows, preserves every text and restores every shard', async () => {
        const largeImage = dataURL(new Uint8Array(4096).fill(97));
        const source = Array.from({ length: 1200 }, (_, index) => ({
            id: index + 1,
            charId: 'c1',
            type: index % 3 === 0 ? 'image' : 'text',
            content: `第 ${index + 1} 条：今天也记得这段话。`,
            nested: {
                attachments: [largeImage, { thumbnail: 'blobref:original-image', temporary: 'blob:local-image' }],
                remote: 'https://example.test/image.png',
                audio: 'data:audio/wav;base64,AQID',
                quote: `保留引用 ${index + 1}`,
            },
        }));
        await seedStore('messages', [...source].reverse());
        const originalGetAll = IDBObjectStore.prototype.getAll;
        const getAll = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args) {
            if (this.name === 'messages') throw new Error('Export must not load all messages');
            return originalGetAll.apply(this, args);
        });
        const progress: number[][] = [];
        const zip = new JSZip();
        const result = await writeStreamedBackupStore(zip, 'text_only', {
            onProgress: (read, written) => progress.push([read, written]),
        });
        expect(getAll).not.toHaveBeenCalled();
        getAll.mockRestore();

        expect(result.assetCount).toBe(0);
        expect(result.store.count).toBe(source.length);
        expect(result.store.parts).toBeGreaterThan(1);
        expect(Object.keys(zip.files).some(name => name.startsWith('assets/'))).toBe(false);
        expect(progress[0]).toEqual([0, 0]);
        expect(progress[progress.length - 1]).toEqual([1200, 1200]);
        expect(progress.length).toBeGreaterThan(100);
        expect(progress.every(([read, written], i) => written <= read && (!i || read >= progress[i - 1][0]))).toBe(true);
        expect(await DB.getRawStoreData('messages')).toEqual(source);

        const { data, manifest } = await finishArchive(zip, result.store, 'text_only', { characters: [{ ...character }] });
        const expected = source.map(message => ({
            ...message,
            nested: { ...message.nested, attachments: ['', { thumbnail: '', temporary: '' }] },
        }));
        expect(data.messages).toEqual(expected);
        expect(manifest.stores.messages.count).toBe(1200);
        await seedStore('messages', [{ id: 9999, charId: 'c1', type: 'text', content: 'Not in backup' }]);
        await DB.importFullData(data as any);
        expect(await DB.getRawStoreData('messages')).toEqual(expected);
        expect(await DB.getRawStoreData('characters')).toEqual([character]);
    });

    it.each(['full', 'media_only'] as const)('%s keeps inline and Blob-backed image bytes; media import preserves destination text', async mode => {
        await DB.putBlobAsset('shared-image', new Blob([blobBytes], { type: 'image/webp' }));
        const source = Array.from({ length: 330 }, (_, index) => ({
            id: index + 1,
            charId: 'c1',
            type: ['text', 'image', 'emoji'][index % 3],
            content: index % 3 === 0 ? `正文 ${index}` : index % 3 === 1 ? imageURL : 'blobref:shared-image',
            nested: { caption: `图片说明 ${index}`, images: [imageURL, { thumbnail: 'blobref:shared-image' }] },
        }));
        await seedStore('messages', source);
        const zip = new JSZip();
        const result = await writeStreamedBackupStore(zip, mode);
        expect(result.store.count).toBe(mode === 'full' ? 330 : 220);
        expect(result.store.parts).toBeGreaterThan(1);
        expect(result.assetCount).toBe(2);
        expect(await DB.getRawStoreData('messages')).toEqual(source);
        expect(new Uint8Array(await (await DB.getBlobAsset('shared-image'))!.arrayBuffer())).toEqual(blobBytes);

        const metadata = mode === 'full' ? { characters: [{ ...character }] } : {};
        const archive = await finishArchive(zip, result.store, mode, metadata);
        const selected = mode === 'full' ? source : source.filter(message => message.type !== 'text');
        expect(archive.data.messages.map((message: any) => message.id)).toEqual(selected.map(message => message.id));
        const assetNames = Object.keys(archive.zip.files).filter(name => name.startsWith('assets/') && !archive.zip.files[name].dir);
        expect(assetNames).toHaveLength(2);
        for (const name of assetNames) {
            expect(await archive.zip.file(name)!.async('uint8array')).toEqual(name.endsWith('.webp') ? blobBytes : imageBytes);
        }

        const existingText = { id: 9999, charId: 'c1', type: 'text', content: 'Destination-only text must survive media import' };
        await seedStore('messages', [existingText]);
        await seedStore('characters', [character]);
        await DB.importFullData(archive.data as any, { beforeWrite: root => restoreZipAssets(root, archive.zip) });
        const expected = selected.map(message => ({
            ...message,
            content: message.content === 'blobref:shared-image' ? blobURL : message.content,
            nested: { ...message.nested, images: [imageURL, { thumbnail: blobURL }] },
        }));
        expect(await DB.getRawStoreData('messages')).toEqual(mode === 'full' ? expected : [...expected, existingText]);
        expect(await DB.getRawStoreData('characters')).toEqual([character]);
    });

    it('gallery batches use galleryImages manifest entries and preserve all records and assets', async () => {
        const source = Array.from({ length: 125 }, (_, index) => ({
            id: `image-${String(index).padStart(3, '0')}`, charId: 'c1', url: imageURL, note: `相册 ${index}`,
        }));
        await seedStore('gallery', source);
        const zip = new JSZip();
        const result = await writeStreamedBackupStore(zip, 'full', { storeName: 'gallery' });
        expect(result.store.count).toBe(125);
        expect(result.store.parts).toBeGreaterThan(1);
        expect(result.assetCount).toBe(1);
        expect(await DB.getRawStoreData('gallery')).toEqual(source);
        const archive = await finishArchive(zip, result.store, 'full', {}, 'galleryImages');
        expect(archive.data.messages).toBeUndefined();
        await seedStore('gallery', [{ id: 'obsolete', url: 'old' }]);
        await DB.importFullData(archive.data as any, { beforeWrite: root => restoreZipAssets(root, archive.zip) });
        expect(await DB.getRawStoreData('gallery')).toEqual(source);
    });

    it.each([
        ['image/svg+xml', 'svg', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><text>文字</text></svg>')],
        ['image/avif', 'avif', new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112, 97, 118, 105, 102])],
        ['image/bmp', 'bmp', new Uint8Array([66, 77, 54, 0, 0, 0, 255, 128])],
    ] as const)('preserves %s bytes and an import-compatible extension for inline and Blob-backed images', async (mime, ext, bytes) => {
        const url = dataURL(bytes, mime);
        await DB.putBlobAsset('format-test', new Blob([bytes], { type: mime }));
        await seedStore('messages', [
            { id: 1, charId: 'c1', type: 'image', content: url },
            { id: 2, charId: 'c1', type: 'image', content: 'blobref:format-test' },
        ]);
        const zip = new JSZip();
        const result = await writeStreamedBackupStore(zip, 'full');
        const archive = await finishArchive(zip, result.store, 'full', {});
        for (const message of archive.data.messages) {
            expect(message.content).toMatch(new RegExp(`\\.${ext}$`));
            expect(await archive.zip.file(message.content)!.async('uint8array')).toEqual(bytes);
        }
        await seedStore('messages', []);
        await DB.importFullData(archive.data as any, { beforeWrite: root => restoreZipAssets(root, archive.zip) });
        expect((await DB.getRawStoreData('messages')).map(message => message.content)).toEqual([url, url]);
    });

    it.each(['messages', 'gallery'] as const)('empty %s store completes with a valid zero-count manifest entry', async storeName => {
        const zip = new JSZip();
        const progress = vi.fn();
        const result = await writeStreamedBackupStore(zip, 'text_only', { storeName, onProgress: progress });
        expect(result).toEqual({ store: { parts: 0, count: 0 }, assetCount: 0 });
        const field = storeName === 'messages' ? 'messages' : 'galleryImages';
        const archive = await finishArchive(zip, result.store, 'text_only', {}, field);
        expect(archive.data[field]).toEqual([]);
        expect(progress).toHaveBeenLastCalledWith(0, 0);
    });

    it('missing Blob assets fail explicitly without modifying source; text-only backup can still rescue the words', async () => {
        const source = [{ id: 1, charId: 'c1', type: 'image', content: 'blobref:missing', caption: '不可丢掉的说明' }];
        await seedStore('messages', source);
        const failedZip = new JSZip();
        await expect(writeStreamedBackupStore(failedZip, 'full')).rejects.toThrow('本地图片已丢失或无法读取');
        expect(failedZip.file('manifest.json')).toBeNull();
        expect(await DB.getRawStoreData('messages')).toEqual(source);
        const textZip = new JSZip();
        const result = await writeStreamedBackupStore(textZip, 'text_only');
        const archive = await finishArchive(textZip, result.store, 'text_only', {});
        expect(archive.data.messages).toEqual([{ ...source[0], content: '' }]);
    });
});

describe('eagerly compressed backup files', () => {
    it('shares image entries between message and gallery tables in the same archive', async () => {
        await seedStore('messages', [{ id: 1, type: 'image', content: imageURL }]);
        await seedStore('gallery', [{ id: 'g1', url: imageURL }]);
        const zip = new JSZip();
        const assetPaths = new Map<string, string>();
        const messages = await writeStreamedBackupStore(zip, 'full', { assetPaths });
        const gallery = await writeStreamedBackupStore(zip, 'full', { storeName: 'gallery', assetPaths });
        expect(messages.assetCount + gallery.assetCount).toBe(1);
        await writeV2Backup(zip, {}, { prewrittenStores: { messages: messages.store, galleryImages: gallery.store } });
        const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
        const data = await assembleV2Backup(zip, manifest);
        expect(data.messages[0].content).toBe(data.galleryImages[0].url);
        expect(await zip.file(data.galleryImages[0].url)!.async('uint8array')).toEqual(imageBytes);
    });

    it('consumes input bytes before returning and keeps readable compressed entries while more files are added', async () => {
        const zip = new JSZip();
        const original = new Uint8Array(512 * 1024).fill(65);
        await writeCompressedBackupFile(zip, 'stores/first.bin', original);
        original.fill(66);
        // A deferred zip.file(original) would now contain B instead of A.
        expect((await zip.file('stores/first.bin')!.async('uint8array')).every(byte => byte === 65)).toBe(true);
        const firstSnapshot = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
        expect(firstSnapshot.byteLength).toBeLessThan(10_000);
        await writeCompressedBackupFile(zip, 'stores/second.json', JSON.stringify({ content: '文字'.repeat(1000) }));
        const completed = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), { checkCRC32: true });
        expect(await completed.file('stores/first.bin')!.async('uint8array')).toEqual(new Uint8Array(512 * 1024).fill(65));
        expect(JSON.parse(await completed.file('stores/second.json')!.async('string')).content).toBe('文字'.repeat(1000));
    });
});
