// src/components/shared/Layout.jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileText, Send, Vote, Trophy, Bell, Settings,
  LogOut, Menu, Shield, Crown, Users, BarChart3, ClipboardCheck,
} from 'lucide-react';
import { useSocket } from '../../hooks/useSocket.jsx';
import { useAuthStore } from '../../store/authStore';
import { notificationsAPI } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

// ── Top Bar ──────────────────────────────────────────────────────────
export function TopBar({ onMenuClick }) {
  const { user, logout, unreadNotifications } = useAuthStore();
  const navigate = useNavigate();
  const time = useClock();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const fetchNotifications = async () => {
    setNotifLoading(true);
    try {
      const res = await notificationsAPI.getAll({ limit: 8 });
      setNotifications(res.data.data.notifications);
    } catch {}
    setNotifLoading(false);
  };

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully.');
    navigate('/login');
  };

  const markRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      useAuthStore.getState().decrementUnread();
    } catch {}
  };

  // Close notif panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifOpen && !e.target.closest('[data-notif-panel]')) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  const typeIcon = { sanction: '🏆', vote_milestone: '🗳️', proposal_update: '📋', system: '⚙️', dbt_credit: '💰' };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-navy border-b-2 border-gold/60
                       flex items-center justify-between px-4 gap-3">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button className="lg:hidden text-white/70 hover:text-white transition-colors"
          onClick={onMenuClick} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center
                          text-sm font-black text-navy flex-shrink-0 group-hover:scale-105 transition-transform">
            🏛️
          </div>
          <div className="hidden sm:block">
            <div className="text-white font-bold text-sm leading-none">Aaple Shasan</div>
            <div className="text-gold/70 text-[10px] tracking-widest uppercase leading-none mt-0.5">
              Government of Maharashtra
            </div>
          </div>
        </Link>
        <div className="hidden md:block h-6 w-px bg-white/10" />
        <div className="hidden md:block text-white/40 text-xs font-mono">
          {time.toLocaleString('en-IN', {
            weekday: 'short', day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
          })}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* System status pill */}
        <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/25
                        rounded-full px-2.5 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-[10px] font-semibold">AI Online</span>
        </div>

        {/* Notifications */}
        <div className="relative" data-notif-panel>
          <button
            className="relative w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10
                       flex items-center justify-center text-white/80 transition-colors"
            onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) fetchNotifications(); }}
            aria-label="Notifications"
          >
            <Bell size={15} />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-gold rounded-full text-navy
                               text-[10px] font-black flex items-center justify-center">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-11 w-80 bg-white rounded-2xl shadow-elevated
                           border border-navy/8 overflow-hidden z-50"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <span className="font-bold text-navy text-sm">Notifications</span>
                  <button
                    className="text-xs text-navy/50 hover:text-navy transition-colors"
                    onClick={async () => {
                      await notificationsAPI.markAllRead();
                      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                      useAuthStore.getState().setUnread(0);
                    }}
                  >
                    Mark all read
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {notifLoading ? (
                    <div className="space-y-2 p-3">
                      {[1,2,3].map(i => <div key={i} className="skeleton h-12 rounded-xl" />)}
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <Bell size={24} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No notifications yet</p>
                    </div>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 border-b border-gray-50 cursor-pointer
                                  hover:bg-gray-50 transition-colors
                                  ${!n.read ? 'bg-gold/5' : ''}`}
                      onClick={() => markRead(n.id)}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-base flex-shrink-0 mt-0.5">
                          {typeIcon[n.type] || '🔔'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-xs text-navy truncate">{n.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">
                            {n.body}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </div>
                        </div>
                        {!n.read && (
                          <div className="w-1.5 h-1.5 rounded-full bg-gold mt-1 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <Link
                  to="/citizen/notifications"
                  className="block text-center py-2.5 text-xs text-navy/50 hover:text-navy
                             border-t border-gray-100 transition-colors"
                  onClick={() => setNotifOpen(false)}
                >
                  View all notifications →
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User chip */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/15 rounded-full
                     pl-1 pr-3 py-1 cursor-pointer transition-colors group"
          title="Click to logout"
        >
          <div className="w-6 h-6 rounded-full bg-gold-gradient flex items-center justify-center
                          text-xs font-black text-navy">
            {user?.full_name?.charAt(0) || '?'}
          </div>
          <span className="hidden sm:block text-white/80 text-xs font-medium max-w-24 truncate">
            {user?.full_name?.split(' ')[0]}
          </span>
          <LogOut size={11} className="text-white/40 group-hover:text-white/70 transition-colors" />
        </button>
      </div>
    </header>
  );
}

// ── Nav Item ──────────────────────────────────────────────────────────
function NavItem({ to, icon: Icon, label, active, badge, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-150 group
                  ${active
                    ? 'bg-gold/15 text-gold border border-gold/25'
                    : 'text-white/55 hover:text-white hover:bg-white/8'}`}
    >
      <Icon
        size={16}
        className={active ? 'text-gold' : 'text-white/40 group-hover:text-white/70'}
      />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-gold text-navy text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────
export function Sidebar({ open, onClose }) {
  const { user, unreadNotifications } = useAuthStore();
  const location = useLocation();
  const p = location.pathname;

  const isAdmin = ['admin', 'superadmin', 'auditor'].includes(user?.role);
  const isCitizen = user?.role === 'citizen';
  const walletBalance = user?.civic_royalty_balance || 0;

  const citizenNav = [
    { to: '/citizen', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/citizen/submit', icon: Send, label: 'Submit Proposal' },
    { to: '/citizen/feed', icon: Vote, label: 'Community Feed' },
    { to: '/citizen/my-proposals', icon: FileText, label: 'My Proposals' },
    { to: '/citizen/wallet', icon: Trophy, label: 'Civic Royalties' },
    { to: '/citizen/notifications', icon: Bell, label: 'Notifications', badge: unreadNotifications },
    { to: '/citizen/profile', icon: Settings, label: 'Profile & Settings' },
  ];

  const adminNav = [
    { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/proposals', icon: ClipboardCheck, label: 'Intake Desk' },
    { to: '/admin/users', icon: Users, label: 'User Management' },
    { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/admin/audit', icon: Shield, label: 'Audit Logs' },
    { to: '/admin/settings', icon: Settings, label: 'System Config' },
  ];

  const navItems = isAdmin ? adminNav : citizenNav;

  const isActive = (to) => {
    if (to === '/citizen' || to === '/admin') return p === to;
    return p.startsWith(to);
  };

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed top-14 left-0 bottom-0 w-60 bg-navy border-r border-gold/12
                    z-40 flex flex-col transition-transform duration-300 ease-out
                    ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* Profile block */}
        <div className="p-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold-gradient flex items-center justify-center
                            text-navy font-black text-base flex-shrink-0">
              {user?.full_name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-semibold truncate">{user?.full_name}</div>
              <div className="text-white/40 text-[10px] truncate">{user?.phone}</div>
            </div>
            {user?.aadhaar_verified && (
              <div title="Aadhaar Verified"
                   className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30
                              flex items-center justify-center flex-shrink-0">
                <Shield size={10} className="text-emerald-400" />
              </div>
            )}
          </div>

          {/* Role badge */}
          <div className="mt-3 flex items-center gap-1.5 bg-white/5 rounded-lg px-2.5 py-1.5">
            <div className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-gold' : 'bg-emerald-400'}`} />
            <span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold">
              {user?.role === 'superadmin'
                ? 'Super Admin'
                : user?.role === 'admin'
                ? `Admin · ${user?.dept || ''}`
                : user?.role === 'auditor'
                ? 'Auditor'
                : 'Citizen'}
            </span>
          </div>
        </div>

        {/* Civic wallet — citizen only */}
        {isCitizen && (
          <Link
            to="/citizen/wallet"
            className="mx-4 mt-4 bg-gold-gradient/10 border border-gold/25 rounded-xl p-3
                       hover:bg-gold/15 transition-colors group"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Crown size={12} className="text-gold" />
              <span className="text-[10px] text-gold/70 uppercase tracking-widest font-semibold">
                Civic Royalty
              </span>
            </div>
            <div className="font-display text-2xl font-bold text-gold">
              ₹{walletBalance.toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] text-white/30 mt-0.5">DBT Linked · Tap to view →</div>
          </Link>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="text-[10px] text-white/25 uppercase tracking-widest px-2 mb-2 font-semibold">
            {isAdmin ? 'Administration' : 'Citizen Services'}
          </div>
          {navItems.map(item => (
            <NavItem
              key={item.to}
              {...item}
              active={isActive(item.to)}
              onClick={onClose}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/8">
          <div className="text-[9px] text-white/15 text-center leading-relaxed">
            Aaple Shasan v1.0.0<br />
            Government of Maharashtra · AI Civic Initiative<br />
            All data encrypted · ISO 27001
          </div>
        </div>
      </aside>
    </>
  );
}

// ── App Layout — uses Outlet for nested routes ──────────────────────────────────────────────────────────
export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { refreshUser } = useAuthStore();

  // Connect WebSocket for real-time notifications
  useSocket();

  useEffect(() => {
    refreshUser();
  }, []);

  return (
    <div className="min-h-screen bg-civic-slate">
      <TopBar onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="lg:ml-60 pt-14 min-h-screen">
        <div className="p-5 md:p-7 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
