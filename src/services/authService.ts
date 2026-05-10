import api from '@/lib/axios';

/**
 * Auth service — all HTTP calls to the Express backend auth endpoints.
 *
 * These map directly to the Express routes in final/backend/src/routes/authRoute.js:
 *   POST /api/auth/signup
 *   POST /api/auth/signin
 *   POST /api/auth/signout
 *   POST /api/auth/refresh
 *   GET  /api/users/me
 */
export const authService = {
  /**
   * Register a new user.
   * Returns 204 No Content on success.
   */
  signUp: async (
    username: string,
    password: string,
    email: string,
    firstName: string,
    lastName: string,
  ) => {
    const res = await api.post(
      '/api/auth/signup',
      { username, password, email, firstName, lastName },
      { withCredentials: true },
    );
    return res.data;
  },

  /**
   * Sign in with username + password.
   * Returns { message, accessToken }. Also sets httpOnly refreshToken cookie.
   */
  signIn: async (username: string, password: string) => {
    const res = await api.post(
      '/api/auth/signin',
      { username, password },
      { withCredentials: true },
    );
    return res.data; // { message, accessToken }
  },

  /**
   * Sign out — clears refresh token on server and removes cookie.
   */
  signOut: async () => {
    return api.post('/api/auth/signout', undefined, {
      withCredentials: true,
    });
  },

  /**
   * Fetch the current authenticated user profile.
   * Requires valid access token in Authorization header.
   */
  fetchMe: async () => {
    const res = await api.get('/api/users/me', { withCredentials: true });
    return res.data.user;
  },

  /**
   * Refresh the access token using the httpOnly refreshToken cookie.
   * Returns { accessToken }.
   */
  refresh: async () => {
    const res = await api.post('/api/auth/refresh', undefined, {
      withCredentials: true,
    });
    return res.data.accessToken;
  },
};
