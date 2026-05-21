'use client';

import { useState, useCallback } from 'react';
import { LeftPanel } from '@/components/dashboard/LeftPanel';
import { RightPanel } from '@/components/dashboard/RightPanel';
import { useAppStore } from '@/store/appStore';

/**
 * DashboardShell — two-column layout for the dashboard.
 *
 * Desktop: CSS Grid with collapsible LeftPanel (360px ↔ 64px) + RightPanel (1fr)
 * Mobile (<768px): Single column with LeftPanel as slide-in drawer
 *
 * Children are slotted into RightPanel's main content area.
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
      className="grid h-screen overflow-hidden bg-background text-foreground transition-[grid-template-columns] duration-300"
      style={{
        gridTemplateColumns: showLeftPanel
          ? collapsed ? '64px 1fr' : '360px 1fr'
          : '1fr',
      }}
    >
      {/* ── Desktop LeftPanel (Board tab only) ───────────── */}
      {showLeftPanel && (
        <div className="hidden md:flex">
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
          <div className="relative z-10 h-full w-[320px] animate-slide-in-left">
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
