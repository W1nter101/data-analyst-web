import axios from 'axios';

/**
 * Axios instance configured for the Express auth backend.
 *
 * CIRCULAR DEPENDENCY FIX: This module does NOT import authStore.
 * Instead, authStore registers callback functions via registerAuthCallbacks()
 * after it initializes. This breaks the circular chain:
 *   axios.ts → authStore.ts → authService.ts → axios.ts
 */
const api = axios.create({
  baseURL: '',
  withCredentials: true,
});

// ── Callback registry (set by authStore at module init) ─────────────

let _getAccessToken: (() => string | null) | null = null;
let _setAccessToken: ((token: string) => void) | null = null;
let _clearState: (() => void) | null = null;

/**
 * Called once by authStore.ts at module evaluation time.
 * Provides the axios interceptors with safe access to auth state
 * without importing authStore directly (which would be circular).
 */
export function registerAuthCallbacks(callbacks: {
  getAccessToken: () => string | null;
  setAccessToken: (token: string) => void;
  clearState: () => void;
}) {
  _getAccessToken = callbacks.getAccessToken;
  _setAccessToken = callbacks.setAccessToken;
  _clearState = callbacks.clearState;
}

// ── Request interceptor ─────────────────────────────────────────────

/**
 * Attach the in-memory access token to every outgoing request.
 * Reads from the registered callback — no circular import needed.
 */
api.interceptors.request.use((config) => {
  const token = _getAccessToken?.();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor ────────────────────────────────────────────

/**
 * Auto-refresh on 403.
 *
 * When the access token expires mid-session, the Express backend returns 403.
 * This interceptor:
 *   1. Calls /api/auth/refresh to get a new token (via httpOnly cookie)
 *   2. Updates the auth store via callback
 *   3. Retries the original request with the new token
 *
 * It does NOT call fetchMe() — that's AuthGuard's responsibility.
 * Auth endpoints are excluded from retry logic.
 */
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    // Don't retry auth endpoints — they should fail naturally
    if (
      originalRequest.url.includes('/auth/signin') ||
      originalRequest.url.includes('/auth/signup') ||
      originalRequest.url.includes('/auth/refresh')
    ) {
      return Promise.reject(error);
    }

    originalRequest._retryCount = originalRequest._retryCount || 0;

    if (error.response?.status === 403 && originalRequest._retryCount < 4) {
      originalRequest._retryCount += 1;

      try {
        const res = await api.post('/api/auth/refresh', undefined, {
          withCredentials: true,
        });
        const newAccessToken = res.data.accessToken;

        // Update store via callback (no circular import)
        _setAccessToken?.(newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        _clearState?.();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
