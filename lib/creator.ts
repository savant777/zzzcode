import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

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

const readCurrentCreator = async (forDisplay = false): Promise<CreatorSession> => {
    const unavailable = { user: null, creator: null, isCreator: false, isOwner: false, checkFailed: true };
    try {
        // Display can use the SDK's local session. Mutations still verify getUser.
        const { user, userError } = forDisplay
            ? await supabase.auth.getSession().then(({ data, error }) => ({ user: data.session?.user ?? null, userError: error }))
            : await supabase.auth.getUser().then(({ data, error }) => ({ user: data.user, userError: error }));
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

        const { data: creator, error: creatorError } = await supabase
            .from('creators')
            .select('user_id, discord_id, discord_username, display_name, slug, role, is_active, created_at, updated_at')
            .eq('user_id', user.id)
            .maybeSingle();
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
            pendingCreatorCheck = null;
            pendingDisplayCheck = null;
            displayCache = null;
        });
    }
};

/** UI hint only; API/RLS and getCurrentCreator remain the authority for writes. */
export const getCreatorForDisplay = (): Promise<CreatorSession> => {
    if (typeof window === 'undefined') return readCurrentCreator();
    observeAuth();
    if (displayCache && displayCache.expires > Date.now()) return Promise.resolve(displayCache.session);
    if (pendingDisplayCheck) return pendingDisplayCheck;
    const generation = authGeneration;
    const request: Promise<CreatorSession> = readCurrentCreator(true)
        .then(session => {
            if (generation !== authGeneration) return getCreatorForDisplay();
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
