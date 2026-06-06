import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const INVITE_COOKIE = 'zzzcode_creator_invite';
const INVITE_TTL_MS = 30 * 60 * 1000;

const slugify = (value: string) => {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
};

const safeCompare = (a: string, b: string) => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
};

const isValidInviteToken = (token: string | undefined, inviteHash: string) => {
    if (!token) return false;

    const [issuedAt, signature] = token.split('.');
    const issuedTime = Number(issuedAt);

    if (!issuedAt || !signature || Number.isNaN(issuedTime)) return false;
    if (Date.now() - issuedTime > INVITE_TTL_MS) return false;

    const expected = createHmac('sha256', inviteHash).update(issuedAt).digest('hex');
    return safeCompare(signature, expected);
};

const getDiscordIdentity = (user: any) => {
    const discordIdentity = user?.identities?.find((identity: any) => identity.provider === 'discord');
    const identityData = discordIdentity?.identity_data || {};
    const userMetadata = user?.user_metadata || {};

    return {
        discord_id: discordIdentity?.provider_id
            || identityData.provider_id
            || identityData.sub
            || identityData.id
            || null,
        discord_username: identityData.user_name
            || identityData.username
            || identityData.name
            || identityData.full_name
            || userMetadata.user_name
            || userMetadata.username
            || userMetadata.name
            || userMetadata.full_name
            || null,
    };
};

export async function POST(request: NextRequest) {
    const inviteHash = process.env.CREATOR_INVITE_CODE;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!inviteHash || !supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'CREATOR_ONBOARDING_NOT_CONFIGURED' }, { status: 500 });
    }

    const inviteToken = request.cookies.get(INVITE_COOKIE)?.value;
    if (!isValidInviteToken(inviteToken, inviteHash)) {
        return NextResponse.json({ error: 'INVITE_CODE_REQUIRED' }, { status: 401 });
    }

    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

    if (!accessToken) {
        return NextResponse.json({ error: 'AUTH_SESSION_REQUIRED' }, { status: 401 });
    }

    const { displayName } = await request.json();
    const nextDisplayName = String(displayName || '').trim();
    const nextSlug = slugify(nextDisplayName);

    if (!nextDisplayName || !nextSlug) {
        return NextResponse.json({ error: 'DISPLAY_NAME_REQUIRED' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !userData.user) {
        return NextResponse.json({ error: 'AUTH_SESSION_INVALID' }, { status: 401 });
    }

    const discordIdentity = getDiscordIdentity(userData.user);

    if (!discordIdentity.discord_id) {
        return NextResponse.json({ error: 'DISCORD_ID_REQUIRED' }, { status: 400 });
    }

    const { data: existingCreator } = await supabaseAdmin
        .from('creators')
        .select('user_id, is_active')
        .eq('discord_id', discordIdentity.discord_id)
        .maybeSingle();

    if (existingCreator?.is_active && existingCreator.user_id !== userData.user.id) {
        return NextResponse.json({ error: 'DISCORD_ID_ALREADY_LINKED' }, { status: 409 });
    }

    const { error: creatorError } = await supabaseAdmin
        .from('creators')
        .upsert({
            user_id: userData.user.id,
            discord_id: discordIdentity.discord_id,
            discord_username: discordIdentity.discord_username,
            display_name: nextDisplayName,
            slug: nextSlug,
            role: 'creator',
            is_active: true,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'user_id',
        });

    if (creatorError) {
        return NextResponse.json({ error: creatorError.message }, { status: 400 });
    }

    const { data: creatorsGroup } = await supabaseAdmin
        .from('tag_groups')
        .select('id')
        .ilike('name', 'creators')
        .single();

    if (creatorsGroup) {
        const creatorTagSlug = createHash('sha256').update(userData.user.id).digest('hex').slice(0, 10);

        await supabaseAdmin
            .from('tags')
            .upsert({
                group_id: creatorsGroup.id,
                user_id: userData.user.id,
                name: nextDisplayName,
                slug: nextSlug || creatorTagSlug,
                is_active: true,
            }, {
                onConflict: 'slug',
            });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.delete(INVITE_COOKIE);

    return response;
}
