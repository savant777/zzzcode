import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
function sign(value: string) { return createHmac('sha256', process.env.BIN_PASSWORD || '').update(value).digest('hex'); }
export function binToken() { const payload = 'v2-' + randomBytes(24).toString('hex'); return payload + '.' + sign(payload); }
export function binAllowed(request: Request) {
    if (!process.env.BIN_PASSWORD) return false;
    const [payload, signature] = (request.headers.get('x-bin-token') || '').split('.');
    if (!payload || !signature || !/^v2-[a-f0-9]{48}$/.test(payload)) return false;
    const expected = Buffer.from(sign(payload)); const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function validBinPassword(password: unknown) {
    const expected = process.env.BIN_PASSWORD;
    if (!expected || typeof password !== 'string') return false;
    const a = Buffer.from(sign(password)); const b = Buffer.from(sign(expected));
    return timingSafeEqual(a, b);
}
