'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';

export function ConversationSidebar({ onSelectChat }: { onSelectChat?: () => void }) {
  const {
    conversationList,
    currentConversationId,
    currentFileId,
    setConversationList,
    setCurrentConversationId,
  } = useAppStore();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Fetch conversations on mount ──────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/conversations', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setConversationList(data.conversations ?? []);
    } catch {
      /* ignore */
    }
  }, [accessToken, setConversationList]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // ── Close menu on outside click ───────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Select conversation ───────────────────────────────────────
  const handleSelect = (convId: string) => {
    if (convId !== currentConversationId) {
      setCurrentConversationId(convId);
    }
    onSelectChat?.();
  };

  // ── Create new conversation ───────────────────────────────────
  const handleNewChat = async () => {
    if (!accessToken || !currentFileId) return;
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ fileId: currentFileId }),
      });
      if (!res.ok) return;
      const { conversationId } = await res.json();
      setCurrentConversationId(conversationId);
      await fetchConversations();
      onSelectChat?.();
    } catch {
      /* ignore */
    }
  };

  // ── Delete conversation ───────────────────────────────────────
  const handleDelete = async (convId: string) => {
    if (!accessToken) return;
    try {
      await fetch(`/api/conversations/${convId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setConversationList(conversationList.filter((c) => c.id !== convId));
      if (currentConversationId === convId) {
        setCurrentConversationId(null);
      }
    } catch {
      /* ignore */
    }
    setMenuOpenId(null);
    setConfirmDeleteId(null);
  };

  // ── Relative time helper ──────────────────────────────────────
  const relativeTime = (ts: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - ts;
    if (diff < 60) return 'vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 172800) return 'hôm qua';
    return `${Math.floor(diff / 86400)} ngày trước`;
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">

      {/* ── Conversation list ──────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {conversationList.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center">
            <svg
              className="size-8 text-[var(--color-text-faint)]"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
              />
            </svg>
            <p className="text-xs text-[var(--color-text-faint)]">
              Chưa có lịch sử chat nào
            </p>
          </div>
        ) : (
          conversationList.map((conv) => {
            const isActive = conv.id === currentConversationId;
            return (
              <div
                key={conv.id}
                className={`group relative mx-2 my-0.5 cursor-pointer rounded-lg px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
                    : 'border-l-2 border-transparent hover:bg-[var(--color-surface-2)]'
                }`}
                onClick={() => handleSelect(conv.id)}
              >
                <div className="flex flex-col min-w-0 pr-6">
                  <span className="truncate text-sm text-[var(--color-text)]">
                    {conv.title || conv.file_name || 'Chat'}
                  </span>
                  <span className="mt-0.5 text-xs text-[var(--color-text-faint)]">
                    {conv.message_count} tin nhắn · {relativeTime(conv.updated_at)}
                  </span>
                </div>

                {/* ── 3-dot menu button ──────────────────── */}
                <button
                  type="button"
                  className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition-all ${
                    menuOpenId === conv.id
                      ? 'opacity-100 bg-[var(--color-surface-2)]'
                      : 'opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-2)]'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
                    setConfirmDeleteId(null);
                  }}
                  aria-label="Thêm tùy chọn"
                >
                  <svg
                    className="size-4 text-[var(--color-text-faint)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                    />
                  </svg>
                </button>

                {/* ── Dropdown menu ──────────────────────── */}
                {menuOpenId === conv.id && (
                  <div
                    ref={menuRef}
                    className="absolute right-0 top-8 z-50 min-w-[120px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {confirmDeleteId === conv.id ? (
                      <div className="px-3 py-2">
                        <p className="mb-2 text-xs text-[var(--color-text-muted)]">
                          Xóa đoạn chat này?
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                            onClick={() => {
                              setConfirmDeleteId(null);
                              setMenuOpenId(null);
                            }}
                          >
                            Huỷ
                          </button>
                          <button
                            type="button"
                            className="rounded bg-[var(--color-error)] px-2 py-1 text-xs text-white hover:opacity-90"
                            onClick={() => handleDelete(conv.id)}
                          >
                            Xóa
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="w-full cursor-pointer px-3 py-1.5 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-error)]/10"
                        onClick={() => setConfirmDeleteId(conv.id)}
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── New chat button ────────────────────────────── */}
      <div className="shrink-0 p-2">
        <button
          type="button"
          onClick={handleNewChat}
          disabled={!currentFileId}
          className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Chat mới
        </button>
      </div>
    </div>
  );
}
