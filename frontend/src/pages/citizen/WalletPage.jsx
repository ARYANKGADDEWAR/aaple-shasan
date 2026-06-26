import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Crown, CheckCircle, Clock, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { walletAPI } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';

export default function WalletPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const r = await walletAPI.get(); setData(r.data.data); } catch {}
      setLoading(false);
    })();
  }, []);

  const balance = user?.civic_royalty_balance || 0;
  const total = user?.total_royalties_earned || 0;

  const statusIcon = { pending:'⏳', processing:'🔄', credited:'✅', failed:'❌', refunded:'↩️' };
  const statusColor = { pending:'bg-amber-100 text-amber-800', processing:'bg-blue-100 text-blue-800', credited:'bg-green-100 text-green-800', failed:'bg-red-100 text-red-800', refunded:'bg-gray-100 text-gray-600' };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-navy">Civic Royalty Wallet</h1>
        <p className="text-gray-500 text-sm mt-1">Rewards earned from sanctioned civic proposals via Direct Benefit Transfer.</p>
      </div>

      {/* Balance card */}
      <div className="bg-hero-gradient rounded-3xl p-8 text-white text-center">
        <Crown size={32} className="text-gold mx-auto mb-3" />
        <div className="font-display text-5xl font-bold text-gold mb-1">₹{balance.toLocaleString('en-IN')}</div>
        <div className="text-white/50 text-sm">Available Balance</div>
        <div className="mt-4 flex justify-center gap-8">
          <div className="text-center">
            <div className="font-display text-xl font-bold">₹{total.toLocaleString('en-IN')}</div>
            <div className="text-white/40 text-xs">Total Earned</div>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <div className="font-display text-xl font-bold">{data?.transactions?.filter(t=>t.status==='credited').length || 0}</div>
            <div className="text-white/40 text-xs">Transactions</div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 bg-white/10 rounded-xl px-4 py-2 inline-flex mx-auto">
          <CheckCircle size={14} className="text-emerald-400" />
          <span className="text-xs text-white/70">Aadhaar-linked · DBT Gateway · PFMS</span>
        </div>
      </div>

      {/* Transactions */}
      <div className="card">
        <h2 className="font-bold text-navy text-sm uppercase tracking-wide mb-4">Transaction History</h2>
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="skeleton h-14 rounded-xl"/>)}</div>
        ) : !data?.transactions?.length ? (
          <div className="text-center py-10 text-gray-400">
            <Crown size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No transactions yet. Get your proposals sanctioned to earn Civic Royalties!</p>
          </div>
        ) : data.transactions.map(t => (
          <motion.div key={t.id} initial={{opacity:0}} animate={{opacity:1}}
            className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-xl flex-shrink-0">
              {statusIcon[t.status] || '💰'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-navy text-sm">Civic Royalty Disbursement</div>
              <div className="text-xs text-gray-400 font-mono mt-0.5">{t.transaction_ref}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {t.credited_at ? format(new Date(t.credited_at),'dd MMM yyyy, HH:mm') : format(new Date(t.initiated_at),'dd MMM yyyy')}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-display text-lg font-bold text-emerald-600">+₹{Number(t.amount).toLocaleString('en-IN')}</div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor[t.status]||'bg-gray-100 text-gray-600'}`}>
                {t.status.charAt(0).toUpperCase()+t.status.slice(1)}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <h3 className="font-bold text-blue-900 text-sm mb-2">How Civic Royalties Work</h3>
        <div className="space-y-2 text-xs text-blue-700/80">
          <div className="flex items-start gap-2"><span>1.</span><span>Submit a civic proposal that reaches 50 upvotes from the community.</span></div>
          <div className="flex items-start gap-2"><span>2.</span><span>AI compiles an executive dossier and routes to the right government department.</span></div>
          <div className="flex items-start gap-2"><span>3.</span><span>When an officer sanctions your proposal, ₹1,000 is automatically credited via PFMS/DBT.</span></div>
          <div className="flex items-start gap-2"><span>4.</span><span>Funds are transferred directly to your Aadhaar-linked bank account within 24 hours.</span></div>
        </div>
      </div>
    </div>
  );
}
