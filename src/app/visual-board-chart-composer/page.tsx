'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

import { ComposerChartTypeSelector } from '@/components/composer/ComposerChartTypeSelector';
import { ComposerDropZone } from '@/components/composer/ComposerDropZone';
import { ComposerFieldList } from '@/components/composer/ComposerFieldList';
import { ComposerPreview } from '@/components/composer/ComposerPreview';
import { useAppStore } from '@/store/appStore';
import type { ChartConfig, ChartType, ColumnSchema } from '@/types';

export default function ChartComposerPage() {
  const router = useRouter();
  const csv = useAppStore((s) => s.csv);
  const addChart = useAppStore((s) => s.addChart);
  const updateChart = useAppStore((s) => s.updateChart);
  const addWidget = useAppStore((s) => s.addWidget);
  const updateWidget = useAppStore((s) => s.updateWidget);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setEditingChartId = useAppStore((s) => s.setEditingChartId);
  const setPendingChartSlotId = useAppStore((s) => s.setPendingChartSlotId);

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xField, setXField] = useState<ColumnSchema | null>(null);
  const [yField, setYField] = useState<ColumnSchema | null>(null);
  const [groupByField, setGroupByField] = useState<ColumnSchema | null>(null);
  const [title, setTitle] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  // ── Pre-populate when editing an existing chart ──────
  useEffect(() => {
    const editingId = useAppStore.getState().editingChartId;
    if (!editingId) return;

    const existing = useAppStore.getState().charts.find((c) => c.id === editingId);
    const schema = useAppStore.getState().csv?.schema;
    if (!existing || !schema) return;

    setIsEditMode(true);
    setChartType(existing.type);
    setTitle(existing.title);

    const xCol = schema.find((c) => c.name === existing.xColumn) ?? null;
    const yCol = schema.find((c) => c.name === existing.yColumn) ?? null;
    const groupCol = existing.colorColumn
      ? schema.find((c) => c.name === existing.colorColumn) ?? null
      : null;

    setXField(xCol);
    setYField(yCol);
    setGroupByField(groupCol);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a temporary ChartConfig for live preview
  const tempConfig = useMemo<ChartConfig | null>(() => {
    if (!xField || !yField) return null;
    return {
      id: 'composer-preview',
      type: chartType,
      title: title.trim() || `${yField.name} theo ${xField.name}`,
      xColumn: xField.name,
      yColumn: yField.name,
      colorColumn: groupByField?.name,
    };
  }, [chartType, xField, yField, groupByField, title]);

  const canSubmit = Boolean(xField && yField && csv);

  // ── Empty state: no CSV loaded ───────────────────────
  if (!csv) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] text-[var(--color-text)]">
        <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
          <svg
            className="size-8 text-[var(--color-text-faint)]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>
        <p className="text-lg font-semibold text-[var(--color-text)]">
          Chưa có dữ liệu
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Hãy upload file CSV trước khi tạo biểu đồ
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="mt-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
        >
          Về Dashboard
        </button>
      </div>
    );
  }

  // ── CREATE handler ───────────────────────────────────
  const handleAddToBoard = () => {
    if (!tempConfig || !canSubmit) return;

    const chartId = uuidv4();
    const finalTitle = title.trim() || `${yField!.name} theo ${xField!.name}`;

    addChart({
      id: chartId,
      type: chartType,
      title: finalTitle,
      xColumn: xField!.name,
      yColumn: yField!.name,
      colorColumn: groupByField?.name,
    });

    // Check if we're filling an existing empty slot
    const slotId = useAppStore.getState().pendingChartSlotId;
    if (slotId) {
      updateWidget(slotId, { widgetType: 'chart', chartId });
      setPendingChartSlotId(null);
    } else {
      addWidget({
        id: uuidv4(),
        widgetType: 'chart',
        chartId,
        layout: { x: 0, y: Infinity, w: 6, h: 6 },
      });
    }

    setActiveTab('board');
    router.push('/dashboard');
  };

  // ── UPDATE handler (edit mode) ───────────────────────
  const handleUpdateChart = () => {
    const editingId = useAppStore.getState().editingChartId;
    if (!editingId || !canSubmit) return;

    const finalTitle = title.trim() || `${yField!.name} theo ${xField!.name}`;

    updateChart(editingId, {
      type: chartType,
      title: finalTitle,
      xColumn: xField!.name,
      yColumn: yField!.name,
      colorColumn: groupByField?.name,
    });

    setEditingChartId(null);
    setActiveTab('board');
    router.push('/dashboard');
  };

  // ── Cancel edit ──────────────────────────────────────
  const handleCancel = () => {
    if (isEditMode) {
      setEditingChartId(null);
    }
    router.push('/dashboard');
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* ── Top bar ──────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-4">
        <button
          type="button"
          onClick={handleCancel}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <svg
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          Back
        </button>
        <div className="h-5 w-px bg-[var(--color-border)]" />
        <h1 className="text-sm font-semibold">
          {isEditMode ? 'Edit Chart' : 'Chart Composer'}
        </h1>
      </div>

      {/* ── Main content ─────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Left sidebar: field list */}
        <div className="w-60 shrink-0 overflow-y-auto border-r border-[var(--color-border)] p-4">
          <ComposerFieldList columns={csv.schema} />
        </div>

        {/* Right: config + preview */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-5 p-5">
            {/* Chart type selector */}
            <ComposerChartTypeSelector
              value={chartType}
              onChange={setChartType}
            />

            {/* Drop zones */}
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <ComposerDropZone
                label="X Axis"
                field={xField}
                onDrop={setXField}
                onRemove={() => setXField(null)}
              />
              <ComposerDropZone
                label="Values"
                field={yField}
                onDrop={setYField}
                onRemove={() => setYField(null)}
              />
              <ComposerDropZone
                label="Group By"
                field={groupByField}
                onDrop={setGroupByField}
                onRemove={() => setGroupByField(null)}
              />
            </div>

            {/* Title input */}
            <div className="flex items-center gap-3">
              <label
                htmlFor="composer-title"
                className="w-20 shrink-0 text-right text-xs font-medium text-[var(--color-text-muted)]"
              >
                Title
              </label>
              <input
                id="composer-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  xField && yField
                    ? `${yField.name} theo ${xField.name}`
                    : 'Chart title'
                }
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30 outline-none"
              />
            </div>

            {/* Chart preview */}
            <ComposerPreview chartConfig={tempConfig} data={csv} />
          </div>
        </div>
      </div>

      {/* ── Bottom bar ───────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
        <span className="text-xs text-[var(--color-text-faint)]">
          Sheet1 · {csv.rowCount.toLocaleString()} rows · {csv.headers.length}{' '}
          cols
        </span>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            Cancel
          </button>

          {isEditMode ? (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleUpdateChart}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors enabled:hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Update Chart
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m4.5 12.75 6 6 9-13.5"
                />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleAddToBoard}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors enabled:hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add to Board
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

