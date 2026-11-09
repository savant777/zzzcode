import { supabase } from '@/lib/supabase';

const TTL = 30_000;
const entries = new Map<string, { expires: number; promise: Promise<unknown> }>();
let generation = 0;
let observing = false;
let observedUser: string | null | undefined;
let authReady: Promise<void>;
export const DASHBOARD_CACHE_CHANGED = 'zzzcode-dashboard-cache-changed';

export function invalidateDashboardCache() {
    generation++;
    entries.clear();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(DASHBOARD_CACHE_CHANGED));
}

/** In-memory only: never persist account-dependent catalog data or share it on the server. */
export function dashboardRequest<T extends { error: unknown }>(key: string, load: () => PromiseLike<T>): Promise<T> {
    if (typeof window === 'undefined') return Promise.resolve(load());
    if (!observing) {
        observing = true;
        let finishInitialization!: () => void;
        let initializing = true;
        authReady = new Promise<void>(resolve => { finishInitialization = resolve; });
        supabase.auth.onAuthStateChange((event, session) => {
            const user = session?.user.id ?? null;
            if (event === 'INITIAL_SESSION') {
                if (initializing) {
                    observedUser = user;
                    initializing = false;
                    finishInitialization();
                }
                return;
            }
            // Session recovery can emit SIGNED_IN before INITIAL_SESSION.
            // No data has loaded yet, so establish identity without invalidating.
            if (initializing) {
                observedUser = user;
                return;
            }
            // SDK emits SIGNED_IN again on tab focus and refreshes tokens in the
            // background. Neither means the catalog's account has changed.
            if (event === 'TOKEN_REFRESHED') return;
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                if (observedUser === user) return;
                observedUser = user;
            }
            invalidateDashboardCache();
        });
    }
    const cached = entries.get(key);
    if (cached && cached.expires > Date.now()) return cached.promise as Promise<T>;
    const currentGeneration = generation;
    const entry = { expires: Infinity, promise: null as unknown as Promise<T> };
    // Subscribe first and wait outside the auth callback, avoiding auth-lock deadlocks.
    entry.promise = authReady.then(load).then(result => {
        // A logout or write during a request must not restore old cached data.
        if (generation !== currentGeneration) return dashboardRequest(key, load);
        if (result.error) entries.delete(key);
        else entry.expires = Date.now() + TTL;
        return result;
    }).catch(error => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
    });
    entries.set(key, entry);
    return entry.promise;
}
