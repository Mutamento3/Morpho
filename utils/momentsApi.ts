import type { APIConfig, MomentsSettings } from '../types';
import { normalizeApiBaseUrl, normalizeApiCredential, normalizeApiModel } from './apiConfigNormalize';

export function normalizeMomentsApi(config: Partial<APIConfig> = {}): APIConfig {
    return { baseUrl: normalizeApiBaseUrl(config.baseUrl), apiKey: normalizeApiCredential(config.apiKey), model: normalizeApiModel(config.model) };
}
export function resolveMomentsApi(settings: MomentsSettings, globalApi: APIConfig): APIConfig {
    if (!settings.independentApiEnabled) return globalApi;
    const api = normalizeMomentsApi(settings.independentApi);
    if (!api.baseUrl || !api.apiKey || !api.model) throw new Error('请补全朋友圈独立 API 的 URL、Key 和模型，或关闭独立 API');
    let url: URL;
    try { url = new URL(api.baseUrl); } catch { throw new Error('朋友圈 API URL 格式不正确'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('朋友圈 API 请使用不含账号、查询参数和片段的 HTTP(S) 基础地址');
    return api;
}
