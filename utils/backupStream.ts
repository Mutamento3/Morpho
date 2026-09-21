import JSZip from 'jszip';
import { DB } from './db';
import { BLOBREF_PREFIX, getBlobForRef } from './blobRef';
import { createV2StoreWriter, type BackupManifest } from './backupFormat';

export type BackupMode = 'text_only' | 'media_only' | 'full';

/** Only mutate the independent copy returned by IndexedDB, never application state. */
export function stripBackupImagesInPlace<T>(record: T): T {
    const strip = (value: string) => /^(data:image|blobref:|blob:)/.test(value) ? '' : value;
    if (typeof record === 'string') return strip(record) as T;
    const stack: any[] = [record];
    const seen = new WeakSet<object>();
    while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== 'object' || seen.has(current)) continue;
        seen.add(current);
        for (const key of Object.keys(current)) {
            const value = current[key];
            if (typeof value === 'string') current[key] = strip(value);
            else if (value && typeof value === 'object') stack.push(value);
        }
    }
    return record;
}

async function withBackupTimeout<T>(operation: Promise<T>, stage: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${stage}超时，请保持网页在前台后重试。`)), 60_000);
            }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

/**
 * Compress each file before retaining it in the destination archive. Merely calling
 * zip.file() with every JSON shard still retains all uncompressed strings until the
 * final generateAsync(). Loading a small ZIP via public APIs retains compressed bytes;
 * final DEFLATE generation reuses those bytes. No JSZip private fields are required.
 */
export async function writeCompressedBackupFile(
    zip: JSZip,
    name: string,
    data: string | Uint8Array,
    options: { base64?: boolean } = {},
): Promise<void> {
    const part = new JSZip();
    part.file(name, data, { ...options, createFolders: false });
    const bytes = await withBackupTimeout(part.generateAsync({
        type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 1 }, streamFiles: true,
    }), `压缩备份分片 ${name} `);
    await withBackupTimeout(zip.loadAsync(bytes, { createFolders: false }), `写入备份分片 ${name} `);
}

export interface StreamBackupOptions {
    storeName?: 'messages' | 'gallery';
    onProgress?: (read: number, written: number) => void;
    /** Shared by streamed stores in the same archive; values are already-written paths. */
    assetPaths?: Map<string, string>;
}

/**
 * Read a few rows at a time, strip text-only images in the cursor callback, then
 * serialize/compress immediately. Never assemble a complete messages/gallery array.
 * The upper primary key is fixed at scan start. As with the old per-store exporter,
 * this is a best-effort live backup, not an atomic snapshot of the whole application:
 * edits/deletions between transactions may be reflected in later batches.
 */
export async function writeStreamedBackupStore(
    zip: JSZip,
    mode: BackupMode,
    options: StreamBackupOptions = {},
): Promise<{ store: BackupManifest['stores'][string]; assetCount: number }> {
    const storeName = options.storeName || 'messages';
    const field = storeName === 'messages' ? 'messages' : 'galleryImages';
    const writer = createV2StoreWriter(field, (name, text) => writeCompressedBackupFile(zip, name, text));
    let read = 0;
    let written = 0;
    let assetCount = 0;
    // Keys are short blob references or SHA-256 hashes, never entire base64 strings.
    const assetPaths = options.assetPaths || new Map<string, string>();
    const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));

    const exportImage = async (value: string): Promise<string> => {
        const isRef = value.startsWith(BLOBREF_PREFIX);
        let key = isRef ? value : undefined;
        if (!isRef && globalThis.crypto?.subtle) {
            const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
            key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        }
        if (key && assetPaths.has(key)) return assetPaths.get(key)!;
        let ext: string;
        let data: string | Uint8Array;
        let base64 = false;
        if (isRef) {
            const blob = await withBackupTimeout(getBlobForRef(value), '读取聊天图片');
            if (!blob) throw new Error('有一张本地图片已丢失或无法读取，可先导出纯文字备份。');
            ext = blob.type.split('/')[1]?.split(';')[0] || 'png';
            data = new Uint8Array(await blob.arrayBuffer());
        } else {
            const match = value.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/);
            if (!match) return value; // Preserve legacy inline SVG / non-base64 URLs.
            ext = match[1];
            data = value.slice(match[0].length);
            base64 = true;
        }
        ext = ext === 'jpeg' ? 'jpg' : ext === 'svg+xml' ? 'svg' : ext.replace(/[^a-zA-Z0-9]/g, '_');
        const path = `assets/stream_${field}_${assetCount++}.${ext}`;
        await writeCompressedBackupFile(zip, path, data, { base64 });
        if (key) assetPaths.set(key, path);
        return path;
    };

    const extractImages = async (record: any): Promise<void> => {
        const stack = [record];
        const seen = new WeakSet<object>();
        while (stack.length) {
            const current = stack.pop();
            if (!current || typeof current !== 'object' || seen.has(current)) continue;
            seen.add(current);
            for (const key of Object.keys(current)) {
                const value = current[key];
                if (typeof value === 'string' && (value.startsWith('data:image/') || value.startsWith(BLOBREF_PREFIX))) {
                    current[key] = await exportImage(value);
                } else if (value && typeof value === 'object') stack.push(value);
            }
        }
    };

    options.onProgress?.(0, 0);
    await DB.getStoreDataChunked(storeName, async batch => {
        for (let i = 0; i < batch.length; i++) {
            let record = batch[i];
            if (mode !== 'text_only') await extractImages(record);
            await writer.append([record]);
            // The cursor and each completed record can be collected before the next read.
            batch[i] = undefined;
            record = undefined;
            written++;
        }
        options.onProgress?.(read, written);
        await yieldToUI();
    }, 10, {
        snapshot: true,
        transform: record => {
            read++;
            if (storeName === 'messages' && mode === 'media_only' && record.type !== 'image' && record.type !== 'emoji') {
                if (read % 100 === 0) options.onProgress?.(read, written);
                return undefined;
            }
            return mode === 'text_only' ? stripBackupImagesInPlace(record) : record;
        },
    });
    const store = await writer.finish();
    options.onProgress?.(read, written);
    return { store, assetCount };
}
