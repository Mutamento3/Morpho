import React, { useRef, useState } from 'react';

const clamp = (value: number) => Math.min(4, Math.max(1, value));

const StoryBiohazardMap: React.FC = () => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const points = useRef(new Map<number, { x: number; y: number }>());
    const lastDistance = useRef<number | null>(null);
    const scaleRef = useRef(1);
    const [scale, setScale] = useState(1);

    const zoomAt = (next: number, x?: number, y?: number) => {
        const viewport = viewportRef.current;
        const value = clamp(next);
        if (!viewport || value === scaleRef.current) return;
        const ratio = value / scaleRef.current;
        const anchorX = x ?? viewport.clientWidth / 2;
        const anchorY = y ?? viewport.clientHeight / 2;
        const scrollX = viewport.scrollLeft;
        const scrollY = viewport.scrollTop;
        scaleRef.current = value;
        setScale(value);
        requestAnimationFrame(() => {
            viewport.scrollLeft = (scrollX + anchorX) * ratio - anchorX;
            viewport.scrollTop = (scrollY + anchorY) * ratio - anchorY;
        });
    };

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'touch') return;
        event.currentTarget.setPointerCapture(event.pointerId);
        points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (points.current.size === 2) {
            const [first, second] = [...points.current.values()];
            lastDistance.current = Math.hypot(first.x - second.x, first.y - second.y);
        }
    };

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const previous = points.current.get(event.pointerId);
        const viewport = viewportRef.current;
        if (!previous || !viewport) return;
        event.preventDefault();
        const next = { x: event.clientX, y: event.clientY };
        points.current.set(event.pointerId, next);
        if (points.current.size === 1) {
            viewport.scrollLeft -= next.x - previous.x;
            viewport.scrollTop -= next.y - previous.y;
            return;
        }
        const [first, second] = [...points.current.values()];
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        if (lastDistance.current && distance > 0) {
            const bounds = viewport.getBoundingClientRect();
            zoomAt(scaleRef.current * distance / lastDistance.current, (first.x + second.x) / 2 - bounds.left, (first.y + second.y) / 2 - bounds.top);
        }
        lastDistance.current = distance;
    };

    const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        points.current.delete(event.pointerId);
        lastDistance.current = null;
    };

    return <div className='story-bio-map'>
        <div className='story-bio-map-controls'>
            <span>双指缩放 · 拖动查看</span>
            <div><button type='button' aria-label='缩小地图' disabled={scale <= 1} onClick={() => zoomAt(scaleRef.current / 1.5)}>−</button><button type='button' aria-label='放大地图' disabled={scale >= 4} onClick={() => zoomAt(scaleRef.current * 1.5)}>＋</button></div>
        </div>
        <div ref={viewportRef} className='story-bio-map-viewport' onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onWheel={event => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            const bounds = event.currentTarget.getBoundingClientRect();
            zoomAt(scaleRef.current * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event.clientX - bounds.left, event.clientY - bounds.top);
        }}>
            <img draggable={false} style={{ width: `${scale * 100}%` }} src={`${import.meta.env.BASE_URL}story-biohazard/city-map.png`} alt='浣熊市区域总览地图' />
        </div>
    </div>;
};

export default StoryBiohazardMap;
