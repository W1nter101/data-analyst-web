import { create } from 'zustand';
import { toast } from 'sonner';

import { authService } from '@/services/authService';
import { registerAuthCallbacks } from '@/lib/axios';
import type { AuthState } from '@/types';

/**
 * Auth Zustand store — manages authentication state globally.
 *
 * Key design decisions:
 * - Access token is stored in-memory only (Zustand), NOT in localStorage.
 * - Refresh token is in an httpOnly cookie (set by Express).
 * - On page refresh, the access token is lost. AuthGuard calls refresh()
 *   then fetchMe() sequentially to restore the session.
 * - refresh() does NOT call fetchMe() internally — AuthGuard controls
 *   the sequencing to avoid race conditions.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  loading: false,

  setAccessToken: (accessToken) => {
    set({ accessToken });
  },

  clearState: () => {
    set({ accessToken: null, user: null, loading: false });
  },

  signUp: async (username, password, email, firstName, lastName) => {
    try {
      set({ loading: true });
      await authService.signUp(username, password, email, firstName, lastName);
      toast.success('Đăng ký thành công, chuyển hướng sang trang đăng nhập.');
    } catch (error) {
      console.error(error);
      toast.error('Đăng ký không thành công');
    } finally {
      set({ loading: false });
    }
  },

  signIn: async (username, password) => {
    try {
      set({ loading: true });

      const { accessToken } = await authService.signIn(username, password);
      get().setAccessToken(accessToken);

      // fetchMe is called here because signIn is always user-initiated
      // (not on page refresh), so there's no race condition.
      await get().fetchMe();

      toast.success('Chào mừng bạn');
    } catch (error) {
      console.error(error);
      toast.error('Đăng nhập không thành công');
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      get().clearState();
      await authService.signOut();
    } catch (error) {
      console.error(error);
      toast.error('Lỗi xảy ra khi logout, hãy đăng nhập lại');
    }
  },

  fetchMe: async () => {
    try {
      set({ loading: true });
      const user = await authService.fetchMe();
      set({ user });
    } catch (error) {
      console.error(error);
      // Don't clear accessToken here — let the caller decide what to do.
      // If the token is invalid, the 403 interceptor will handle refresh.
      set({ user: null });
      toast.error('Lỗi xảy ra khi lấy thông tin user');
    } finally {
      set({ loading: false });
    }
  },

  /**
   * Restore session from httpOnly refresh token cookie.
   *
   * IMPORTANT: This method does NOT call fetchMe(). The caller
   * (AuthGuard) must call fetchMe() separately after refresh()
   * succeeds. This prevents race conditions where fetchMe() fires
   * before the access token is available in the store.
   */
  refresh: async () => {
    try {
      set({ loading: true });
      const accessToken = await authService.refresh();
      get().setAccessToken(accessToken);
    } catch (error) {
      console.error(error);
      get().clearState();
    } finally {
      set({ loading: false });
    }
  },
}));

// ── Register auth callbacks with axios interceptors ─────────────────
// This runs once at module evaluation time, breaking the circular
// dependency chain (axios ← authStore → authService → axios).
registerAuthCallbacks({
  getAccessToken: () => useAuthStore.getState().accessToken,
  setAccessToken: (token) => useAuthStore.getState().setAccessToken(token),
  clearState: () => useAuthStore.getState().clearState(),
});
