// v2 备份格式：分片读写的纯逻辑，刻意不碰 React / DOM / Capacitor，只依赖一个最小的
// zip 读写接口，好在 node 测试环境里拿真 jszip 单测往返。
//
// 设计主线（见 notes/backup-streaming-refactor-plan.md）：
//   导出端可逐批写入大表，其余数据仍通过 backupData 对象传入；数组字段分片写进
//   stores/<field>.NNN.json，其余非数组字段（主题/设置/单例对象等）整进 metadata.json，
//   收尾写一份 manifest.json 当导入契约。
//   导入端读 manifest，把各片拼回「与 v1 完全相同的 data 对象」，再喂给原封不动的
//   importFullData——还原语义（clear-and-add / merge / 单例 / media_only 补丁……）全部
//   留在 importFullData 里，这里不重写，所以不会出现「两套语义彼此漂移」。
//
// 为什么单根 data.json 会崩：对单个超大数组或整包做 JSON.stringify，文本长度逼近 JS
// 单字符串 ~512M（2^29）上限会确定性抛 RangeError。分片后每片字符串长度有界，永不触上限。

export const BACKUP_FORMAT_VERSION = 2;

/** 分片阈值。注意这里的「Len」量的是 JS 字符串长度（UTF-16 码元数），正是 RangeError 盯的那个量，
 *  不是 UTF-8 字节数——用它当阈值刚好守住「单根字符串别逼近 512M」。 */
export interface ShardLimits {
    /** 单片字符串长度软上限：攒到这个长度就 flush 一片 */
    maxLen: number;
    /** 单片条数软上限：攒到这么多条就 flush 一片（防超多小记录挤进一片） */
    maxItems: number;
    /** 单条记录序列化硬上限：单条就超它 → 干净报错中止导出，绝不退回 RangeError */
    hardMaxLen: number;
}

export const DEFAULT_SHARD_LIMITS: ShardLimits = {
    maxLen: 32 * 1024 * 1024,        // 32M 码元，远低于 ~512M 上限
    maxItems: 5000,
    hardMaxLen: 256 * 1024 * 1024,   // 256M 码元
};

/** 移动端逐批导出的缓冲更小；单条超软上限的记录仍可独占一片。 */
export const DEFAULT_STREAMING_SHARD_LIMITS: ShardLimits = {
    maxLen: 256 * 1024,
    maxItems: 100,
    hardMaxLen: DEFAULT_SHARD_LIMITS.hardMaxLen,
};

/** 向量 bin 的索引项：每条向量在 memory_vectors.bin 里的位置 + 重建所需元数据 */
export interface VectorIndexEntry {
    memoryId: string;
    charId: string;
    dimensions: number;
    model?: string;
    byteOffset: number;
    byteLength: number;
}

export interface BackupManifest {
    formatVersion: number;
    mode?: string;
    createdAt?: number;
    /** key = backupData 字段名（如 messages / galleryImages / memoryNodes），value = 分片数 + 总条数 */
    stores: Record<string, { parts: number; count: number }>;
    /** 向量走二进制旁路（memory_vectors.bin + .index.json），不进 stores。无向量时省略。 */
    vectors?: { count: number; byteLength: number };
    assetCount?: number;
}

/** 写端：往 zip 里塞文本文件，或二进制（Uint8Array）文件。二进制直写，绝不经 base64 大字符串。 */
export interface ZipFileWriter {
    file(name: string, data: string | Uint8Array, options?: { base64?: boolean }): void;
}

/** 读端：按名取文件，能按类型 async 出文本或字节；取不到返回 null */
export interface ZipFileReader {
    file(name: string): {
        async(type: 'string'): Promise<string>;
        async(type: 'uint8array'): Promise<Uint8Array>;
    } | null;
}

/** 向量 bin / index 在 zip 里的固定文件名 */
export const VECTOR_BIN_FILE = 'stores/memory_vectors.bin';
export const VECTOR_INDEX_FILE = 'stores/memory_vectors.index.json';

/** 分片文件名：stores/<field>.NNN.json。写读两端用同一个公式，靠数字下标对齐，不靠文件名字典序。 */
export function shardFileName(field: string, index: number): string {
    return `stores/${field}.${String(index).padStart(3, '0')}.json`;
}

export interface V2StoreWriterOptions {
    limits?: ShardLimits;
    onYield?: () => Promise<void>;
}

/**
 * 跨数据库批次写入同一组 v2 分片。只保留当前片的字符串，等待写入完成才继续读取。
 * 调用方须依次 await append / finish，并负责释放每批原始对象；本函数不修改输入数组。
 * 写入失败后禁止继续收尾，避免把缺片误报成一个成功的备份。
 */
