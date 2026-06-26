// src/pages/citizen/CitizenDashboard.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, Vote, Trophy, TrendingUp, CheckCircle, Clock, FileText, Crown, ChevronRight, Zap } from 'lucide-react';
import { proposalsAPI } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { formatDistanceToNow } from 'date-fns';

const cardAnim = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

const statusConfig = {
  ai_routed: { label: 'AI Routed', color: 'bg-blue-100 text-blue-800', icon: '🤖' },
  dossier_compiled: { label: 'Dossier Ready', color: 'bg-amber-100 text-amber-800', icon: '📋' },
  under_admin_review: { label: 'Under Review', color: 'bg-purple-100 text-purple-800', icon: '👁️' },
  sanctioned: { label: 'Sanctioned', color: 'bg-green-100 text-green-800', icon: '✅' },
  revision_requested: { label: 'Needs Revision', color: 'bg-orange-100 text-orange-800', icon: '✏️' },
  rejected: { label: 'Not Approved', color: 'bg-red-100 text-red-800', icon: '❌' },
  pending_review: { label: 'Pending', color: 'bg-gray-100 text-gray-600', icon: '⏳' },
};

export default function CitizenDashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [myProposals, setMyProposals] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [statsRes, myRes, feedRes] = await Promise.all([
          proposalsAPI.getStats(),
          proposalsAPI.getMine({ limit: 5 }),
          proposalsAPI.getAll({ limit: 4, sort: 'popular' }),
        ]);
        setStats(statsRes.data.data);
        setMyProposals(myRes.data.data.proposals);
        setFeed(feedRes.data.data.proposals);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const walletBalance = user?.civic_royalty_balance || 0;

  const getStatusCount = (s) => stats?.my_proposals_by_status?.find(r => r.status === s)?.count || 0;

  if (loading) return (
    <div className="space-y-5">
      {[1,2,3].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
    </div>
  );

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={cardAnim} className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-navy">
            Welcome, {user?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">Here's your civic engagement summary for today.</p>
        </div>
        <Link to="/citizen/submit" className="btn-primary">
          <Zap size={16} /> Submit New Proposal
        </Link>
      </motion.div>

      {/* Wallet hero card */}
      <motion.div variants={cardAnim}>
        <div className="bg-hero-gradient rounded-3xl p-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, #FFD700 0%, transparent 60%)' }} />
          <div className="relative flex items-center justify-between flex-wrap gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Crown size={16} className="text-gold" />
                <span className="text-gold text-xs font-bold uppercase tracking-widest">Civic Royalty Wallet</span>
              </div>
              <div className="font-display text-5xl font-bold text-gold mb-1">
                ₹{walletBalance.toLocaleString('en-IN')}
              </div>
              <div className="text-white/50 text-xs">
                Total earned: ₹{(user?.total_royalties_earned || 0).toLocaleString('en-IN')} · DBT Linked
              </div>
              {!user?.aadhaar_verified && (
                <Link to="/citizen/profile" className="mt-3 inline-flex items-center gap-1 bg-gold/20 border border-gold/40 text-gold text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-gold/30 transition-colors">
                  ⚡ Verify Aadhaar to unlock rewards
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Proposals', value: myProposals.length, icon: '📝' },
                { label: 'Sanctioned', value: getStatusCount('sanctioned'), icon: '✅' },
                { label: 'Votes Cast', value: stats?.total_votes_cast || 0, icon: '🗳️' },
                { label: 'Royalties', value: `₹${walletBalance.toLocaleString('en-IN')}`, icon: '👑' },
              ].map((s) => (
                <div key={s.label} className="bg-white/10 rounded-xl p-3 text-center">
                  <div className="text-xl mb-1">{s.icon}</div>
                  <div className="font-display text-lg font-bold">{s.value}</div>
                  <div className="text-white/50 text-[10px] uppercase tracking-wide">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quick actions */}
      <motion.div variants={cardAnim}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { to: '/citizen/submit', icon: Send, label: 'Submit Proposal', sub: 'AI-powered routing', color: 'from-navy to-navy-light', text: 'text-white' },
            { to: '/citizen/feed', icon: Vote, label: 'Community Feed', sub: 'Vote on proposals', color: 'from-amber-400 to-amber-500', text: 'text-amber-900' },
            { to: '/citizen/my-proposals', icon: FileText, label: 'My Proposals', sub: `${myProposals.length} active`, color: 'from-emerald-400 to-emerald-500', text: 'text-white' },
            { to: '/citizen/wallet', icon: Trophy, label: 'Royalties', sub: `₹${walletBalance}`, color: 'from-purple-500 to-purple-600', text: 'text-white' },
          ].map((a) => (
            <Link key={a.to} to={a.to}
              className={`bg-gradient-to-br ${a.color} ${a.text} rounded-2xl p-4 hover:scale-105 transition-transform shadow-card`}>
              <a.icon size={22} className="mb-3 opacity-90" />
              <div className="font-bold text-sm">{a.label}</div>
              <div className="text-[11px] opacity-70 mt-0.5">{a.sub}</div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* My Recent Proposals */}
      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div variants={cardAnim} className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-navy text-sm uppercase tracking-wide">My Proposals</h2>
            <Link to="/citizen/my-proposals" className="text-xs text-navy/50 hover:text-navy flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="space-y-3">
            {myProposals.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm mb-3">No proposals yet.</p>
                <Link to="/citizen/submit" className="btn-primary text-xs px-4 py-2">Submit your first proposal</Link>
              </div>
            ) : myProposals.map((p) => {
              const s = statusConfig[p.status] || statusConfig.pending_review;
              return (
                <Link key={p.id} to={`/citizen/proposals/${p.id}`}
                  className="flex items-start gap-3 p-3 rounded-xl border border-navy/6 hover:border-navy/15 hover:bg-gray-50/50 transition-all group">
                  <span className="text-xl mt-0.5">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-navy text-sm truncate">{p.title}</div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                      <span className="text-[10px] text-gray-400">↑{p.upvote_count} · ↓{p.downvote_count}</span>
                      <span className="text-[10px] text-gray-400">{formatDistanceToNow(new Date(p.submitted_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-navy mt-1 flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </motion.div>

        {/* Trending in community */}
        <motion.div variants={cardAnim} className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-navy text-sm uppercase tracking-wide">🔥 Trending in Community</h2>
            <Link to="/citizen/feed" className="text-xs text-navy/50 hover:text-navy flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="space-y-3">
            {feed.map((p) => (
              <Link key={p.id} to={`/citizen/feed`}
                className="flex items-start gap-3 p-3 rounded-xl border border-navy/6 hover:border-navy/15 hover:bg-gray-50/50 transition-all group">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-navy/5 flex items-center justify-center">
                  <TrendingUp size={16} className="text-navy/40" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-navy text-sm truncate">{p.title}</div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-emerald-600 font-semibold">↑{p.upvote_count} upvotes</span>
                    <span className="text-[10px] text-gray-400">{p.assigned_dept}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${p.threshold_met ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {p.threshold_met ? '✓ Threshold Met' : `${p.upvote_count}/50 votes`}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Aadhaar prompt */}
      {!user?.aadhaar_verified && (
        <motion.div variants={cardAnim}>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0 text-2xl">🪪</div>
            <div className="flex-1">
              <div className="font-bold text-amber-900 text-sm">Verify your Aadhaar to unlock all features</div>
              <div className="text-amber-700/70 text-xs mt-1">Aadhaar verification enables proposal submission, voting, and Civic Royalty disbursement via DBT.</div>
            </div>
            <Link to="/citizen/profile" className="btn-gold text-xs px-4 py-2 flex-shrink-0">Verify Now</Link>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
