import { describe, expect, it } from 'vitest';
import { normalizeMomentsApi, resolveMomentsApi } from './momentsApi';
import { DEFAULT_MOMENTS_SETTINGS } from './moments';

const globalApi = { baseUrl: 'https://global.example/v1', apiKey: 'global-test-key', model: 'global-model' };
const independentApi = { baseUrl: 'https://moments.example/v1', apiKey: 'moments-test-key', model: 'moments-model' };

describe('朋友圈独立 API', () => {
    it('旧设置和关闭开关时沿用全局配置', () => {
        expect(resolveMomentsApi(DEFAULT_MOMENTS_SETTINGS, globalApi)).toBe(globalApi);
        expect(resolveMomentsApi({ ...DEFAULT_MOMENTS_SETTINGS, independentApiEnabled: false, independentApi }, globalApi)).toBe(globalApi);
    });
    it('开启后独立选择地址、密钥和模型，即便全局未配置', () => {
        expect(resolveMomentsApi({ ...DEFAULT_MOMENTS_SETTINGS, independentApiEnabled: true, independentApi }, { baseUrl: '', apiKey: '', model: '' })).toEqual(independentApi);
    });
    it('复制预设时清理粘贴空白，不修改原预设', () => {
        const preset = { baseUrl: ' https://moments.example/v1/ ', apiKey: '\u200Btest-key ', model: ' model-a ' };
        const copied = normalizeMomentsApi(preset);
        expect(copied).toEqual({ baseUrl: 'https://moments.example/v1', apiKey: 'test-key', model: 'model-a' });
        copied.model = 'model-b';
        expect(preset.model).toBe(' model-a ');
    });
    it.each(['baseUrl', 'apiKey', 'model'])('缺少 %s 时提示补全，不回退调用全局', field => {
        expect(() => resolveMomentsApi({ ...DEFAULT_MOMENTS_SETTINGS, independentApiEnabled: true, independentApi: { ...independentApi, [field]: '' } }, globalApi)).toThrow('请补全');
    });
    it.each(['bad-url', 'file:///tmp/api', 'https://user:password@example.com/v1', 'https://example.com/v1?key=secret'])('拒绝不适用的基础地址 %s', baseUrl => {
        expect(() => resolveMomentsApi({ ...DEFAULT_MOMENTS_SETTINGS, independentApiEnabled: true, independentApi: { ...independentApi, baseUrl } }, globalApi)).toThrow();
    });
});
