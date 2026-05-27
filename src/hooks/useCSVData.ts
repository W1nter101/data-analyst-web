import { useCallback } from 'react';

import { parseCSVFile } from '@/lib/csv/parser';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';

export function useCSVData() {
  const csv = useAppStore((s) => s.csv);
  const isLoading = useAppStore((s) => s.isLoading);
  const error = useAppStore((s) => s.error);
  const {
    setCSV,
    setLoading,
    setError,
    clearCSV,
    setCurrentFileId,
    setCurrentConversationId,
    setFileList,
  } = useAppStore();
  const accessToken = useAuthStore((s) => s.accessToken);

  const refreshFileList = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/files', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.files) {
        setFileList(data.files);
      }
    } catch (e) {
      console.error('Failed to refresh file list', e);
    }
  }, [accessToken, setFileList]);

  const uploadFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const csvText = await file.text();
        
        // 1. Parse locally first to get schema
        const parsed = await parseCSVFile(file);
        
        // 2. Upload to server for SQLite
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ 
            csvText, 
            fileName: file.name,
            schema: JSON.stringify(parsed.schema)
          }),
        });
        if (!res.ok) {
          throw new Error('Failed to upload CSV to server');
        }

        const uploadResponse = await res.json();
        const { fileId } = uploadResponse;

        // 3. Update store
        setCurrentFileId(fileId);

        // 4. Create conversation
        if (accessToken) {
          const convRes = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ fileId }),
          });
          if (convRes.ok) {
            const { conversationId } = await convRes.json();
            setCurrentConversationId(conversationId);
          }
        }

        // 5. Refresh file list
        await refreshFileList();

        // 6. Store parsed data in client (Zustand)
        setCSV(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse CSV');
      } finally {
        setLoading(false);
      }
    },
    [setCSV, setError, setLoading, setCurrentFileId, setCurrentConversationId, accessToken, refreshFileList],
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
