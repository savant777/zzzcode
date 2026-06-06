"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import Breadcrumbs from '@/components/Breadcrumbs';
import Modal from '@/components/Modal';
import { supabase } from '@/lib/supabase';
import { CreatorSession, getCurrentCreator, requireCreator } from '@/lib/creator';

type ProfileForm = {
    display_name: string;
    slug: string;
};

type TooltipLabelProps = {
    label: string;
    description: string;
};

const slugify = (value: string) => {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
};

function DescriptionLabel({ label, description }: TooltipLabelProps) {
    const [showDescription, setShowDescription] = useState(false);

    return (
        <div>
            <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase opacity-70">{label}</label>
                <button
                    type="button"
                    aria-label={`Show description for ${label}`}
                    aria-pressed={showDescription}
                    onClick={() => setShowDescription(prev => !prev)}
                    className="mb-px flex h-3 w-3 items-center justify-center text-[8px] leading-none text-(--primary)/70 hover:text-(--primary) transition-colors cursor-pointer"
                >
                    [?]
                </button>
            </div>

            {showDescription && (
                <p className="font-Google-Sans text-[10px] leading-relaxed text-(--foreground)/45">
                    {description}
                </p>
            )}
        </div>
    );
}

export default function CreatorProfilePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [creatorSession, setCreatorSession] = useState<CreatorSession | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isSlugEdited, setIsSlugEdited] = useState(false);
    const [form, setForm] = useState<ProfileForm>({
        display_name: '',
        slug: '',
    });

    const loadProfile = async () => {
        setLoading(true);
        const session = await requireCreator();

        if (!session.user) {
            toast.error("ERROR_ACCESS_DENIED: LOGIN_REQUIRED");
            router.replace('/?group=category&tag=all');
            return;
        }

        if (!session.canAccessCreatorTools) {
            toast.error("ERROR_ACCESS_DENIED: CREATOR_REQUIRED");
            router.replace('/?group=category&tag=all');
            return;
        }

        setCreatorSession(session);
        setForm({
            display_name: session.creator?.display_name || '',
            slug: session.creator?.slug || '',
        });
        setLoading(false);
    };

    useEffect(() => {
        loadProfile();
    }, []);

    const openEditModal = () => {
        setIsSlugEdited(false);
        setForm({
            display_name: creatorSession?.creator?.display_name || '',
            slug: creatorSession?.creator?.slug || '',
        });
        setIsEditOpen(true);
    };

    const syncCreatorTag = async (nextProfile: ProfileForm) => {
        if (!creatorSession?.user) return;

        const { data: creatorsGroup, error: groupError } = await supabase
            .from('tag_groups')
            .select('id')
            .ilike('name', 'creators')
            .single();

        if (groupError) throw groupError;
        if (!creatorsGroup) return;

        const { data: existingTag, error: tagLookupError } = await supabase
            .from('tags')
            .select('id')
            .eq('group_id', creatorsGroup.id)
            .eq('user_id', creatorSession.user.id)
            .limit(1)
            .maybeSingle();

        if (tagLookupError) throw tagLookupError;

        if (existingTag) {
            const { error: updateTagError } = await supabase
                .from('tags')
                .update({
                    name: nextProfile.display_name,
                    slug: nextProfile.slug,
                    is_active: true,
                })
                .eq('id', existingTag.id);

            if (updateTagError) throw updateTagError;
            return;
        }

        const { error: insertTagError } = await supabase
            .from('tags')
            .insert([{
                group_id: creatorsGroup.id,
                user_id: creatorSession.user.id,
                name: nextProfile.display_name,
                slug: nextProfile.slug,
                is_active: true,
            }]);

        if (insertTagError) throw insertTagError;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!creatorSession?.user || !creatorSession.isCreator) return;

        const nextProfile = {
            display_name: form.display_name.trim(),
            slug: slugify(form.slug || form.display_name),
        };

        if (!nextProfile.display_name || !nextProfile.slug) {
            toast.error("PROFILE_INVALID: DISPLAY_NAME_AND_SLUG_REQUIRED");
            return;
        }

        setSaving(true);
        const toastId = toast.loading("SYSTEM: Updating_Creator_Profile...");

        try {
            const { error: profileError } = await supabase
                .from('creators')
                .update({
                    display_name: nextProfile.display_name,
                    slug: nextProfile.slug,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', creatorSession.user.id);

            if (profileError) throw profileError;

            await syncCreatorTag(nextProfile);

            const nextSession = await getCurrentCreator();
            setCreatorSession(nextSession);
            setForm(nextProfile);
            setIsEditOpen(false);
            toast.success("PROFILE_UPDATED", { id: toastId });
            router.refresh();
        } catch (error: any) {
            toast.error(`PROFILE_UPDATE_FAILED: ${error.message}`, { id: toastId });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
                <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                    <Breadcrumbs editorMode="PROFILE" />
                </div>

                <div className="flex-1 overflow-y-auto px-4 mb-4 scrollbar-hide">
                    <div className="min-h-full flex items-center justify-center border border-dashed border-(--primary)/10 text-[10px] opacity-20 uppercase tracking-widest select-none">
                        Loading_Creator_Profile...
                    </div>
                </div>
            </div>
        );
    }

    const creator = creatorSession?.creator;
    const user = creatorSession?.user;

    return (
        <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
            <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                <Breadcrumbs editorMode="PROFILE" />
                <button onClick={() => router.back()} className="ml-auto text-[10px] md:text-xs cursor-pointer flex items-center gap-1 hover:translate-x-[-4px] transition-all text-(--foreground)/75">
                    <span className="hidden lg:inline">&lt; BACK_TO_DASHBOARD</span>
                    <span className="lg:hidden">&lt; BACK</span>
                </button>
            </div>

            <main className="flex-1 overflow-y-auto px-4 mb-4 scrollbar-hide">
                <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center">
                    <div className="border border-(--primary) bg-(--background) p-4 text-(--foreground)">
                        <div className="flex items-center justify-between gap-3 border-b border-(--primary)/75 pb-3">
                            <div>
                                <h1 className="text-xl text-(--primary) uppercase">Creator_Profile</h1>
                            </div>
                            <button
                                type="button"
                                onClick={openEditModal}
                                className="bg-(--primary) px-2 py-1 text-xs font-black uppercase text-(--background) transition-all hover:brightness-110 cursor-pointer"
                            >
                                <span className="hidden md:inline">Edit_Profile</span>
                                <span className="md:hidden">Edit</span>
                            </button>
                        </div>

                        <div className="grid gap-3 py-4 text-sm md:grid-cols-2">
                            <div className="border border-(--primary)/20 bg-black/20 p-3">
                                <div className="text-[10px] uppercase tracking-widest text-(--foreground)/40">Display_Name</div>
                                <div className="font-Google-Sans text-lg text-(--primary)">{creator?.display_name}</div>
                            </div>

                            <div className="border border-(--primary)/20 bg-black/20 p-3">
                                <div className="text-[10px] uppercase tracking-widest text-(--foreground)/40">Slug</div>
                                <div className="break-all font-Google-Sans text-lg text-(--primary)">{creator?.slug}</div>
                            </div>

                            <div className="border border-(--primary)/20 bg-black/20 p-3">
                                <div className="text-[10px] uppercase tracking-widest text-(--foreground)/40">Role</div>
                                <div className="uppercase text-(--foreground)/80">{creator?.role}</div>
                            </div>

                            <div className="border border-(--primary)/20 bg-black/20 p-3">
                                <div className="text-[10px] uppercase tracking-widest text-(--foreground)/40">Auth_Email</div>
                                <div className="break-all font-Google-Sans text-(--foreground)/80">{user?.email || 'N/A'}</div>
                            </div>
                        </div>

                        <div className="border-t border-(--primary)/20 pt-3 text-[10px] uppercase tracking-widest text-(--foreground)/35">
                            Updating this profile also updates the matching creator tag used by the side menu.
                        </div>
                    </div>
                </section>
            </main>

            <Modal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                title="Edit Creator Profile"
            >
                <form onSubmit={handleSubmit} className="space-y-4 text-(--foreground)">
                    <div className="space-y-1">
                        <DescriptionLabel
                            label="Display_Name"
                            description="ชื่อที่โชว์บนแถบเมนู แท็ก และการ์ดเทมเพลต"
                        />
                        <input
                            type="text"
                            required
                            value={form.display_name}
                            onChange={(event) => {
                                const nextName = event.target.value;
                                setForm(prev => ({
                                    display_name: nextName,
                                    slug: isSlugEdited ? prev.slug : slugify(nextName),
                                }));
                            }}
                            className="w-full bg-black/20 border border-(--primary)/50 p-2 font-Google-Sans outline-none focus:border-(--primary)/75"
                        />
                    </div>

                    <div className="space-y-1">
                        <DescriptionLabel
                            label="Slug"
                            description="ชื่อที่โชว์บน url"
                        />
                        <input
                            type="text"
                            required
                            value={form.slug}
                            onChange={(event) => {
                                setIsSlugEdited(true);
                                setForm(prev => ({ ...prev, slug: slugify(event.target.value) }));
                            }}
                            className="w-full bg-black/20 border border-(--primary)/50 p-2 font-Google-Sans outline-none focus:border-(--primary)/75"
                        />
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsEditOpen(false)}
                            className="cursor-pointer flex-1 py-2 border border-(--primary)/20 uppercase text-xs hover:bg-(--primary)/5 transition-colors"
                        >
                            Abort
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="cursor-pointer flex-1 py-2 bg-(--primary) text-black font-bold uppercase text-xs hover:brightness-110 disabled:opacity-50"
                        >
                            {saving ? 'Updating...' : 'Save_Profile'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
