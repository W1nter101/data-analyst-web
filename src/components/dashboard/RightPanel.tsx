'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { useAuthStore } from '@/store/authStore';

/**
 * RightPanel — main content area with top bar.
 *
 * TopBar shows:
 *   - Hamburger button (mobile only, triggers drawer)
 *   - Page title
 *   - Username from authStore
 *   - Logout button with loading state
 *
 * Children are rendered in a scrollable main content area.
 */
interface RightPanelProps {
  children: React.ReactNode;
  onOpenDrawer: () => void;
}

export function RightPanel({ children, onOpenDrawer }: RightPanelProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push('/signin');
    } catch (error) {
      console.error(error);
      setSigningOut(false);
    }
  }, [signOut, router]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── TopBar ──────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-foreground/10 bg-background px-4">
        {/* Left: hamburger (mobile) + title */}
        <div className="flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={onOpenDrawer}
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground md:hidden"
            aria-label="Mở chat"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          <h1 className="text-sm font-semibold text-foreground">
            CSV Analyst
          </h1>
        </div>

        {/* Right: username + logout */}
        <div className="flex items-center gap-3">
          {/* User info */}
          {user && (
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-foreground/5 text-xs font-semibold text-foreground/60">
                {user.displayName?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="hidden text-sm text-foreground/70 sm:inline">
                {user.displayName}
              </span>
            </div>
          )}

          {/* Logout button */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className="flex items-center gap-1.5 rounded-lg border border-foreground/10 px-2.5 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signingOut ? (
              <span className="size-3.5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
            ) : (
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
                />
              </svg>
            )}
            <span className="hidden sm:inline">
              {signingOut ? 'Đang thoát...' : 'Thoát'}
            </span>
          </button>
        </div>
      </div>

      {/* ── Main content (scrollable) ───────────────────── */}
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
