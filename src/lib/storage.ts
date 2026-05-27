import fs from 'fs';
import path from 'path';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');

export const storage = {
  /**
   * Lưu buffer SQLite vào disk tại storage/{userId}/{fileId}.sqlite
   * Trả về absolute path của file đã lưu.
   */
  save(userId: string, fileId: string, buffer: Buffer): string {
    const dir = path.join(STORAGE_ROOT, userId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${fileId}.sqlite`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  },

  /** Trả về absolute path của file SQLite của user. */
  getPath(userId: string, fileId: string): string {
    return path.join(STORAGE_ROOT, userId, `${fileId}.sqlite`);
  },

  /** Kiểm tra file có tồn tại không. */
  exists(userId: string, fileId: string): boolean {
    return fs.existsSync(this.getPath(userId, fileId));
  },

  /** Xóa file SQLite của user. */
  delete(userId: string, fileId: string): void {
    const filePath = this.getPath(userId, fileId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  },
};
