import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type CreatorRole = 'owner' | 'creator';

export type CreatorProfile = {
    user_id: string;
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
        .select('user_id, display_name, slug, role, is_active, created_at, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

    const activeCreator = creator?.is_active ? creator as CreatorProfile : null;

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
