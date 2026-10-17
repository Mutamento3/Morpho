import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./buildInfo', () => ({ BUILD_LABEL: 'test@123' }));
import { createStartupDiagnostics } from './startupDiagnostics';
afterEach(() => vi.useRealTimers());
describe('startup diagnostics', () => {
    it('reports a stalled stage and pending read only once', async () => {
        vi.useFakeTimers();
        const report = vi.fn();
        const monitor = createStartupDiagnostics(report);
        monitor.stage('读取本地数据库');
        void monitor.read('characters', () => new Promise(() => {}));
        await vi.advanceTimersByTimeAsync(60000);
        expect(report).toHaveBeenCalledTimes(1);
        expect(report.mock.calls[0][1]).toContain('尚未完成：characters');
        expect(report.mock.calls[0][1]).toContain('读取本地数据库');
        monitor.finish();
    });
    it('does not include raw errors or secrets in copied reports', async () => {
        const report = vi.fn();
        const monitor = createStartupDiagnostics(report);
        const error = new Error('secret-api-key and private chat');
        await expect(monitor.read('characters', async () => { throw error; })).rejects.toBe(error);
        monitor.fail(error);
        monitor.finish();
        expect(report.mock.calls[0][1]).toContain('characters: Error');
        expect(report.mock.calls[0][1]).not.toContain('secret-api-key');
        expect(report.mock.calls[0][1]).not.toContain('private chat');
    });
    it('cleans up on success or unmount', async () => {
        vi.useFakeTimers();
        const report = vi.fn();
        const monitor = createStartupDiagnostics(report);
        monitor.finish();
        await vi.runAllTimersAsync();
        monitor.fail(new Error());
        expect(report).not.toHaveBeenCalled();
    });
});
