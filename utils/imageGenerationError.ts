export interface ImageGenerationErrorDetails {
    provider?: string;
    stage?: string;
    endpoint?: string;
    status?: number;
    statusText?: string;
    responseBody?: string;
    cause?: unknown;
}

/**
 * 生图链路专用错误。只记录排障需要的信息，不保存请求正文、提示词或 API Key。
 */
export class ImageGenerationError extends Error {
    readonly provider?: string;
    readonly stage?: string;
    readonly endpoint?: string;
    readonly status?: number;
    readonly statusText?: string;
    readonly responseBody?: string;
    readonly causeMessage?: string;
    readonly errorId: string;
    readonly occurredAt: number;

    constructor(message: string, details: ImageGenerationErrorDetails = {}) {
        super(message);
        this.name = 'ImageGenerationError';
        this.provider = details.provider;
        this.stage = details.stage;
        this.endpoint = details.endpoint;
        this.status = details.status;
        this.statusText = details.statusText;
        this.responseBody = details.responseBody;
        this.causeMessage = errorMessage(details.cause);
        this.occurredAt = Date.now();
        this.errorId = `IMG-${new Date(this.occurredAt).toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    }
}

export function createImageGenerationError(message: string, details: ImageGenerationErrorDetails = {}): ImageGenerationError {
    return new ImageGenerationError(message, details);
}

export async function readImageErrorResponse(response: Response): Promise<string> {
    try {
        const data = await response.clone().json();
        return redactSensitiveText(JSON.stringify(data, null, 2));
    } catch {
        try { return redactSensitiveText((await response.text()).slice(0, 3000)); }
        catch { return ''; }
    }
}

export function getImageGenerationErrorSummary(error: unknown, fallback = '图片生成失败'): string {
    const message = errorMessage(error) || fallback;
    if (error instanceof ImageGenerationError && error.status && !message.includes(String(error.status))) {
        return `${message}（HTTP ${error.status}）`;
    }
    return message;
}

export function getImageGenerationDiagnosis(error: unknown): string {
    const known = error instanceof ImageGenerationError ? error : undefined;
    return buildHint(known, getImageGenerationErrorSummary(error));
}

export function formatImageGenerationError(
    error: unknown,
    options: { feature?: string; provider?: string; stage?: string } = {},
): string {
    const known = error instanceof ImageGenerationError ? error : undefined;
    const message = getImageGenerationErrorSummary(error);
    const occurredAt = known?.occurredAt || Date.now();
    const lines = [
        `错误编号：${known?.errorId || `IMG-${new Date(occurredAt).toISOString().replace(/\D/g, '').slice(0, 14)}`}`,
        `时间：${new Date(occurredAt).toLocaleString()}`,
        options.feature ? `功能：${options.feature}` : '',
        `服务：${known?.provider || options.provider || '生图接口'}`,
        `阶段：${known?.stage || options.stage || '生成图片'}`,
        known?.endpoint ? `接口：${safeEndpoint(known.endpoint)}` : '',
        known?.status ? `HTTP：${known.status}${known.statusText ? ` ${known.statusText}` : ''}` : '',
        `错误：${redactSensitiveText(message)}`,
        known?.causeMessage && known.causeMessage !== message ? `底层错误：${redactSensitiveText(known.causeMessage)}` : '',
        known?.responseBody ? `\n接口返回：\n${redactSensitiveText(known.responseBody)}` : '',
        `\n排查建议：${getImageGenerationDiagnosis(error)}`,
        '\n此详情已自动隐藏 API Key、鉴权头和图片数据，可以复制给维护者排查。',
    ];
    return lines.filter(Boolean).join('\n');
}

function buildHint(error: ImageGenerationError | undefined, message: string): string {
    const value = `${message} ${error?.causeMessage || ''}`.toLowerCase();
    if (error?.stage?.includes('参考图')) return '先在浏览器中单独打开参考图 URL；若能显示但仍失败，通常是图床禁止跨域读取（CORS），请换可直链访问的图床。';
    if (error?.status === 401 || error?.status === 403) return '检查 API Key、分组/渠道和模型权限；若后台没有请求记录，也要检查中转地址与浏览器跨域设置。';
    if (error?.status === 404) return '检查接口 URL 是否填到了正确的生图端点，以及中转站是否支持当前协议。';
    if (error?.status === 429) return '额度不足或请求过快，请查看中转站余额、限速与并发限制。';
    if ((error?.status || 0) >= 500) return '请求已经到达服务端，但上游生图服务异常；可稍后重试，并把错误编号与接口返回交给中转站。';
    if (/load failed|failed to fetch|network|cors|网络/.test(value)) return '浏览器没有拿到 HTTP 响应。检查当前网络、代理节点、CORS，以及中转站是否允许网页前端直接调用。';
    if (/timeout|超时|轮询/.test(value)) return '任务可能仍在服务端运行。先到中转站后台确认是否扣费及任务状态，再决定是否重试。';
    if (/json|zip|解析|图片/.test(value)) return '接口虽然返回了内容，但格式与当前适配协议不一致；请把接口返回一并交给维护者或中转站核对。';
    return '先核对接口地址、Key、模型和账户余额；随后复制本页完整详情，结合中转站请求日志定位。';
}

function safeEndpoint(value: string): string {
    try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
    } catch {
        return value.replace(/\?.*$/, '');
    }
}

function errorMessage(error: unknown): string {
    if (!error) return '';
    if (error instanceof Error) return error.message;
    return String(error);
}

function redactSensitiveText(value: string): string {
    return String(value || '')
        .replace(/(authorization["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^"'\s,}]+/gi, '$1[已隐藏]')
        .replace(/((?:api[_-]?key|token|secret|key)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, '$1[已隐藏]')
        .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
        .replace(/data:image\/[^;]+;base64,[a-z0-9+/=]+/gi, '[图片数据已隐藏]')
        .replace(/[a-z0-9+/]{500,}={0,2}/gi, '[长数据已隐藏]')
        .slice(0, 5000);
}
