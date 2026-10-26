import { assembleV2Backup, type BackupManifest, type ZipFileReader, type AssembleV2Options } from './backupFormat';

// These fields have a native database/settings restore path. Other v3 stores are
// retained as opaque asset records, not discarded because their UI is absent.
const NATIVE_STORES = new Set(`characters characterGroups messages customThemes savedEmojis emojiCategories assets galleryImages diaries tasks anniversaries roomTodos roomNotes groups savedJournalStickers socialPosts courses games worldbooks storyTheaters storyTheaterPresets storyTheaterMasks novels songs bankTransactions xhsActivities xhsStockImages quizSessions guidebookSessions scheduledMessages handbooks trackers trackerEntries hotNewsSnapshots memoryNodes memoryLinks topicBoxes anticipations eventBoxes roomPlates digestReports dailySchedules memoryBatches pixelHomeAssets pixelHomeLayouts vrNovels vrAnnotations customCreatorParts vrLetters vrSettings vrScripts vrStagedPlays vrPresets worlds worldEpisodes lifeRecords medPlans lifeRecordSettings apiPresets availableModels appearancePresets roomCustomAssets mediaAssets chatArchivePrompts`.split(' '));

export const COMPAT_ASSET_PREFIX = 'morpho_sully_v3_compat_';

export async function assembleCompatibleBackup(zip: ZipFileReader, manifest: BackupManifest, options: AssembleV2Options & { onCompatibilityWarning?: (message: string) => void } = {}) {
    if (manifest.formatVersion !== 3) return assembleV2Backup(zip, manifest, options);
    // v3 retains the v2 shard/vector contract; validate it before any database write.
    const data = await assembleV2Backup(zip, { ...manifest, formatVersion: 2 }, options);
    const indexFile = zip.file('blobs/index.json');
    const blobs = new Map<string, string>();
    if (indexFile) {
        const index = JSON.parse(await indexFile.async('string'));
        if (!Array.isArray(index)) throw new Error('损坏的 v3 备份：Blob 索引不是数组，数据未改动');
        for (const entry of index) {
            if (!entry || typeof entry.id !== 'string' || !/^[\w-]+$/.test(entry.id) || blobs.has(entry.id) || !Number.isSafeInteger(entry.size) || entry.size < 0 || typeof entry.type !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(entry.type)) throw new Error('损坏的 v3 备份：Blob 索引无效，数据未改动');
            const file = zip.file(`blobs/${entry.id}`);
            if (!file) throw new Error('损坏的 v3 备份：缺少 Blob 文件，数据未改动');
            const bytes = await file.async('uint8array');
            if (bytes.length !== entry.size) throw new Error('损坏的 v3 备份：Blob 大小不符，数据未改动');
            let binary = '';
            for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            blobs.set(entry.id, `data:${entry.type};base64,${btoa(binary)}`);
        }
    }
    // Preserve metadata too: future-only settings must survive a Morpho full backup.
    const metadata = JSON.parse(await zip.file('metadata.json')!.async('string'));
    const retained: any[] = [{ id: `${COMPAT_ASSET_PREFIX}metadata`, data: '', compatibility: { formatVersion: 3, value: metadata } }];
    for (const field of Object.keys(manifest.stores)) {
        if (NATIVE_STORES.has(field)) continue;
        const rows = data[field];
        for (let start = 0; start < Math.max(1, rows.length); start += 100) {
            retained.push({ id: `${COMPAT_ASSET_PREFIX}${field}_${start}`, data: '', compatibility: { field, start, value: rows.slice(start, start + 100) } });
        }
    }
    // Keep indexed blobs even if the original feature only references them in opaque text.
    retained.push({ id: `${COMPAT_ASSET_PREFIX}blobs`, data: '', compatibility: { blobs: Object.fromEntries(blobs) } });
    if (data.assets !== undefined && !Array.isArray(data.assets)) throw new Error('损坏的 v3 备份：assets 不是数组');
    const ids = new Set((data.assets || []).map((a: any) => a.id));
    for (const asset of retained) if (ids.has(asset.id)) throw new Error('v3 兼容数据标识冲突，已中止导入');
    data.assets = [...(data.assets || []), ...retained];

    // Rewrite portable v3 blob tokens without touching IndexedDB. JSON-encoded
    // settings are decoded only when they contain a token, then encoded again.
    const missingRefs = new Set<string>();
    const embeddedAssets = new Set<string>();
    const rewrite = (value: any): any => {
        if (typeof value === 'string') {
            if (value.startsWith('blobref:')) {
                const result = blobs.get(value.slice(8));
                if (!result) { missingRefs.add(value); return value; }
                return result;
            }
            if ((value.includes('blobref:') || value.includes('assets/')) && /^[\s]*[\[{]/.test(value)) {
                let parsed: any;
                try { parsed = JSON.parse(value); } catch { return value; }
                const collect = (node: any) => {
                    if (typeof node === 'string' && node.startsWith('assets/') && zip.file(node)) embeddedAssets.add(node);
                    else if (node && typeof node === 'object') Object.values(node).forEach(collect);
                };
                collect(parsed);
                return JSON.stringify(rewrite(parsed));
            }
            return value;
        }
        if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return value;
        for (const key of Object.keys(value)) value[key] = rewrite(value[key]);
        return value;
    };
    rewrite(data);
    // JSON-encoded settings are opaque to the normal image extractor. Keep their
    // referenced files alongside the original paths so future adapters can recover them.
    const embeddedFiles = [...embeddedAssets];
    for (let start = 0; start < embeddedFiles.length; start += 50) {
        data.assets.push({ id: COMPAT_ASSET_PREFIX + 'embedded_' + start, data: '', compatibility: { files: embeddedFiles.slice(start, start + 50).map(path => ({ path, content: path })) } });
    }
    if (missingRefs.size) {
        const message = '原版备份中有 ' + missingRefs.size + ' 个图片引用未附带对应文件，已保留原引用；这些图片可能无法显示，其余数据继续导入。';
        data.assets.push({ id: COMPAT_ASSET_PREFIX + 'report', data: JSON.stringify({ message, missingRefs: [...missingRefs] }) });
        options.onCompatibilityWarning?.(message);
    }
    return data;
}

/** A portable marker records converted data, not a guess based on ZIP filenames. */
export function getBackupCompatibilityNotice(data: { assets?: unknown }): string | null {
    if (!Array.isArray(data.assets) || !data.assets.some(asset =>
        asset && typeof asset.id === 'string' && asset.id.startsWith(COMPAT_ASSET_PREFIX))) return null;
    return '此备份包含原版糯米机或其他二改的兼容数据。\n\nMorpho 支持的内容会正常导入；Morpho 暂未提供的 App 和功能（例如部分小窝、Live2D、彼方功能），会保留其数据，但不会在小手机中显示，也不代表相关功能已经启用。\n\n保留的数据会随 Morpho「完整备份」一同导出。备份本身未附带的图片等文件无法凭引用恢复。';
}
