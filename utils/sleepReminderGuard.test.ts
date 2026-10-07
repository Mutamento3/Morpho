import { describe, expect, it } from 'vitest';
import { ChatPrompts } from './chatPrompts';
import { buildSleepReminderGuard, DEFAULT_SLEEP_REMINDER_BOUNDARIES } from './sleepReminderGuard';
import type { CharacterProfile, UserProfile } from '../types';

describe('私聊防催睡边界', () => {
    it('旧角色与关闭状态不注入；开启但空白时使用默认边界', () => {
        expect(buildSleepReminderGuard({})).toBe('');
        expect(buildSleepReminderGuard({ sleepReminderGuard: { enabled: false, boundaries: '保留的设置' } })).toBe('');
        expect(buildSleepReminderGuard({ sleepReminderGuard: { enabled: true, boundaries: '  ' } })).toContain(DEFAULT_SLEEP_REMINDER_BOUNDARIES);
    });
    it('真实聊天提示词按角色开关注入自定义内容，并在关闭后移除', async () => {
        const char = { id: 'sleep-guard-a', name: '测试角色', sleepReminderGuard: { enabled: true, boundaries: '我需要陪伴时，请继续当前话题。' } } as CharacterProfile;
        const user = { name: '测试用户' } as UserProfile;
        const build = (c: CharacterProfile) => ChatPrompts.buildSystemPromptParts(c, user, [], [], [], []);
        const enabled = await build(char);
        expect(enabled.recencyTail).toContain('我需要陪伴时，请继续当前话题。');
        expect(enabled.recencyTail).toContain('防催睡（用户已开启）');
        const other = await build({ ...char, id: 'sleep-guard-b', sleepReminderGuard: undefined });
        expect(other.recencyTail).not.toContain('防催睡（用户已开启）');
        const disabled = await build({ ...char, sleepReminderGuard: { ...char.sleepReminderGuard!, enabled: false } });
        expect(disabled.recencyTail).not.toContain('防催睡（用户已开启）');
    });
});
