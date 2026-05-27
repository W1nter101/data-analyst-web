import appDb from './appDb';
import { storage } from './storage';

export async function cleanupOldFiles(): Promise<{ deleted: number }> {
  if ((globalThis as unknown as { _cleanupRan: boolean })._cleanupRan) return { deleted: 0 };
  (globalThis as unknown as { _cleanupRan: boolean })._cleanupRan = true;

  const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
  const cutoff = Math.floor(Date.now() / 1000) - THIRTY_DAYS_SECONDS;

  const oldFiles = appDb.prepare(`
    SELECT id, user_id FROM uploaded_files WHERE created_at < ?
  `).all(cutoff) as Array<{ id: string; user_id: string }>;

  let deleted = 0;
  for (const file of oldFiles) {
    try {
      storage.delete(file.user_id, file.id);
      appDb.prepare('DELETE FROM uploaded_files WHERE id = ?').run(file.id);
      deleted++;
    } catch (e) {
      // Log but don't crash — file may already be gone
      console.warn(`[cleanup] failed to delete file ${file.id}:`, e);
    }
  }

  if (deleted > 0) {
    console.log(`[cleanup] deleted ${deleted} files older than 30 days`);
  }
  return { deleted };
}
