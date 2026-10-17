import { afterEach, describe, expect, it, vi } from 'vitest';
import { startupRead } from './startupRead';
afterEach(() => vi.useRealTimers());
describe('startup reads', () => {
    it('recovers from a transient database failure', async () => {
        vi.useFakeTimers();
        const read = vi.fn().mockRejectedValueOnce(new Error('closed')).mockResolvedValue(['saved character']);
        const result = startupRead(read);
        await vi.runAllTimersAsync();
        expect(await result).toEqual(['saved character']);
        expect(read).toHaveBeenCalledTimes(2);
    });
    it('never converts a failed or stalled read into an empty database', async () => {
        vi.useFakeTimers();
        const read = vi.fn(() => new Promise<never>(() => {}));
        const result = expect(startupRead(read, 10)).rejects.toThrow('读取超时');
        await vi.runAllTimersAsync();
        await result;
        expect(read).toHaveBeenCalledTimes(3);
    });
    it('accepts a genuinely empty database without retries', async () => {
        const read = vi.fn().mockResolvedValue([]);
        expect(await startupRead(read)).toEqual([]);
        expect(read).toHaveBeenCalledTimes(1);
    });
});
