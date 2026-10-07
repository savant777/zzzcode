import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key() {
    const value = process.env.TEMPLATE_PASSWORD_ENCRYPTION_KEY;
    if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('PASSWORD_ENCRYPTION_NOT_CONFIGURED');
    return Buffer.from(value, 'hex');
}
export function encryptTemplatePassword(id: string, password: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(), iv);
    cipher.setAAD(Buffer.from(id));
    const data = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}
export function decryptTemplatePassword(id: string, value: string) {
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('INVALID_ENCRYPTED_PASSWORD');
    const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    cipher.setAAD(Buffer.from(id));
    cipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString('utf8');
}
