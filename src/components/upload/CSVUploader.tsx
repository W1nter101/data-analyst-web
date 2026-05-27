'use client';

import { useCallback, useRef, useState } from 'react';

import { useCSVData } from '@/hooks/useCSVData';
import { useAppStore } from '@/store/appStore';

const MAX_WARN_BYTES = 50 * 1024 * 1024;

function isCsvFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) return true;
  const t = file.type.toLowerCase();
  return t === 'text/csv' || t === 'application/vnd.ms-excel';
}

export function CSVUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { csv, isLoading, error, uploadFile, clearData } = useCSVData();
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState(false);

  const displayError = error ?? localError;

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setLocalError(null);
      if (!isCsvFile(file)) {
        setSizeWarning(false);
        setLocalError('Please choose a .csv file.');
        return;
      }
      setSizeWarning(file.size > MAX_WARN_BYTES);
      await uploadFile(file);
      const { error: storeError } = useAppStore.getState();
      if (!storeError) {
        setLastFileName(file.name);
      }
    },
    [uploadFile],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      void handleFile(file);
      e.target.value = '';
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files?.[0];
      void handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onRetry = useCallback(() => {
    clearData();
    setLocalError(null);
    setSizeWarning(false);
    setLastFileName(null);
  }, [clearData]);

  const onChangeFile = useCallback(() => {
    clearData();
    setLocalError(null);
    setSizeWarning(false);
    setLastFileName(null);
    openPicker();
  }, [clearData, openPicker]);

  const showSuccess = Boolean(csv && !isLoading && !displayError);

  return (
    <div className="w-full max-w-xl">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label="Upload CSV file"
        onChange={onInputChange}
      />

      {isLoading ? (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            className="size-10 rounded-full border-2 border-current border-t-transparent animate-spin text-[var(--color-text)]"
            aria-hidden
          />
          <p className="text-sm font-medium text-[var(--color-text)]">Parsing…</p>
          {sizeWarning ? (
            <p className="max-w-sm text-center text-xs text-[var(--color-warning)]">
              This file is larger than 50 MB. Parsing may take a while.
            </p>
          ) : null}
        </div>
      ) : displayError ? (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--color-error)] bg-[var(--color-error)]/10 px-6 py-10"
          role="alert"
        >
          <p className="text-center text-sm text-[var(--color-error)]">{displayError}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Retry
          </button>
        </div>
      ) : showSuccess ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-solid border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10">
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--color-text)]">{lastFileName ?? 'Uploaded file'}</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {csv!.rowCount.toLocaleString()} row{csv!.rowCount === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onChangeFile}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Change file
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={openPicker}
            onDrop={onDrop}
            onDragOver={onDragOver}
            className="flex min-h-[200px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-2)]"
          >
            <span className="text-sm font-medium text-[var(--color-text)]">
              Drag and drop a CSV here, or click to browse
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">.csv only</span>
          </button>
        </div>
      )}
    </div>
  );
}
