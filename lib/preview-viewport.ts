// Size the viewport from the browser/panel, never from document content.
export function previewViewport(width: number, height: number, panelWidth: number, panelHeight: number) {
    const postBodyWidth = width < 990 ? 605 : 961;
    const scale = Math.max(0.01, Math.min(panelWidth / postBodyWidth, 1));
    return { postBodyWidth, viewportWidth: Math.max(width, postBodyWidth), scale,
        iframeHeight: Math.max(1, Math.floor(Math.min(height, panelHeight / scale))) };
}
