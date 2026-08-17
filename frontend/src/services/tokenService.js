// ============================================
// Token Management Service
// Version: V2608172
// Purpose: JWT token storage, retrieval, and management
// ============================================

const TOKEN_KEY = 'app_token';
const USER_KEY = 'app_user';

export const tokenService = {
  // Save token and user info to localStorage
  setToken(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  // Retrieve token from localStorage
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  // Retrieve user info from localStorage
  getUser() {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  // Check if token exists
  hasToken() {
    return !!localStorage.getItem(TOKEN_KEY);
  },

  // Clear token and user (logout)
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  // Decode token to check expiration (without verification)
  // Note: This checks client-side only, server always validates
  isTokenValid() {
    const token = this.getToken();
    if (!token) return false;

    try {
      // JWT format: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      // Decode payload (base64 decode)
      const decoded = JSON.parse(atob(parts[1]));
      const now = Math.floor(Date.now() / 1000);

      // Check if token is expired
      return decoded.exp && decoded.exp > now;
    } catch (error) {
      return false;
    }
  },

  // Get Authorization header value
  getAuthHeader() {
    const token = this.getToken();
    return token ? `Bearer ${token}` : null;
  }
};

export default tokenService;
