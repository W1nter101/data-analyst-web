import { useCallback } from 'react';

import { parseCSVFile } from '@/lib/csv/parser';
import { useAppStore } from '@/store/appStore';

export function useCSVData() {
  const csv = useAppStore((s) => s.csv);
  const isLoading = useAppStore((s) => s.isLoading);
  const error = useAppStore((s) => s.error);
  const setCSV = useAppStore((s) => s.setCSV);
  const setLoading = useAppStore((s) => s.setLoading);
  const setError = useAppStore((s) => s.setError);
  const clearCSV = useAppStore((s) => s.clearCSV);

  const uploadFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const csvText = await file.text();
        
        // 1. Upload to server for SQLite
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvText }),
        });
        if (!res.ok) {
          throw new Error('Failed to upload CSV to server');
        }

        // 2. Parse and store in client (Zustand)
        const parsed = await parseCSVFile(file);
        setCSV(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse CSV');
      } finally {
        setLoading(false);
      }
    },
    [setCSV, setError, setLoading],
  );

  const clearData = useCallback(() => {
    clearCSV();
    setError(null);
    setLoading(false);
  }, [clearCSV, setError, setLoading]);

  return {
    csv,
    isLoading,
    error,
    uploadFile,
    clearData,
  };
}
