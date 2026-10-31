import { describe, expect, it } from 'vitest';
import { HALLOWEEN_END, isHalloweenActive, visibleAvatarStyle } from './halloweenEvent';
const style = { avatarDecoration: 'data:image/png;base64,example', avatarDecorationEvent: 'halloween-2026' as const, avatarDecorationScale: 1.5 } as any;
describe('Halloween expiry', () => {
    it('ends at midnight Beijing time after November 2', () => {
        expect(isHalloweenActive(Date.parse('2026-11-02T23:59:59+08:00'))).toBe(true);
        expect(isHalloweenActive(HALLOWEEN_END)).toBe(false);
    });
    it('hides equipped and imported tagged frames without changing the theme', () => {
        expect(visibleAvatarStyle(style, HALLOWEEN_END).avatarDecoration).toBeUndefined();
        expect(style.avatarDecoration).toBeTruthy();
        expect(visibleAvatarStyle(style, HALLOWEEN_END - 1)).toBe(style);
    });
    it('keeps user uploads after expiry', () => {
        const custom = { ...style, avatarDecorationEvent: undefined };
        expect(visibleAvatarStyle(custom, HALLOWEEN_END)).toBe(custom);
    });
});
