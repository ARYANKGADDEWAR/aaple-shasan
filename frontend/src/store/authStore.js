// src/store/authStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '../utils/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      unreadNotifications: 0,

      setToken: (token) => {
        localStorage.setItem('accessToken', token);
        set({ token });
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      login: (token, user) => {
        localStorage.setItem('accessToken', token);
        set({ token, user, isAuthenticated: true });
      },

      logout: async () => {
        try { await authAPI.logout(); } catch {}
        localStorage.removeItem('accessToken');
        set({ user: null, token: null, isAuthenticated: false });
      },

      refreshUser: async () => {
        try {
          const res = await authAPI.getMe();
          const { user, unread_notifications } = res.data.data;
          set({ user, isAuthenticated: true, unreadNotifications: unread_notifications });
          return user;
        } catch {
          get().logout();
          return null;
        }
      },

      updateWallet: (newBalance) => {
        set((state) => ({
          user: state.user ? { ...state.user, civic_royalty_balance: newBalance } : state.user,
        }));
      },

      setUnread: (count) => set({ unreadNotifications: count }),
      decrementUnread: () => set((s) => ({ unreadNotifications: Math.max(0, s.unreadNotifications - 1) })),

      isAdmin: () => ['admin', 'superadmin'].includes(get().user?.role),
      isSuperAdmin: () => get().user?.role === 'superadmin',
      isCitizen: () => get().user?.role === 'citizen',
    }),
    {
      name: 'aaple-shasan-auth',
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);
