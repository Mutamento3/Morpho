import { useEffect, useState } from 'react';
import type { BubbleStyle } from '../types';

// A single Beijing-time cutoff for the opening card and built-in frames.
export const HALLOWEEN_END = Date.parse('2026-11-03T00:00:00+08:00');
export const isHalloweenActive = (now = Date.now()) => now >= Date.parse('2026-10-30T00:00:00+08:00') && now < HALLOWEEN_END;
export function visibleAvatarStyle(style: BubbleStyle, now = Date.now()): BubbleStyle {
    return style.avatarDecorationEvent === 'halloween-2026' && !isHalloweenActive(now)
        ? { ...style, avatarDecoration: undefined } : style;
}
export function useHalloweenActive() {
    const [active, setActive] = useState(isHalloweenActive);
    useEffect(() => {
        const update = () => setActive(isHalloweenActive());
        const remaining = HALLOWEEN_END - Date.now();
        const timer = remaining > 0 && remaining < 2147483647 ? window.setTimeout(update, remaining + 10) : undefined;
        window.addEventListener('focus', update);
        document.addEventListener('visibilitychange', update);
        return () => { window.clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
    }, []);
    return active;
}
