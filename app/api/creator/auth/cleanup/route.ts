import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'CREATOR_AUTH_NOT_CONFIGURED' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : null;

    if (!accessToken) {
        return NextResponse.json({ error: 'AUTH_SESSION_REQUIRED' }, { status: 401 });
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

    // Never delete an auth account that is associated with a creator record,
    // including an inactive creator. Only remove OAuth users that have no
    // creator relationship at all.
    const { data: creator, error: creatorError } = await supabaseAdmin
        .from('creators')
        .select('user_id')
        .eq('user_id', userData.user.id)
        .maybeSingle();

    if (creatorError) {
        return NextResponse.json({ error: 'CREATOR_LOOKUP_FAILED' }, { status: 500 });
    }

    if (creator) {
        return NextResponse.json({ deleted: false });
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userData.user.id);

    if (deleteError) {
        return NextResponse.json({ error: 'AUTH_USER_DELETE_FAILED' }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
}
