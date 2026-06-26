// src/hooks/useSocket.js
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

let socketInstance = null;

export function useSocket() {
  const { isAuthenticated, token, updateWallet, setUnread, unreadNotifications, user } = useAuthStore();
  const connected = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !token || connected.current) return;

    const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || '';

    socketInstance = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketInstance.on('connect', () => {
      connected.current = true;
      console.log('[Socket] Connected:', socketInstance.id);

      // Join department room if admin
      if (user?.dept) {
        socketInstance.emit('join:dept', user.dept);
      }
    });

    socketInstance.on('disconnect', (reason) => {
      connected.current = false;
      console.log('[Socket] Disconnected:', reason);
    });

    socketInstance.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    // Real-time notification
    socketInstance.on('notification', (data) => {
      setUnread(unreadNotifications + 1);

      // Show toast based on notification type
      const icons = {
        sanction: '🏆',
        vote_milestone: '🗳️',
        proposal_update: '📋',
        dbt_credit: '💰',
        system: '⚙️',
      };

      const icon = icons[data.type] || '🔔';
      toast.custom(
        (t) => (
          <div
            className={`flex items-start gap-3 bg-white border border-navy/10 rounded-2xl
                        shadow-elevated px-4 py-3 max-w-sm cursor-pointer
                        ${t.visible ? 'animate-slide-in' : 'opacity-0'}`}
            onClick={() => toast.dismiss(t.id)}
          >
            <span className="text-2xl flex-shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-navy text-sm">{data.title}</div>
              <div className="text-gray-500 text-xs mt-0.5 leading-relaxed">{data.body}</div>
            </div>
          </div>
        ),
        { duration: 6000 }
      );
    });

    // Wallet update (when sanction happens)
    socketInstance.on('wallet:update', (data) => {
      updateWallet(data.new_balance);
      toast.custom(
        (t) => (
          <div
            className={`flex items-center gap-3 bg-navy text-white rounded-2xl
                        shadow-elevated px-5 py-3 max-w-sm cursor-pointer
                        ${t.visible ? 'animate-pop-in' : 'opacity-0'}`}
            onClick={() => toast.dismiss(t.id)}
          >
            <span className="text-3xl">👑</span>
            <div>
              <div className="font-bold text-gold text-base">+₹{data.amount?.toLocaleString('en-IN')}</div>
              <div className="text-white/70 text-xs">Civic Royalty credited via DBT</div>
            </div>
          </div>
        ),
        { duration: 8000 }
      );
    });

    // Proposal threshold reached (for admins watching)
    socketInstance.on('proposal:threshold', (data) => {
      if (['admin', 'superadmin'].includes(user?.role)) {
        toast(`📋 New proposal ready for review: "${data.title}"`, {
          icon: '📋',
          duration: 5000,
        });
      }
    });

    // Vote count updates (live feed)
    socketInstance.on('proposal:vote_update', (data) => {
      // Components can listen for this via a store event
      useAuthStore.getState()._lastVoteUpdate = data;
    });

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
        connected.current = false;
      }
    };
  }, [isAuthenticated, token]);

  return socketInstance;
}

// Export for direct use in components
export function getSocket() {
  return socketInstance;
}
