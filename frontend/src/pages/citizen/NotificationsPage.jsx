import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { notificationsAPI } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const { decrementUnread, setUnread } = useAuthStore();

  useEffect(() => {
    (async () => {
      try { const r = await notificationsAPI.getAll({ limit: 50 }); setNotifications(r.data.data.notifications); } catch {}
      setLoading(false);
    })();
  }, []);

  const markAll = async () => {
    await notificationsAPI.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
    toast.success('All notifications marked as read.');
  };

  const typeColors = { sanction:'🏆', vote_milestone:'🗳️', proposal_update:'📋', system:'⚙️', dbt_credit:'💰' };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-navy">Notifications</h1>
          <p className="text-gray-500 text-sm mt-1">Updates on your proposals, votes, and wallet activity.</p>
        </div>
        <button onClick={markAll} className="btn-outline text-xs px-4 py-2"><Check size={13}/> Mark All Read</button>
      </div>
      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i=><div key={i} className="skeleton h-16 rounded-2xl"/>)}</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16"><Bell size={32} className="mx-auto mb-3 text-gray-200"/><p className="text-gray-400 text-sm">No notifications yet</p></div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <motion.div key={n.id} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}}
              className={`flex items-start gap-4 p-4 rounded-2xl border transition-all
                ${n.read ? 'bg-white border-gray-100' : 'bg-gold/4 border-gold/20'}`}>
              <div className="text-2xl flex-shrink-0">{typeColors[n.type] || '🔔'}</div>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-sm ${n.read ? 'text-gray-700' : 'text-navy'}`}>{n.title}</div>
                <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</div>
                <div className="text-[10px] text-gray-400 mt-1">{formatDistanceToNow(new Date(n.created_at),{addSuffix:true})}</div>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-gold mt-1.5 flex-shrink-0"/>}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
