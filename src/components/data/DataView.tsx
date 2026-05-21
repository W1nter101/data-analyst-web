'use client';

import { useState } from 'react';

import { DataTable } from '@/components/table/DataTable';
import { TableToolbar } from '@/components/table/TableToolbar';
import { BoardDataView } from '@/components/board/BoardDataView';
import { useCSVData } from '@/hooks/useCSVData';

type DataSubTab = 'sheet1' | 'board-data';

const SUB_TABS: { key: DataSubTab; label: string }[] = [
  { key: 'sheet1', label: 'Sheet1' },
  { key: 'board-data', label: 'Board Data' },
];

/**
 * DataView — content for the "Data" tab.
 * Has two sub-tabs:
 *   - Sheet1: renders the existing CSV table (DataTable + TableToolbar)
 *   - Board Data: placeholder for Phase 2 board table creation
 */
export function DataView() {
  const [activeSubTab, setActiveSubTab] = useState<DataSubTab>('sheet1');
  const { csv } = useCSVData();

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-foreground/10 pb-0">
        {SUB_TABS.map((tab) => {
          const isActive = activeSubTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSubTab(tab.key)}
              className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-foreground'
                  : 'text-foreground/45 hover:text-foreground/70'
              }`}
            >
              {tab.label}
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'sheet1' ? (
        csv ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                Data Table
              </h2>
              <p className="text-sm text-foreground/65">
                {csv.rowCount.toLocaleString()} row
                {csv.rowCount === 1 ? '' : 's'}
              </p>
            </div>
            <TableToolbar />
            <DataTable />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/15 bg-foreground/2 px-6 py-16 text-center">
            <p className="text-sm text-foreground/60">
              Chưa có dữ liệu. Hãy upload file CSV ở tab Board.
            </p>
          </div>
        )
      ) : (
        <BoardDataView />
      )}
    </div>
  );
}