export function createV2StoreWriter(
    field: string,
    writeShard: (name: string, data: string) => Promise<void>,
    options: V2StoreWriterOptions = {},
) {
    const limits = options.limits || DEFAULT_STREAMING_SHARD_LIMITS;
    if (!Number.isSafeInteger(limits.maxLen) || limits.maxLen < 2 ||
        !Number.isSafeInteger(limits.maxItems) || limits.maxItems < 1 ||
        !Number.isSafeInteger(limits.hardMaxLen) || limits.hardMaxLen < 1) {
        throw new Error(`备份分片限制无效（${field}）。`);
    }
    let buffer: string[] = [];
    let bufferLen = 2; // 方括号；追加时还要计入逗号
    let parts = 0;
    let count = 0;
    let itemIndex = 0;
    let busy = false;
    let finished = false;
    let failure: Error | undefined;

    const begin = () => {
        if (failure) throw failure;
        if (busy) throw new Error(`备份分片仍在写入（${field}），请等待上一批完成。`);
        busy = true;
    };
    const fail = (error: unknown): never => {
        failure = error instanceof Error ? error : new Error(String(error));
        buffer = [];
        bufferLen = 2;
        throw failure;
    };
    const flush = async () => {
        if (!buffer.length) return;
        const name = shardFileName(field, parts);
        let text = '[' + buffer.join(',') + ']';
        buffer = [];
        bufferLen = 2;
        try {
            await writeShard(name, text);
        } catch (error: any) {
            throw new Error(`备份分片写入失败（${name}）：${error?.message || error}`);
        } finally {
            text = '';
        }
        parts++;
        await options.onYield?.();
    };

    return {
        async append(items: any[]): Promise<void> {
            begin();
            try {
                if (finished) throw new Error(`备份分片已完成（${field}），不能继续追加。`);
                for (const item of items) {
                    const index = itemIndex++;
                    let serialized: string | undefined;
                    try {
                        serialized = JSON.stringify(item);
                    } catch (error: any) {
                        throw new Error(`备份序列化失败（${field} 第 ${index} 条）：${error?.message || error}`);
                    }
                    if (serialized === undefined) continue;
                    if (serialized.length > limits.hardMaxLen) {
                        throw new Error(
                            `备份中有单条记录过大（${field} 第 ${index} 条，约 ${Math.round(serialized.length / 1048576)}M 字符），` +
                            `超出安全上限，已中止导出以免生成损坏的备份包。`,
                        );
                    }
                    // 普通片包含括号和分隔符在内不超过上限；超大的单条单独写出。
                    if (buffer.length && bufferLen + 1 + serialized.length > limits.maxLen) await flush();
                    bufferLen += serialized.length + (buffer.length ? 1 : 0);
                    buffer.push(serialized);
                    count++;
                    serialized = undefined;
                    if (bufferLen >= limits.maxLen || buffer.length >= limits.maxItems) await flush();
                }
            } catch (error) {
                fail(error);
            } finally {
                busy = false;
            }
        },
        async finish(): Promise<{ parts: number; count: number }> {
            begin();
            try {
                if (!finished) {
                    await flush();
                    finished = true;
                }
                return { parts, count };
            } catch (error) {
                return fail(error);
            } finally {
                busy = false;
            }
        },
    };
}

export interface WriteV2Options {
    mode?: string;
    createdAt?: number;
    assetCount?: number;
    limits?: ShardLimits;
    /** React 端传 `() => new Promise(r => setTimeout(r, 0))` 让出主线程；测试端可不传 */
    onYield?: () => Promise<void>;
    /** 向量二进制旁路：调用方（OSContext）已把 memory_vectors 归一化拼成 bin + index 时传进来。
     *  写进 memory_vectors.bin（二进制直写）+ .index.json，并在 manifest.vectors 记 count/byteLength。
     *  传了这个就不要再把 memoryVectors 放进 backupData（否则会被当普通数组又分片一遍）。 */
    vectors?: { bin: Uint8Array; index: VectorIndexEntry[] };
    /** 已用 createV2StoreWriter 写完的表；backupData 中不得再有同名非 undefined 字段。 */
    prewrittenStores?: BackupManifest['stores'];
}

/**
 * 把已攒好的 backupData 写成 v2 分片布局，返回 manifest。
 *
 * 会「消费」backupData：数组字段写完即把该字段置 undefined 释放引用，方便大数组尽早被 GC。
 * 调用方不应在调用后再读 backupData。
 */
