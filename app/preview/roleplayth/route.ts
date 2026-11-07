// A real same-origin document supplies an HTTP Referer to embedded media.
// LivePreview fills this document locally; template HTML is never sent here.
export function GET() {
    return new Response('<!DOCTYPE html><html><head><title>Live preview</title></head><body></body></html>', {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
    });
}
