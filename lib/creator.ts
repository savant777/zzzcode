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

export const getCurrentCreator = async (): Promise<CreatorSession> => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return {
            user: null,
            creator: null,
            isCreator: false,
            isOwner: false,
        };
    }

    const { data: creator } = await supabase
        .from('creators')
        .select('user_id, discord_id, discord_username, display_name, slug, role, is_active, created_at, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

    const activeCreator = creator?.is_active
        ? await syncDiscordIdentity(user, creator as CreatorProfile)
        : null;

    return {
        user,
        creator: activeCreator,
        isCreator: !!activeCreator,
        isOwner: activeCreator?.role === 'owner',
    };
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
