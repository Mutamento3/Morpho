import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DB, openDB } from './db';

// fake-indexeddb 已通过 test-setup.ts 注入。
// 这组用例锁住 #1「游标分批读」(getStoreDataChunked) 的契约：分批读出的结果集必须与
// getRawStoreData 的整表 getAll 完全一致（条数、顺序、内容），且回调可以是 async、批边界
// 不漏不重。这是给 v2 流式导出当地基的回归守卫——读法换了但数据一条都不能少。

// gallery store keyPath 'id'，直接拿 raw 事务塞数据，避开上层方法的额外语义。
async function seedGallery(records: any[]): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('gallery', 'readwrite');
        const store = tx.objectStore('gallery');
        store.clear();
        for (const r of records) store.put(r);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function collectChunked(storeName: string, batchSize?: number): Promise<any[]> {
    const out: any[] = [];
    await DB.getStoreDataChunked(storeName, batch => { out.push(...batch); }, batchSize);
    return out;
}

beforeEach(async () => {
    await seedGallery([]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('getStoreDataChunked（游标分批读）', () => {
    it('结果集与 getRawStoreData 的 getAll 完全一致（条数/顺序/内容）', async () => {
        // 乱序写入，验证两种读法都按主键升序、彼此一致
        const ids = [37, 5, 128, 1, 999, 64, 2, 500, 88, 7];
        await seedGallery(ids.map(id => ({ id, url: `img_${id}`, tag: id % 2 ? 'odd' : 'even' })));

        const viaGetAll = await DB.getRawStoreData('gallery');
        const viaCursor = await collectChunked('gallery', 4); // batchSize < 总数，强制多批

        expect(viaCursor).toHaveLength(viaGetAll.length);
        expect(viaCursor).toEqual(viaGetAll); // 逐条深比，顺序也必须一致
        // 主键升序：1,2,5,7,37,...
        expect(viaCursor.map((r: any) => r.id)).toEqual([1, 2, 5, 7, 37, 64, 88, 128, 500, 999]);
    });

    it('空表：onBatch 一次都不调，正常结束', async () => {
        let calls = 0;
        await DB.getStoreDataChunked('gallery', () => { calls++; });
        expect(calls).toBe(0);
    });

    it('批边界：总数正好是 batchSize 整数倍，不漏不重不多跑空批', async () => {
        await seedGallery(Array.from({ length: 200 }, (_, i) => ({ id: i + 1, url: `u${i}` })));
        const batches: number[] = [];
        await DB.getStoreDataChunked('gallery', batch => { batches.push(batch.length); }, 50);
        // 200 / 50 = 4 个满批，不该多出一个空批
        expect(batches).toEqual([50, 50, 50, 50]);
        const all = await collectChunked('gallery', 50);
        expect(all).toHaveLength(200);
        expect(new Set(all.map((r: any) => r.id)).size).toBe(200); // 无重复
    });

    it('batchSize 大于总数：一批读完', async () => {
        await seedGallery(Array.from({ length: 30 }, (_, i) => ({ id: i + 1 })));
        const batches: number[] = [];
        await DB.getStoreDataChunked('gallery', batch => { batches.push(batch.length); }, 200);
        expect(batches).toEqual([30]);
    });

    it('回调是 async（中途 await 让出主线程）也不丢数据、不报事务失活', async () => {
        await seedGallery(Array.from({ length: 120 }, (_, i) => ({ id: i + 1, url: `u${i}` })));
        const out: any[] = [];
        await DB.getStoreDataChunked('gallery', async batch => {
            await new Promise(r => setTimeout(r, 0)); // 跨过事务自动提交点
            out.push(...batch);
        }, 40);
        expect(out).toHaveLength(120);
        expect(out.map((r: any) => r.id)).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
    });

    it('store 不存在：直接返回，不抛错', async () => {
        await expect(
            DB.getStoreDataChunked('__nonexistent_store__', () => { throw new Error('不该被调用'); })
        ).resolves.toBeUndefined();
    });

    it('在记录进入 batch 前转换；跳过整批也继续读取，不漏掉后续记录', async () => {
        await seedGallery(Array.from({ length: 7 }, (_, i) => ({ id: i + 1, image: 'data:image/png;base64,large', text: `t${i + 1}` })));
        const batches: any[][] = [];
        const scanned: number[] = [];
        await DB.getStoreDataChunked('gallery', batch => { batches.push(batch); }, 2, {
            snapshot: true,
            transform: record => {
                scanned.push(record.id);
                return record.id > 4 ? { id: record.id, text: record.text } : undefined;
            },
        });
        expect(scanned).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(batches).toEqual([
            [{ id: 5, text: 't5' }, { id: 6, text: 't6' }],
            [{ id: 7, text: 't7' }],
        ]);
        // 转换不回写数据库。
        expect((await DB.getRawStoreData('gallery'))[0].image).toBe('data:image/png;base64,large');
    });

    it('全部跳过或空表时不发出空批，也正常结束', async () => {
        const onBatch = vi.fn();
        await DB.getStoreDataChunked('gallery', onBatch, 2, { snapshot: true });
        await seedGallery([{ id: 1 }, { id: 2 }, { id: 3 }]);
        await DB.getStoreDataChunked('gallery', onBatch, 2, { transform: () => undefined });
        expect(onBatch).not.toHaveBeenCalled();
    });

    it('固定初始最大主键，不跟随新增尾部；尚未读取记录的更新是尽力而为语义', async () => {
        await seedGallery([{ id: 1, text: 'one' }, { id: 2, text: 'old' }, { id: 3, text: 'three' }]);
        const out: any[] = [];
        await DB.getStoreDataChunked('gallery', async batch => {
            out.push(...batch);
            if (batch[0].id !== 1) return;
            const db = await openDB();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction('gallery', 'readwrite');
                tx.objectStore('gallery').put({ id: 2, text: 'updated between batches' });
                tx.objectStore('gallery').put({ id: 4, text: 'new after export started' });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }, 1, { snapshot: true });
        expect(out).toEqual([{ id: 1, text: 'one' }, { id: 2, text: 'updated between batches' }, { id: 3, text: 'three' }]);
        expect(await DB.getRawStoreData('gallery')).toHaveLength(4);
    });

    it.each([0, -1, 1.5, NaN, Infinity])('拒绝无效 batchSize %s，避免不前进的循环', async batchSize => {
        await expect(DB.getStoreDataChunked('gallery', () => {}, batchSize)).rejects.toThrow('batchSize');
    });

    it('转换异常会中止读取且保留原始错误信息', async () => {
        await seedGallery([{ id: 1 }, { id: 2 }]);
        const onBatch = vi.fn();
        await expect(DB.getStoreDataChunked('gallery', onBatch, 2, {
            transform: () => { throw new Error('bad media record'); },
        })).rejects.toThrow('读取备份数据失败（gallery）：bad media record');
        expect(onBatch).not.toHaveBeenCalled();
    });

    it('事务被中止时明确报错，不交出部分批次', async () => {
        await seedGallery([{ id: 1 }, { id: 2 }]);
        const db = await openDB();
        const originalTransaction = db.transaction.bind(db);
        vi.spyOn(db, 'transaction').mockImplementationOnce((...args) => {
            const tx = originalTransaction(...args);
            queueMicrotask(() => tx.abort());
            return tx;
        });
        await expect(DB.getStoreDataChunked('gallery', () => {}, 2)).rejects.toThrow('读取备份数据失败（gallery）');
    });

    it('底层游标没有响应时超时报错，不永久挂在打包界面', async () => {
        await seedGallery([{ id: 1 }]);
        const originalCursor = IDBObjectStore.prototype.openCursor;
        vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementationOnce(function (this: IDBObjectStore, ...args) {
            const req = originalCursor.apply(this, args);
            // 模拟浏览器内部处理了事务，但未向导出逻辑交付游标或完成事件。
            req.addEventListener('success', () => req.result?.continue());
            Object.defineProperty(req, 'onsuccess', { set: () => {} });
            Object.defineProperty(this.transaction, 'oncomplete', { set: () => {} });
            return req;
        });
        await expect(DB.getStoreDataChunked('gallery', () => {}, 2, { timeoutMs: 30 })).rejects.toThrow('读取超时');
    });
});
