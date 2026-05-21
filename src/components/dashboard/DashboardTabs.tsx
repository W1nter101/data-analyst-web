'use client';

import { useAppStore, type DashboardTab } from '@/store/appStore';

const TABS: { key: DashboardTab; label: string }[] = [
  { key: 'board', label: 'Board' },
  { key: 'data', label: 'Data' },
];

/**
 * DashboardTabs — top-level tab bar for switching between Board and Data views.
 */
export function DashboardTabs() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  return (
    <div className="mb-6 flex gap-1 rounded-lg border border-foreground/10 bg-foreground/3 p-1">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground/50 hover:text-foreground/80'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
