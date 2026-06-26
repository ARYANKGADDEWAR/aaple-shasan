// src/utils/api.js
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach access token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401 and token refresh
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (error.response?.data?.code === 'TOKEN_EXPIRED') {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const res = await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
          const newToken = res.data.data.accessToken;
          localStorage.setItem('accessToken', newToken);
          api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          localStorage.removeItem('accessToken');
          window.location.href = '/login?session=expired';
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────
export const authAPI = {
  requestRegisterOTP: (data) => api.post('/auth/register/otp', data),
  verifyRegisterOTP: (data) => api.post('/auth/register/verify', data),
  requestLoginOTP: (data) => api.post('/auth/login/otp', data),
  verifyLoginOTP: (data) => api.post('/auth/login/verify', data),
  firebaseLogin: (data) => api.post('/auth/firebase-login', data),
  firebaseRegister: (data) => api.post('/auth/firebase-register', data),
  loginWithPassword: (data) => api.post('/auth/login/password', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  refreshToken: () => api.post('/auth/refresh'),
  verifyAadhaar: (data) => api.post('/auth/aadhaar/verify', data),
  changePassword: (data) => api.post('/auth/password/change', data),
  updateProfile: (data) => api.patch('/auth/profile', data),
};

// ── Proposals ──────────────────────────────────────────────────────────
export const proposalsAPI = {
  getAll: (params) => api.get('/proposals', { params }),
  getOne: (id) => api.get(`/proposals/${id}`),
  submit: (data) => api.post('/proposals', data),
  vote: (id, data) => api.post(`/proposals/${id}/vote`, data),
  getMine: (params) => api.get('/proposals/my', { params }),
  getStats: () => api.get('/proposals/stats'),
  // Admin
  getAdminList: (params) => api.get('/proposals/admin/list', { params }),
  sanction: (id, data) => api.post(`/proposals/${id}/sanction`, data),
  requestRevision: (id, data) => api.post(`/proposals/${id}/revise`, data),
  reject: (id, data) => api.post(`/proposals/${id}/reject`, data),
  getDossier: (id) => api.get(`/proposals/${id}/dossier`),
};

// ── Notifications ──────────────────────────────────────────────────────────
export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

// ── Wallet ──────────────────────────────────────────────────────────
export const walletAPI = {
  get: () => api.get('/wallet'),
};

// ── Admin ──────────────────────────────────────────────────────────
export const adminAPI = {
  getUsers: (params) => api.get('/admin/users', { params }),
  toggleLock: (id) => api.patch(`/admin/users/${id}/toggle-lock`),
  createAdmin: (data) => api.post('/admin/users/admin', data),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
  getConfig: () => api.get('/admin/system/config'),
  updateConfig: (key, value) => api.patch(`/admin/system/config/${key}`, { value }),
};

export default api;
