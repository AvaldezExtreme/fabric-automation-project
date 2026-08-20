// ============================================
// API Service
// Version: V2608172
// Purpose: Centralized API communication with JWT token handling
// ============================================

import axios from 'axios';
import tokenService from './tokenService.js';

// Always use relative paths: production serves frontend+API from the same
// origin, and the Vite dev server proxies /api to the backend (vite.config.js).
const API_BASE_URL = '';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - Add token to all requests
apiClient.interceptors.request.use(
  (config) => {
    const token = tokenService.getToken();
    if (token && config.url !== '/api/auth/login') {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle token expiration
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      tokenService.clearToken();
      // Trigger logout in the app (handled by App.jsx)
      window.dispatchEvent(new CustomEvent('token-expired'));
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  // ===== AUTHENTICATION =====
  login(username, password) {
    return apiClient.post('/api/auth/login', { username, password });
  },

  logout() {
    return apiClient.post('/api/auth/logout');
  },

  verifyToken() {
    return apiClient.post('/api/auth/verify');
  },

  getCurrentUser() {
    return apiClient.get('/api/auth/me');
  },

  // ===== FILE UPLOAD =====
  uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/api/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // ===== CONFIG GENERATION =====
  generateConfigs(data) {
    return apiClient.post('/api/generate/configs', data);
  },

  generateCSV(data) {
    return apiClient.post('/api/generate/csv', data);
  },

  generateAll(data) {
    return apiClient.post('/api/generate/all', data);
  }
};

export default apiService;
