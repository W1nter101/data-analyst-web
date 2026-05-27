'use client';

import { useState, useCallback } from 'react';
import { LeftPanel } from '@/components/dashboard/LeftPanel';
import { RightPanel } from '@/components/dashboard/RightPanel';
import { useAppStore } from '@/store/appStore';

/**
 * DashboardShell — two-column layout for the dashboard.
 *
 * Desktop: CSS Grid with LeftPanel (360px) + RightPanel (1fr)
 * Mobile (<768px): Single column with LeftPanel as slide-in drawer
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeTab = useAppStore((s) => s.activeTab);

  const showLeftPanel = activeTab === 'board';

  const toggleCollapse = useCallback(() => setCollapsed((c) => !c), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <div
      className="grid h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)] transition-[grid-template-columns] duration-300"
      style={{
        gridTemplateColumns: showLeftPanel
          ? collapsed ? '64px 1fr' : '360px 1fr'
          : '1fr',
      }}
    >
      {/* ── Desktop LeftPanel (Board tab only) ───────────── */}
      {showLeftPanel && (
        <div className="hidden md:flex h-full min-h-0">
          <LeftPanel
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
          />
        </div>
      )}

      {/* ── Mobile drawer overlay (Board tab only) ────────── */}
      {showLeftPanel && drawerOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          aria-label="Chat drawer"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 transition-opacity"
            onClick={closeDrawer}
          />
          {/* Drawer panel */}
          <div className="absolute left-0 top-0 z-10 h-full w-[320px] animate-slide-in-left">
            <LeftPanel
              collapsed={false}
              onToggleCollapse={closeDrawer}
              isMobileDrawer
            />
          </div>
        </div>
      )}

      {/* ── RightPanel ───────────────────────────────────── */}
      <RightPanel onOpenDrawer={showLeftPanel ? openDrawer : undefined}>
        {children}
      </RightPanel>
    </div>
  );
}

