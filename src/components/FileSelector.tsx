'use client';
import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';

export function FileSelector() {
  const { fileList, currentFileId, setCurrentFileId, setCurrentConversationId, setFileList } = useAppStore();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;
    fetch('/api/files', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(({ files }) => setFileList(files ?? []));
  }, [accessToken, setFileList]);

  const handleSelectFile = async (fileId: string) => {
    setCurrentFileId(fileId);
    
    // Fetch schema and details for the selected file
    const fileRes = await fetch(`/api/files/${fileId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const fileData = await fileRes.json();
    if (fileData.success) {
      useAppStore.getState().setCSV({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        headers: fileData.file.schema.map((s: any) => s.name),
        rowCount: fileData.file.row_count,
        schema: fileData.file.schema,
        rows: [] // Let data table fetch rows
      });
    }

    // Tạo conversation mới cho file được chọn
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ fileId }),
    });
    const { conversationId } = await res.json();
    setCurrentConversationId(conversationId);
  };

  const handleDelete = async (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    setFileList(fileList.filter(f => f.id !== fileId));
    if (currentFileId === fileId) setCurrentFileId(null);
  };

  if (fileList.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0">
      <p className="text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">
        Files đã tải lên
      </p>
      <ul className="flex flex-col gap-1.5">
        {fileList.map(file => (
          <li
            key={file.id}
            className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
              file.id === currentFileId 
                ? 'bg-[var(--color-accent)] text-[var(--color-text)] font-medium' 
                : 'hover:bg-foreground/5 text-foreground/80'
            }`}
            onClick={() => handleSelectFile(file.id)}
          >
            <div className="flex flex-col min-w-0">
              <span className="truncate">{file.original_name}</span>
              <span className={`text-[10px] ${file.id === currentFileId ? 'text-[var(--color-text)]/70' : 'text-foreground/40'}`}>
                {file.row_count.toLocaleString()} rows
              </span>
            </div>
            <button
              className={`p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all ${
                file.id === currentFileId
                  ? 'hover:bg-black/10 text-[var(--color-text)]'
                  : 'hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] text-foreground/50'
              }`}
              onClick={(e) => handleDelete(file.id, e)}
              aria-label="Xóa file"
              title="Xóa file"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
