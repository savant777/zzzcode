export const clampPreviewZoom = (zoom: number) => Math.max(0.5, Math.min(4, zoom));

/** Keep a wider release zone than capture zone so small finger movements don't flicker. */
export function createPreviewZoom(initial = 1, now: () => number = () => performance.now()) {
    let raw = clampPreviewZoom(initial);
    let displayed = raw;
    let snapped = raw === 1;
    let wheelHoldUntil = 0;
    return (ratio: number, fine = false) => {
        if (!Number.isFinite(ratio) || ratio <= 0) return displayed;
        if (!fine) wheelHoldUntil = 0;
        // Discard wheel momentum briefly at normal size, rather than accumulating
        // it into a jump when the pause ends. Pinch gestures remain immediate.
        if (fine && now() < wheelHoldUntil) return 1;
        raw = clampPreviewZoom(raw * ratio);
        if (snapped) {
            if (Math.abs(raw - 1) <= (fine ? 0.02 : 0.12)) return 1;
            snapped = false;
        } else if (Math.abs(raw - 1) <= (fine ? 0.008 : 0.04) || (displayed - 1) * (raw - 1) <= 0) {
            raw = displayed = 1;
            snapped = true;
            if (fine) wheelHoldUntil = now() + 300;
            return 1;
        }
        displayed = raw;
        return displayed;
    };
}

/** Events inside an iframe do not bubble to its parent; bind to both documents. */
export function bindPreviewZoom(target: EventTarget, zoomBy: (ratio: number, anchorY?: number, fine?: boolean) => void,
    panBy?: (deltaX: number) => boolean, coordinateScale: () => number = () => 1) {
    let distance: number | null = null;
    let finger: { x: number; y: number } | null = null;
    const touchDistance = (touches: TouchList) => {
        // Screen coordinates stay stable when the iframe transforms beneath fingers.
        const screen = Math.hypot(touches[0].screenX - touches[1].screenX,
            touches[0].screenY - touches[1].screenY);
        return Number.isFinite(screen) && screen > 0 ? screen : Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY,
        ) * coordinateScale();
    };
    const wheel = (event: Event) => {
        const e = event as WheelEvent;
        if (!e.ctrlKey) return;
        e.preventDefault();
        const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1);
        // A typical 100px wheel notch changes zoom by ~3%, rather than ~65%.
        zoomBy(Math.exp(-Math.max(-200, Math.min(200, pixels)) * 0.0003), e.clientY, true);
    };
    const start = (event: Event) => {
        const e = event as TouchEvent;
        finger = e.touches.length === 1
            ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
        distance = e.touches.length === 2 ? touchDistance(e.touches) : null;
        if (distance !== null) e.preventDefault();
    };
    const move = (event: Event) => {
        const e = event as TouchEvent;
        if (e.touches.length !== 2) {
            distance = null;
            if (e.touches.length === 1) {
                const next = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                if (finger && Math.abs(next.x - finger.x) > Math.abs(next.y - finger.y)
                    && panBy?.((finger.x - next.x) * coordinateScale())) e.preventDefault();
                finger = next;
            }
            return;
        }
        e.preventDefault();
        const next = touchDistance(e.touches);
        if (distance !== null && distance > 0 && next > 0) {
            zoomBy(next / distance, (e.touches[0].clientY + e.touches[1].clientY) / 2);
        }
        distance = next;
    };
    const end = () => { distance = null; finger = null; };
    target.addEventListener('wheel', wheel, { passive: false });
    target.addEventListener('touchstart', start, { passive: false });
    target.addEventListener('touchmove', move, { passive: false });
    target.addEventListener('touchend', end);
    target.addEventListener('touchcancel', end);
    return () => {
        target.removeEventListener('wheel', wheel);
        target.removeEventListener('touchstart', start);
        target.removeEventListener('touchmove', move);
        target.removeEventListener('touchend', end);
        target.removeEventListener('touchcancel', end);
    };
}
