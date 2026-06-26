// src/pages/citizen/CommunityFeed.jsx
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown, Search, Filter, TrendingUp, Clock, CheckCircle, AlertTriangle, ChevronDown, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { proposalsAPI } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';

const DEPT_CONFIG = {
  PWD: { color: 'bg-navy/8 text-navy border-navy/12', label: 'PWD', icon: '🏗️' },
  NMC: { color: 'bg-amber-100 text-amber-900 border-amber-200', label: 'NMC', icon: '🏙️' },
  GramPanchayat: { color: 'bg-emerald-100 text-emerald-900 border-emerald-200', label: 'Gram Panchayat', icon: '🌾' },
  RevenueDeskTahsildar: { color: 'bg-red-100 text-red-900 border-red-200', label: 'Revenue', icon: '📋' },
  SDMDesk: { color: 'bg-purple-100 text-purple-900 border-purple-200', label: 'SDM', icon: '⚖️' },
};

function ProposalCard({ proposal, onVote }) {
  const { user } = useAuthStore();
  const [showCritique, setShowCritique] = useState(false);
  const [critiqueText, setCritiqueText] = useState('');
  const [localVote, setLocalVote] = useState(proposal.user_vote);
  const [localUp, setLocalUp] = useState(Number(proposal.upvote_count));
  const [localDown, setLocalDown] = useState(Number(proposal.downvote_count));
  const [voting, setVoting] = useState(false);

  const dept = DEPT_CONFIG[proposal.assigned_dept] || DEPT_CONFIG.PWD;
  const total = localUp + localDown;
  const approvalPct = total > 0 ? Math.round((localUp / total) * 100) : 0;

  const handleVote = async (type) => {
    if (!user) return toast.error('Please log in to vote.');
    if (voting) return;

    if (type === 'downvote' && localVote !== 'downvote') {
      setShowCritique(true);
      return;
    }

    setVoting(true);
    try {
      const res = await proposalsAPI.vote(proposal.id, { vote: type });
      const data = res.data.data;
      setLocalUp(data.upvote_count);
      setLocalDown(data.downvote_count);
      setLocalVote(data.user_vote);
      if (type === 'upvote') toast.success('Upvote registered!');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Vote failed');
    } finally { setVoting(false); }
  };

  const submitCritique = async () => {
    if (critiqueText.trim().length < 20) {
      return toast.error('Please provide at least 20 characters of constructive critique.');
    }
    setVoting(true);
    try {
      const res = await proposalsAPI.vote(proposal.id, { vote: 'downvote', critique_text: critiqueText });
      const data = res.data.data;
      setLocalUp(data.upvote_count);
      setLocalDown(data.downvote_count);
      setLocalVote('downvote');
      setShowCritique(false);
      setCritiqueText('');
      toast.success('Downvote + critique submitted.');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    } finally { setVoting(false); }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl border p-5 shadow-card hover:shadow-elevated transition-all
        ${proposal.threshold_met ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-navy/8'}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${dept.color}`}>
              {dept.icon} {dept.label}
            </span>
            {proposal.threshold_met && (
              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200">
                <CheckCircle size={9} /> Threshold Met
              </span>
            )}
            <span className="text-[10px] text-gray-400 font-mono">{proposal.ref_number}</span>
          </div>
          <h3 className="font-bold text-navy text-base leading-snug">{proposal.title}</h3>
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-[11px] text-gray-400 mb-3 flex-wrap">
        <span>📍 {proposal.region}</span>
        <span>👤 {proposal.author_name}</span>
        <span>🕐 {formatDistanceToNow(new Date(proposal.submitted_at), { addSuffix: true })}</span>
        {proposal.ai_confidence && <span>🤖 AI: {proposal.ai_confidence}% confident</span>}
      </div>

      {/* Description */}
      <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3">{proposal.description}</p>

      {/* Approval bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-gray-400">Community Approval</span>
          <span className="font-bold text-emerald-600">{approvalPct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            animate={{ width: `${approvalPct}%` }}
            transition={{ duration: 0.5 }}
            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>{localUp} upvotes</span>
          <span>{!proposal.threshold_met ? `${Math.max(0, 50 - localUp)} more to unlock review` : '✓ Sent for admin review'}</span>
          <span>{localDown} downvotes</span>
        </div>
      </div>

      {/* Vote buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleVote('upvote')}
          disabled={voting}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all
            ${localVote === 'upvote'
              ? 'bg-emerald-500 text-white border-emerald-500'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
        >
          <ThumbsUp size={15} /> {localUp}
        </button>

        <button
          onClick={() => handleVote('downvote')}
          disabled={voting}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all
            ${localVote === 'downvote'
              ? 'bg-red-500 text-white border-red-500'
              : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
        >
          <ThumbsDown size={15} /> {localDown}
        </button>

        <div className="flex-1" />

        <div className="text-[10px] text-gray-400 font-mono">
          Ref: {proposal.ref_number?.slice(-8)}
        </div>
      </div>

      {/* Downvote critique box */}
      <AnimatePresence>
        {showCritique && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
                <span className="font-bold text-amber-900 text-sm">⚠️ Constructive Review Required</span>
              </div>
              <p className="text-amber-700/80 text-xs mb-3 leading-relaxed">
                To register a downvote, you must provide a specific technical alternative or budget optimization suggestion. 
                This ensures democratic quality and prevents spam. <strong>Minimum 20 characters.</strong>
              </p>
              <textarea
                className="w-full px-3 py-2.5 rounded-xl border-2 border-amber-200 bg-white text-sm
                           focus:outline-none focus:border-amber-400 resize-none min-h-[90px]"
                placeholder="e.g., Suggest alternative drainage routing via Sector-4 bypass which would reduce cost by ~30% while addressing the core waterlogging issue..."
                value={critiqueText}
                onChange={e => setCritiqueText(e.target.value)}
              />
              <div className="flex items-center justify-between mt-1 mb-3">
                <span className={`text-[10px] ${critiqueText.length < 20 ? 'text-red-400' : 'text-emerald-600'}`}>
                  {critiqueText.length < 20 ? `${20 - critiqueText.length} more characters needed` : '✓ Minimum met'}
                </span>
                <span className="text-[10px] text-gray-400">{critiqueText.length} chars</span>
              </div>
              <div className="flex gap-2">
                <button onClick={submitCritique} disabled={voting || critiqueText.length < 20} className="btn-danger text-xs px-4 py-2">
                  <ThumbsDown size={13} /> Submit Downvote + Critique
                </button>
                <button onClick={() => { setShowCritique(false); setCritiqueText(''); }} className="btn-outline text-xs px-4 py-2">
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function CommunityFeed() {
  const [proposals, setProposals] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ sort: 'popular', dept: '', threshold_met: '', search: '' });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10, ...filters };
      if (!params.dept) delete params.dept;
      if (!params.threshold_met) delete params.threshold_met;
      if (!params.search) delete params.search;
      const res = await proposalsAPI.getAll(params);
      setProposals(res.data.data.proposals);
      setPagination(res.data.data.pagination);
    } catch { toast.error('Failed to load proposals'); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSearch = () => setFilters(f => ({ ...f, search: searchInput }));
  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-navy">Community Feed</h1>
          <p className="text-gray-500 text-sm mt-1">Vote on proposals to shape your city. 50 upvotes unlocks admin review.</p>
        </div>
        <button onClick={fetch} className="btn-outline text-xs px-3 py-2">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Search + Filters */}
      <div className="card py-4">
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="form-input pl-9 py-2" placeholder="Search proposals..." value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          </div>
          <button onClick={handleSearch} className="btn-primary text-xs px-4">Search</button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Sort */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {[['popular', '🔥 Popular'], ['recent', '🕐 Recent'], ['approval', '⭐ Top Approval']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter('sort', v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                  ${filters.sort === v ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Dept filter */}
          <select value={filters.dept} onChange={e => setFilter('dept', e.target.value)}
            className="text-xs border border-gray-200 rounded-xl px-3 py-1.5 text-gray-600 focus:outline-none focus:border-navy/30 bg-white">
            <option value="">All Departments</option>
            <option value="PWD">PWD</option>
            <option value="NMC">NMC</option>
            <option value="GramPanchayat">Gram Panchayat</option>
            <option value="RevenueDeskTahsildar">Revenue</option>
            <option value="SDMDesk">SDM</option>
          </select>

          {/* Threshold filter */}
          <button onClick={() => setFilter('threshold_met', filters.threshold_met ? '' : 'true')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
              ${filters.threshold_met ? 'bg-emerald-500 text-white border-emerald-500' : 'border-gray-200 text-gray-500 hover:border-emerald-300'}`}>
            <CheckCircle size={12} /> Threshold Met Only
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span>{pagination.total || 0} proposals</span>
        <span>·</span>
        <span>Page {page} of {pagination.pages || 1}</span>
      </div>

      {/* Proposals */}
      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="skeleton h-48 rounded-2xl" />)}
        </div>
      ) : proposals.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🗳️</div>
          <h3 className="font-bold text-navy text-lg mb-2">No proposals found</h3>
          <p className="text-gray-400 text-sm">Try adjusting your filters or be the first to submit!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map(p => <ProposalCard key={p.id} proposal={p} />)}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-outline text-xs px-4 py-2 disabled:opacity-40">
            ← Prev
          </button>
          {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-xl text-xs font-bold transition-all
                ${page === p ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-navy'}`}>
              {p}
            </button>
          ))}
          <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="btn-outline text-xs px-4 py-2 disabled:opacity-40">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
