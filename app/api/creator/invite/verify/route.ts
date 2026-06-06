import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

const INVITE_COOKIE = 'zzzcode_creator_invite';
const INVITE_TTL_SECONDS = 30 * 60;

const createInviteToken = (inviteHash: string) => {
    const issuedAt = Date.now().toString();
    const signature = createHmac('sha256', inviteHash).update(issuedAt).digest('hex');

    return `${issuedAt}.${signature}`;
};

export async function POST(request: NextRequest) {
    const inviteHash = process.env.CREATOR_INVITE_CODE;

    if (!inviteHash) {
        return NextResponse.json({ error: 'INVITE_CODE_NOT_CONFIGURED' }, { status: 500 });
    }

    const { code } = await request.json();
    const isValidInvite = await bcrypt.compare(String(code || '').trim(), inviteHash);

    if (!isValidInvite) {
        return NextResponse.json({ error: 'INVALID_INVITE_CODE' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(INVITE_COOKIE, createInviteToken(inviteHash), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: INVITE_TTL_SECONDS,
        path: '/',
    });

    return response;
}
