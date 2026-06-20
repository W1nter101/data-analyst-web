'use client';

import { useState } from 'react';
import { useCSVData } from '@/hooks/useCSVData';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';

export function TableToolbar() {
  const { csv, clearData } = useCSVData();
  const [resetting, setResetting] = useState(false);
  
  const currentFileId = useAppStore((s) => s.currentFileId);
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!csv) {
    return null;
  }

  const handleReset = async () => {
    if (!currentFileId) return;
    const confirm = window.confirm("Tất cả thay đổi sẽ bị mất. Tiếp tục?");
    if (!confirm) return;

    setResetting(true);
    try {
      const res = await fetch('/api/transform/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ fileId: currentFileId }),
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        // Fetch updated schema
        if (accessToken) {
          const fileRes = await fetch(`/api/files/${currentFileId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const fileData = await fileRes.json();
          if (fileData.success) {
            useAppStore.getState().setCSV({
              headers: fileData.file.schema.map((s: { name: string }) => s.name),
              rowCount: fileData.file.row_count,
              schema: fileData.file.schema,
              rows: [],
            });
          }
        }
        // Trigger row reload
        useAppStore.getState().triggerRefresh();
        alert("✅ " + (data.message || "Đã khôi phục dữ liệu gốc thành công"));
      } else {
        alert("❌ Khôi phục thất bại: " + (data.message || "Lỗi không xác định"));
      }
    } catch (e) {
      alert("❌ Khôi phục thất bại: " + (e instanceof Error ? e.message : "Lỗi kết nối"));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--color-text-muted)]">
        <span>
          <span className="font-medium text-[var(--color-text)]">Total rows:</span>{' '}
          {csv.rowCount.toLocaleString()}
        </span>
        <span>
          <span className="font-medium text-[var(--color-text)]">Columns:</span>{' '}
          {csv.headers.length.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="rounded-md border border-purple-500/30 bg-purple-500/5 px-3 py-1.5 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-500/10 disabled:opacity-50 cursor-pointer"
        >
          {resetting ? 'Đang khôi phục...' : '↩️ Khôi phục dữ liệu gốc'}
        </button>
        <button
          type="button"
          onClick={clearData}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] cursor-pointer"
        >
          Clear data
        </button>
      </div>
    </div>
  );
}
