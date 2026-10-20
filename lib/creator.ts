import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Temporary request tracing. Contains no account IDs, credentials or profile data.
const traceInstance = Math.random().toString(36).slice(2, 8);
let traceRequest = 0;
function traceCreator(event: string, details: Record<string, string | number | boolean> = {}) {
    if (typeof window === 'undefined') return;
    console.debug('[creator-auth]', { instance: traceInstance, event, ...details });
}

export type CreatorRole = 'owner' | 'creator';

export type CreatorProfile = {
    user_id: string;
    discord_id: string | null;
    discord_username: string | null;
    display_name: string;
    slug: string | null;
    role: CreatorRole;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
};

export type CreatorSession = {
    checkFailed?: boolean;
    user: User | null;
    creator: CreatorProfile | null;
    isCreator: boolean;
    isOwner: boolean;
};

export const getDiscordIdentity = (user: User | null) => {
    const discordIdentity = user?.identities?.find(identity => identity.provider === 'discord') as any;

    if (!discordIdentity) {
        return {
            discord_id: null,
            discord_username: null,
        };
    }

    const identityData = discordIdentity.identity_data || {};
    const userMetadata = user?.user_metadata || {};

    return {
        discord_id: discordIdentity.provider_id
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

const syncDiscordIdentity = async (user: User, creator: CreatorProfile) => {
    const discordIdentity = getDiscordIdentity(user);

    if (!discordIdentity.discord_id) return creator;

    const nextDiscordUsername = discordIdentity.discord_username || creator.discord_username;
    const hasChanged = creator.discord_id !== discordIdentity.discord_id
        || creator.discord_username !== nextDiscordUsername;

    if (!hasChanged) return creator;

    const { error } = await supabase
        .from('creators')
        .update({
            discord_id: discordIdentity.discord_id,
            discord_username: nextDiscordUsername,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

    if (error) {
        console.error('Creator Discord identity sync error:', error);
        return creator;
    }

    return {
        ...creator,
        discord_id: discordIdentity.discord_id,
        discord_username: nextDiscordUsername,
        updated_at: new Date().toISOString(),
    };
};

const readCurrentCreator = async (forDisplay = false, generation?: number): Promise<CreatorSession> => {
    const request = ++traceRequest;
    traceCreator('check-start', { request, mode: forDisplay ? 'display' : 'verified' });
    const unavailable = { user: null, creator: null, isCreator: false, isOwner: false, checkFailed: true };
    try {
        // Display can use the SDK's local session. Mutations still verify getUser.
        const { user, userError } = forDisplay
            ? await supabase.auth.getSession().then(({ data, error }) => ({ user: data.session?.user ?? null, userError: error }))
            : await supabase.auth.getUser().then(({ data, error }) => ({ user: data.user, userError: error }));
        // Auth initialization can emit SIGNED_IN before getSession resolves.
        // Join the replacement check before sending an obsolete profile query.
        if (forDisplay && generation !== undefined && generation !== authGeneration) {
            traceCreator('session-join-current', { request, generation, currentGeneration: authGeneration });
            return getCreatorForDisplay('session-changed');
        }
        if (typeof window !== 'undefined' && observedAuthUser === undefined && !userError) {
            observedAuthUser = user?.id ?? null;
        }
        if (userError && userError.name !== 'AuthSessionMissingError') return unavailable;

        if (!user) {
            return {
                user: null,
                creator: null,
                isCreator: false,
                isOwner: false,
            };
        }

        traceCreator('profile-request', { request, generation: authGeneration });
        const { data: creator, error: creatorError } = await supabase
            .from('creators')
            .select('user_id, discord_id, discord_username, display_name, slug, role, is_active, created_at, updated_at')
            .eq('user_id', user.id)
            .maybeSingle();
        traceCreator('profile-response', { request, failed: !!creatorError });
        if (creatorError) return { ...unavailable, user };

        const activeCreator = creator?.is_active
            ? forDisplay ? creator as CreatorProfile : await syncDiscordIdentity(user, creator as CreatorProfile)
            : null;

        return {
            user,
            creator: activeCreator,
            isCreator: !!activeCreator,
            isOwner: activeCreator?.role === 'owner',
        };
    } catch {
        return unavailable;
    }
};

let pendingCreatorCheck: Promise<CreatorSession> | null = null;
let authGeneration = 0;
let observingAuth = false;
let pendingDisplayCheck: Promise<CreatorSession> | null = null;
let displayCache: { session: CreatorSession; expires: number } | null = null;
let observedAuthUser: string | null | undefined;

const observeAuth = () => {
    if (!observingAuth) {
        observingAuth = true;
        supabase.auth.onAuthStateChange((event, session) => {
            const userId = session?.user.id ?? null;
            traceCreator('auth-event', { authEvent: event, knownAccount: observedAuthUser !== undefined,
                sameAccount: observedAuthUser === userId, generation: authGeneration });
            if (event === 'INITIAL_SESSION') {
                if (observedAuthUser === undefined) observedAuthUser = userId;
                return;
            }
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
                // Reconfirmation/focus and token renewal for the same account must
                // keep the in-flight check and its short-lived display result.
                if (observedAuthUser === userId) return;
                observedAuthUser = userId;
            }
            authGeneration++;
            traceCreator('invalidate', { authEvent: event, generation: authGeneration });
            pendingCreatorCheck = null;
            pendingDisplayCheck = null;
            displayCache = null;
        });
    }
};

/** UI hint only; API/RLS and getCurrentCreator remain the authority for writes. */
export const getCreatorForDisplay = (source = 'unspecified'): Promise<CreatorSession> => {
    if (typeof window === 'undefined') return readCurrentCreator();
    observeAuth();
    if (displayCache && displayCache.expires > Date.now()) {
        traceCreator('display-cache-hit', { source });
        return Promise.resolve(displayCache.session);
    }
    if (pendingDisplayCheck) {
        traceCreator('display-join', { source });
        return pendingDisplayCheck;
    }
    traceCreator('display-new', { source, generation: authGeneration });
    const generation = authGeneration;
    const request: Promise<CreatorSession> = readCurrentCreator(true, generation)
        .then(session => {
            if (generation !== authGeneration) {
                traceCreator('display-restart', { generation, currentGeneration: authGeneration });
                return getCreatorForDisplay('stale-result');
            }
            if (!session.checkFailed) displayCache = { session, expires: Date.now() + 30_000 };
            return session;
        })
        .finally(() => {
            if (pendingDisplayCheck === request) pendingDisplayCheck = null;
        });
    pendingDisplayCheck = request;
    return request;
};

export const getCurrentCreator = (): Promise<CreatorSession> => {
    traceCreator('verified-call');
    // Never share requests across users during server rendering.
    if (typeof window === 'undefined') return readCurrentCreator();
    observeAuth();
    displayCache = null;
    if (pendingCreatorCheck) return pendingCreatorCheck;
    const generation = authGeneration;
    const request: Promise<CreatorSession> = readCurrentCreator()
        .then(session => generation === authGeneration ? session : getCurrentCreator())
        .finally(() => {
            if (pendingCreatorCheck === request) pendingCreatorCheck = null;
        });
    pendingCreatorCheck = request;
    return request;
};

export const canManageTemplate = (
    session: Pick<CreatorSession, 'user' | 'isCreator' | 'isOwner'>,
    templateUserId?: string | null
) => {
    if (!session.user || !session.isCreator) return false;
    if (session.isOwner) return true;
    return templateUserId === session.user.id;
};

export const requireCreator = async () => {
    const session = await getCurrentCreator();

    return {
        ...session,
        canAccessCreatorTools: session.isCreator,
    };
};