export async function writeV2Backup(
    zip: ZipFileWriter,
    backupData: Record<string, any>,
    options: WriteV2Options = {},
): Promise<BackupManifest> {
    const limits = options.limits || DEFAULT_SHARD_LIMITS;
    const onYield = options.onYield;
    const manifestStores: BackupManifest['stores'] = {};

    // 在写入其它文件前检查冲突，不允许普通字段覆盖已完成的分片或被静默遗漏。
    for (const [field, summary] of Object.entries(options.prewrittenStores || {})) {
        if (backupData[field] !== undefined) {
            throw new Error(`备份字段重复（${field}）：已分批写入，不能再次写入同名数据。`);
        }
        if (!Number.isSafeInteger(summary.parts) || summary.parts < 0 ||
            !Number.isSafeInteger(summary.count) || summary.count < 0 ||
            summary.parts > summary.count || (summary.parts === 0 && summary.count !== 0)) {
            throw new Error(`备份分片统计无效（${field}），已中止导出。`);
        }
        manifestStores[field] = { ...summary };
    }

    const shardArrayField = async (field: string, arr: any[]) => {
        const writer = createV2StoreWriter(field, async (name, data) => { zip.file(name, data); }, { limits, onYield });
        await writer.append(arr);
        manifestStores[field] = await writer.finish();
    };

    // 一遍扫 backupData：数组字段分片（写完释放），其余非数组字段进 metadata。
    const metaFields: Record<string, any> = {};
    for (const key of Object.keys(backupData)) {
        const value = backupData[key];
        if (Array.isArray(value)) {
            await shardArrayField(key, value);
            backupData[key] = undefined; // 释放引用，已落 zip
        } else {
            metaFields[key] = value;
        }
    }

    zip.file('metadata.json', JSON.stringify(metaFields));

    // 向量二进制旁路：bin 直写 Uint8Array（不经 base64，bin 多大都不会撞字符串上限），
    // index 是小 JSON。manifest.vectors 记 count/byteLength 供导入端校验。
    let vectorsMeta: { count: number; byteLength: number } | undefined;
    if (options.vectors) {
        zip.file(VECTOR_BIN_FILE, options.vectors.bin);
        zip.file(VECTOR_INDEX_FILE, JSON.stringify(options.vectors.index));
        vectorsMeta = { count: options.vectors.index.length, byteLength: options.vectors.bin.byteLength };
    }

    const manifest: BackupManifest = {
        formatVersion: BACKUP_FORMAT_VERSION,
        mode: options.mode,
        createdAt: options.createdAt,
        stores: manifestStores,
        vectors: vectorsMeta,
        assetCount: options.assetCount,
    };
    zip.file('manifest.json', JSON.stringify(manifest));
    return manifest;
}

export interface AssembleV2Options {
    /** React 端传让出主线程的函数；测试端可不传 */
    onYield?: () => Promise<void>;
    /** 进度回调：当前字段、已处理字段序号、字段总数 */
    onShardProgress?: (field: string, fieldIndex: number, fieldTotal: number) => void;
}

/**
 * 读 v2 备份，把各分片拼回「与 v1 完全相同的 data 对象」。
 *
 * 全程只读 zip、组装内存对象，不碰数据库——所以任何校验不过直接抛错时，DB 一字未动，
 * 调用方应在调用 importFullData 之前先 await 本函数。
 *
 * 校验三档（都在写库前）：① formatVersion 严格等于 2；② manifest 声明的每个分片文件都在
 * （缺则 abort）；③ 每字段组装后条数 === manifest count、每片必须是数组（抓我们自己导出的 bug，
 * 不是防用户篡改）。素材文件 assets/* 不进这道硬边界——缺图维持 warn+skip（缺图只可能来自
 * 篡改，真丢了也无从恢复，为它拒绝整个导入没意义）。
 */
