"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import Breadcrumbs from '@/components/Breadcrumbs';
import { getCurrentCreator } from '@/lib/creator';
import { supabase } from '@/lib/supabase';

type SignInStep = 'invite' | 'discord' | 'profile';

const slugify = (value: string) => {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
};

export default function CreatorSignInPage() {
    const router = useRouter();
    const [step, setStep] = useState<SignInStep>('invite');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [displayName, setDisplayName] = useState('');

    useEffect(() => {
        const initSignIn = async () => {
            const session = await getCurrentCreator();

            if (session.isCreator) {
                router.replace('/?group=category&tag=all');
                return;
            }

            if (session.user) {
                const inviteVerified = sessionStorage.getItem('zzzcode_invite_verified') === 'true';

                if (!inviteVerified) {
                    await supabase.auth.signOut();
                    toast.error("INVITE_CODE_REQUIRED");
                    router.replace('/?group=category&tag=all');
                    return;
                }

                setDisplayName(session.user.user_metadata?.name || session.user.user_metadata?.full_name || '');
                setStep('profile');
            } else if (sessionStorage.getItem('zzzcode_invite_verified') === 'true') {
                setStep('discord');
            }

            setLoading(false);
        };

        initSignIn();
    }, [router]);

    const handleInviteSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            const response = await fetch('/api/creator/invite/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: inviteCode }),
            });

            if (!response.ok) {
                throw new Error('INVALID_INVITE_CODE');
            }

            sessionStorage.setItem('zzzcode_invite_verified', 'true');
            setStep('discord');
            toast.success("INVITE_ACCEPTED");
        } catch (error: any) {
            toast.error(error.message || "INVITE_VERIFY_FAILED");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDiscordLogin = async () => {
        setSubmitting(true);

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'discord',
                options: {
                    redirectTo: `${window.location.origin}/creator/signin`,
                },
            });

            if (error) throw error;
        } catch (error: any) {
            toast.error(`DISCORD_AUTH_ERROR: ${error.message}`);
            setSubmitting(false);
        }
    };

    const handleProfileSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                throw new Error("AUTH_SESSION_REQUIRED");
            }

            const response = await fetch('/api/creator/onboard', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ displayName }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "CREATOR_ONBOARD_FAILED");
            }

            sessionStorage.removeItem('zzzcode_invite_verified');
            toast.success("CREATOR_PROFILE_CREATED");
            router.replace('/creator/profile');
            router.refresh();
        } catch (error: any) {
            toast.error(error.message || "CREATOR_ONBOARD_FAILED");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
                <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                    <Breadcrumbs editorMode="SIGN_IN" />
                </div>
                <div className="flex-1 overflow-y-auto px-4 mb-4 scrollbar-hide">
                    <div className="min-h-full flex items-center justify-center border border-dashed border-(--primary)/10 text-[10px] opacity-20 uppercase tracking-widest select-none">
                        Loading_Creator_Gate...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
            <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                <Breadcrumbs editorMode="SIGN_IN" />
                <button onClick={() => router.replace('/?group=category&tag=all')} className="ml-auto text-[10px] md:text-xs cursor-pointer flex items-center gap-1 hover:translate-x-[-4px] transition-all text-(--foreground)/75">
                    <span className="hidden lg:inline">&lt; BACK_TO_DASHBOARD</span>
                    <span className="lg:hidden">&lt; BACK</span>
                </button>
            </div>

            <main className="flex-1 overflow-y-auto px-4 mb-4 scrollbar-hide">
                <section className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center">
                    <div className="border border-(--primary) bg-(--background) p-4 text-(--foreground)">
                        <div className="border-b border-(--primary)/75 pb-3">
                            <h1 className="text-xl text-(--primary) uppercase">Creator_Sign_In</h1>
                        </div>

                        {step === 'invite' && (
                            <form onSubmit={handleInviteSubmit} className="space-y-4 pt-4">
                                <div className="space-y-1">
                                    <label className="block text-[10px] uppercase opacity-70">Invite_Code</label>
                                    <input
                                        type="password"
                                        required
                                        value={inviteCode}
                                        onChange={(event) => setInviteCode(event.target.value)}
                                        className="w-full bg-black/20 border border-(--primary)/50 p-2 font-Google-Sans outline-none focus:border-(--primary)/75"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="cursor-pointer w-full bg-(--primary) text-black py-2 font-bold uppercase hover:brightness-110 disabled:opacity-50"
                                >
                                    {submitting ? 'Verifying...' : 'Verify_Invite'}
                                </button>
                            </form>
                        )}

                        {step === 'discord' && (
                            <div className="space-y-4 pt-4">
                                <p className="text-xs leading-relaxed text-(--foreground)/70">
                                    Invite accepted. Continue with Discord to link your creator account.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleDiscordLogin}
                                    disabled={submitting}
                                    className="cursor-pointer w-full bg-(--primary) text-black py-2 font-bold uppercase hover:brightness-110 disabled:opacity-50"
                                >
                                    {submitting ? 'Connecting...' : 'Login_With_Discord'}
                                </button>
                            </div>
                        )}

                        {step === 'profile' && (
                            <form onSubmit={handleProfileSubmit} className="space-y-4 pt-4">
                                <div className="space-y-1">
                                    <label className="block text-[10px] uppercase opacity-70">Display_Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={displayName}
                                        onChange={(event) => setDisplayName(event.target.value)}
                                        className="w-full bg-black/20 border border-(--primary)/50 p-2 font-Google-Sans outline-none focus:border-(--primary)/75"
                                    />
                                </div>
                                <div className="text-[10px] uppercase text-(--foreground)/40">
                                    Slug: {slugify(displayName) || 'waiting-for-name'}
                                </div>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="cursor-pointer w-full bg-(--primary) text-black py-2 font-bold uppercase hover:brightness-110 disabled:opacity-50"
                                >
                                    {submitting ? 'Creating...' : 'Create_Creator_Profile'}
                                </button>
                            </form>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}
