'use client';

import { useAppStore, type DashboardTab } from '@/store/appStore';

const TABS: { key: DashboardTab; label: string }[] = [
  { key: 'board', label: 'Board' },
  { key: 'data', label: 'Data' },
  { key: 'notebook', label: 'Notebook' },
];

/**
 * DashboardTabs — top-level tab bar for switching between Board and Data views.
 */
export function DashboardTabs() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  return (
    <div className="mb-6 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[var(--color-bg)] text-[var(--color-text)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