export async function assembleV2Backup(
    zip: ZipFileReader,
    manifest: BackupManifest,
    options: AssembleV2Options = {},
): Promise<Record<string, any>> {
    if (!manifest || typeof manifest !== 'object') {
        throw new Error('损坏的备份包：manifest.json 无法解析。');
    }
    if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
        throw new Error(
            `不支持的备份格式版本：${manifest.formatVersion}（本版本只能导入 formatVersion ` +
            `${BACKUP_FORMAT_VERSION} 的备份），已中止导入（数据未改动）。`,
        );
    }

    const metaFile = zip.file('metadata.json');
    if (!metaFile) throw new Error('损坏的备份包：有 manifest 但缺 metadata.json，已中止导入（数据未改动）。');
    let data: Record<string, any>;
    try {
        data = JSON.parse(await metaFile.async('string'));
    } catch {
        throw new Error('损坏的备份包：metadata.json 解析失败，已中止导入（数据未改动）。');
    }

    const stores = manifest.stores || {};
    const fields = Object.keys(stores);

    // 先一遍校验所有声明的分片文件都在（缺则 abort，此时还没拼任何数据、DB 未动）
    for (const field of fields) {
        const { parts } = stores[field];
        for (let p = 0; p < parts; p++) {
            const name = shardFileName(field, p);
            if (!zip.file(name)) {
                throw new Error(`损坏的备份包：manifest 声明了 ${name} 但 zip 里没有，已中止导入（数据未改动）。`);
            }
        }
    }

    // 逐字段逐片拼回完整数组；parse 完一片即释放该片字符串；组装后条数必须等于 manifest count
    for (let fi = 0; fi < fields.length; fi++) {
        const field = fields[fi];
        const { parts, count } = stores[field];
        const arr: any[] = [];
        for (let p = 0; p < parts; p++) {
            const name = shardFileName(field, p);
            let str = await zip.file(name)!.async('string');
            let chunk: any;
            try {
                chunk = JSON.parse(str);
            } catch {
                throw new Error(`损坏的备份包：${name} 解析失败，已中止导入（数据未改动）。`);
            }
            str = ''; // 释放该片字符串
            if (!Array.isArray(chunk)) {
                throw new Error(`损坏的备份包：${name} 不是数组，已中止导入（数据未改动）。`);
            }
            for (const item of chunk) arr.push(item);
            if (options.onYield) await options.onYield();
        }
        if (arr.length !== count) {
            throw new Error(
                `损坏的备份包：${field} 实际拼出 ${arr.length} 条、manifest 声明 ${count} 条，对不上，` +
                `已中止导入（数据未改动）。`,
            );
        }
        data[field] = arr;
        options.onShardProgress?.(field, fi, fields.length);
    }

    // 向量二进制旁路：从 bin + index 重建 MemoryVector[]，塞进 data.memoryVectors，
    // 跟其它 store 一样走那一次 importFullData（clear-once），不走 saveMany 旁路。
    if (manifest.vectors) {
        const idxFile = zip.file(VECTOR_INDEX_FILE);
        const binFile = zip.file(VECTOR_BIN_FILE);
        if (!idxFile || !binFile) {
            throw new Error('损坏的备份包：manifest 声明了向量但缺 index/bin 文件，已中止导入（数据未改动）。');
        }
        let index: VectorIndexEntry[];
        try {
            index = JSON.parse(await idxFile.async('string'));
        } catch {
            throw new Error('损坏的备份包：memory_vectors.index.json 解析失败，已中止导入（数据未改动）。');
        }
        const bin = await binFile.async('uint8array');
        if (!Array.isArray(index) || index.length !== manifest.vectors.count) {
            throw new Error('损坏的备份包：向量条数与 manifest 不符，已中止导入（数据未改动）。');
        }
        if (bin.byteLength !== manifest.vectors.byteLength) {
            throw new Error('损坏的备份包：向量 bin 字节数与 manifest 不符，已中止导入（数据未改动）。');
        }
        const okInt = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
        const vectors = index.map((e) => {
            // 偏移/长度/维度必须是非负安全整数，且字节区间落在 bin 内。少了这道校验，坏 byteOffset
            // 会被 Uint8Array.slice() 钳制成空/截断的字节（不报错），组装照样过，importFullData 清旧
            // 存新 → 本该 abort 的损坏变成丢数据。这里把它挡在写库前（也顺带抓自家 offset 算错的 bug）。
            if (!okInt(e.byteOffset) || !okInt(e.byteLength) || !okInt(e.dimensions)) {
                throw new Error(`损坏的备份包：向量 ${e.memoryId} 的偏移/长度/维度非法，已中止导入（数据未改动）。`);
            }
            if (e.byteLength !== e.dimensions * 4) {
                throw new Error(`损坏的备份包：向量 ${e.memoryId} 的字节数与维度对不上，已中止导入（数据未改动）。`);
            }
            if (e.byteOffset + e.byteLength > bin.byteLength) {
                throw new Error(`损坏的备份包：向量 ${e.memoryId} 的字节区间越过 bin 末尾，已中止导入（数据未改动）。`);
            }
            // slice 切出独立 buffer（不是 subarray 视图）：否则 IndexedDB 结构化克隆会把整根 bin
            // 给每条向量各复制一遍。importFullData 的 memory_vectors 段对 Uint8Array 形态原样存。
            const vector = bin.slice(e.byteOffset, e.byteOffset + e.byteLength);
            if (vector.byteLength !== e.byteLength) {
                throw new Error(`损坏的备份包：向量 ${e.memoryId} 切片长度异常，已中止导入（数据未改动）。`);
            }
            return { memoryId: e.memoryId, charId: e.charId, dimensions: e.dimensions, model: e.model, vector };
        });
        data.memoryVectors = vectors;
        options.onShardProgress?.('memoryVectors', fields.length, fields.length + 1);
    }

    return data;
}
