import { BUILD_LABEL } from './buildInfo';

// Stage names are code-owned. Never include exception messages, records, URLs or settings.
export function createStartupDiagnostics(report: (title: string, details: string) => void, delay = 20000) {
    const started = Date.now();
    let stage = '开始初始化';
    let stopped = false;
    const failures: string[] = [];
    const pending = new Set<string>();
    const errorKind = (error: unknown) => {
        const name = error instanceof Error ? error.name : '';
        return ['AbortError', 'InvalidStateError', 'QuotaExceededError', 'VersionError', 'UnknownError', 'SecurityError', 'NotFoundError', 'Error'].includes(name) ? name : '未分类错误';
    };
    const emit = (title: string) => {
        if (stopped) return;
        report(title, [
            'Morpho 本地启动诊断', `构建：${BUILD_LABEL}`, `时间：${new Date().toISOString()}`,
            `已等待：${Math.round((Date.now() - started) / 1000)} 秒`, `当前阶段：${stage}`,
            `尚未完成：${[...pending].join('、') || '无独立读取任务'}`,
            `失败记录：${failures.join('；') || '尚未收到错误，可能仍在等待'}`,
            '请复制本信息反馈。可关闭弹窗继续等待，或重新打开页面。请勿清除网站数据。',
            '此报告不包含聊天内容、角色资料、API 密钥或原始异常文本。',
        ].join('\n'));
    };
    const timer = setTimeout(() => emit('本地资料加载超时 · 可复制诊断'), delay);
    return {
        stage(value: string) { stage = value; },
        async read<T>(label: string, read: () => Promise<T>): Promise<T> {
            pending.add(label);
            try { return await read(); }
            catch (error) { failures.push(`${label}: ${errorKind(error)}`); throw error; }
            finally { pending.delete(label); }
        },
        fail(error: unknown) { failures.push(`${stage}: ${errorKind(error)}`); emit('本地资料加载失败 · 可复制诊断'); },
        finish() { stopped = true; clearTimeout(timer); },
    };
}
