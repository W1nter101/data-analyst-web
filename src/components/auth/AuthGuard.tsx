'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuthStore } from '@/store/authStore';

/**
 * AuthGuard — client-side route protection for authenticated areas.
 *
 * IMPORTANT: Both refresh() and fetchMe() in authStore catch their own
 * errors internally and never throw. So try/catch here is a safety net,
 * but the REAL protection is explicit state checks after each call.
 *
 * setInitializing(false) is ONLY called when BOTH conditions are met:
 *   1. accessToken is present in store
 *   2. user is present in store
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const currentState = useAuthStore.getState();

        // Step 1: Only call refresh() if we DON'T already have a token.
        // After signIn(), the token is already in the store — calling
        // refresh() would overwrite it with a potentially broken one.
        if (!currentState.accessToken) {
          await useAuthStore.getState().refresh();
        }

        // Step 2: Check token — if still null, session is gone
        const token = useAuthStore.getState().accessToken;
        if (!token) {
          if (!cancelled) router.replace('/signin');
          return;
        }

        // Step 3: Only fetch user if we don't already have one
        if (!useAuthStore.getState().user) {
          await useAuthStore.getState().fetchMe();
        }

        // Step 4: Verify user was ACTUALLY loaded
        const user = useAuthStore.getState().user;
        if (!user) {
          if (!cancelled) router.replace('/signin');
          return;
        }

        // Step 5: Auth FULLY confirmed — both token and user exist
        if (!cancelled) {
          setInitializing(false);
        }
      } catch {
        // Safety net
        if (!cancelled) router.replace('/signin');
      }
    };

    init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While initializing, show spinner — NEVER render children
  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 animate-spin rounded-full border-4 border-[var(--color-surface-2)] border-t-[var(--color-accent)]" />
          <p className="text-sm text-[var(--color-text-faint)]">Đang tải trang...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
