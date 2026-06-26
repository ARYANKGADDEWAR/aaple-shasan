// src/pages/admin/AdminDashboard.jsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, CheckCircle, Clock, FileText, Users, TrendingUp, Stamp, RotateCcw, XCircle, Shield, Brain, ChevronRight, Building2, Search } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { proposalsAPI, adminAPI } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';

const DEPT_CONFIG = {
  PWD: { icon: '🏗️', color: '#002147', label: 'PWD' },
  NMC: { icon: '🏙️', color: '#d97706', label: 'NMC' },
  GramPanchayat: { icon: '🌾', color: '#10b981', label: 'Gram Panchayat' },
  RevenueDeskTahsildar: { icon: '📋', color: '#ef4444', label: 'Revenue' },
  SDMDesk: { icon: '⚖️', color: '#8b5cf6', label: 'SDM' },
};

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'dossier_compiled', label: 'Threshold Met' },
  { value: 'under_admin_review', label: 'Under Review' },
  { value: 'sanctioned', label: 'Sanctioned' },
  { value: 'revision_requested', label: 'Revision Req.' },
  { value: 'rejected', label: 'Rejected' },
];

// ── Sanction Modal ──────────────────────────────────────────────────────────
function SanctionModal({ proposal, onConfirm, onClose, loading }) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="text-5xl mb-4">🏛️</div>
        <h2 className="font-display text-2xl font-bold text-navy mb-2">Sanction This Project?</h2>
        <p className="text-gray-500 text-sm mb-4 leading-relaxed">
          You are about to officially sanction <strong>"{proposal?.title}"</strong>.<br />
          This will credit <strong className="text-emerald-600">₹1,000 Civic Royalty</strong> to the citizen via DBT.
        </p>
        <div className="text-left mb-5">
          <label className="form-label">Sanction Note (Optional)</label>
          <textarea className="form-input min-h-[80px] resize-none" placeholder="Any remarks or conditions for the sanction..."
            value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
          <button onClick={() => onConfirm(note)} disabled={loading} className="btn-emerald flex-1">
            {loading ? '⏳ Processing...' : <><Stamp size={15} /> Confirm Sanction</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Reject Modal ──────────────────────────────────────────────────────────
function RejectModal({ proposal, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8">
        <h2 className="font-display text-xl font-bold text-red-600 mb-3">Reject Proposal</h2>
        <p className="text-gray-500 text-sm mb-4">Provide a reason for rejecting <strong>"{proposal?.title}"</strong>. The citizen will be notified.</p>
        <div className="mb-5">
          <label className="form-label">Rejection Reason <span className="text-red-400">*</span></label>
          <textarea className="form-input min-h-[100px] resize-none" placeholder="Explain why this proposal cannot be approved..."
            value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
          <button onClick={() => onConfirm(reason)} disabled={loading || !reason.trim()} className="btn-danger flex-1">
            {loading ? '⏳' : <><XCircle size={15} /> Reject</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Success Modal ──────────────────────────────────────────────────────────
function SuccessModal({ data, onClose }) {
  const { updateWallet, user } = useAuthStore();
  useEffect(() => {
    // Simulate wallet update on admin side too
    updateWallet((user?.civic_royalty_balance || 0) + 1000);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.4 }}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', bounce: 0.6 }}
          className="text-6xl mb-4">🏆</motion.div>
        <h2 className="font-display text-2xl font-bold text-navy mb-2">Project Sanctioned!</h2>
        <p className="text-gray-500 text-sm mb-4">Proposal officially approved and registered in the Maharashtra Government Project Management System.</p>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-5">
          <div className="font-display text-3xl font-bold text-emerald-600 mb-1">+₹1,000</div>
          <div className="text-xs text-emerald-700 font-semibold">Civic Royalty Disbursed via DBT</div>
          <div className="text-[10px] text-emerald-600/70 mt-1">Project Code: {data?.project_code}</div>
        </div>
        <button onClick={onClose} className="btn-primary w-full"><CheckCircle size={16} /> Done</button>
      </motion.div>
    </div>
  );
}

// ── Dossier Panel ──────────────────────────────────────────────────────────
function DossierPanel({ proposal, dossier, onSanction, onRevise, onReject }) {
  const dept = DEPT_CONFIG[proposal.assigned_dept] || DEPT_CONFIG.PWD;
  const total = Number(proposal.upvote_count) + Number(proposal.downvote_count);
  const approval = total > 0 ? Math.round((proposal.upvote_count / total) * 100) : 0;
  const isSanctioned = proposal.status === 'sanctioned';
  const isRejected = proposal.status === 'rejected';

  const lifecycleSteps = [
    { label: 'AI Routed', done: true },
    { label: 'Dossier Compiled', done: true },
    { label: 'Admin Review', done: ['under_admin_review','sanctioned','rejected'].includes(proposal.status), active: proposal.status === 'dossier_compiled' },
    { label: isSanctioned ? 'Sanctioned ✓' : isRejected ? 'Rejected' : 'Awaiting Sign-off', done: isSanctioned, active: !isSanctioned && !isRejected && proposal.status !== 'rejected' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-navy/8 shadow-elevated overflow-hidden">
      {/* Dossier header */}
      <div className="bg-hero-gradient p-6 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={14} className="text-gold" />
          <span className="text-gold text-[10px] font-bold uppercase tracking-widest">AI-Compiled Executive Dossier</span>
        </div>
        <h2 className="font-display text-xl font-bold mb-1 leading-tight">{proposal.title}</h2>
        <div className="text-white/40 text-[11px] font-mono">Ref: {proposal.ref_number} · {proposal.assigned_dept}</div>
      </div>

      {/* Lifecycle */}
      <div className="bg-gray-50 border-b border-gray-100 px-6 py-3 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {lifecycleSteps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold
                ${step.done ? 'bg-emerald-100 text-emerald-700' : step.active ? 'bg-gold/20 text-amber-700' : 'bg-gray-200 text-gray-500'}`}>
                {step.done ? '✓' : step.active ? '●' : '○'} {step.label}
              </div>
              {i < lifecycleSteps.length - 1 && <span className="text-gray-300 text-lg">→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Jurisdiction', value: proposal.region, sub: proposal.district || '' },
            { label: 'Community Approval', value: `${approval}%`, sub: `${proposal.upvote_count} up / ${proposal.downvote_count} down`, color: 'text-emerald-600' },
            { label: 'AI Confidence', value: `${proposal.ai_confidence}%`, sub: `Routed to ${dept.label}` },
            { label: 'Vote Threshold', value: proposal.threshold_met ? '✓ Met' : `${proposal.upvote_count}/50`, sub: 'Democratic filter', color: proposal.threshold_met ? 'text-emerald-600' : 'text-amber-600' },
          ].map(m => (
            <div key={m.label} className="bg-gray-50 rounded-xl p-3">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
              <div className={`font-display text-lg font-bold ${m.color || 'text-navy'}`}>{m.value}</div>
              {m.sub && <div className="text-[10px] text-gray-500 mt-0.5">{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* Original description */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1 bg-gold" />
            <span className="text-[10px] font-bold text-navy uppercase tracking-wide px-2">Original Community Submission</span>
            <div className="h-px flex-1 bg-gold" />
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 leading-relaxed">
            {proposal.description}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-gray-400">
            <span>👤 {proposal.author_name}</span>
            <span>🕐 {format(new Date(proposal.submitted_at), 'dd MMM yyyy, HH:mm')}</span>
          </div>
        </div>

        {/* AI Dossier */}
        {dossier && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-gold" />
              <span className="text-[10px] font-bold text-navy uppercase tracking-wide px-2">AI Consolidated Analysis</span>
              <div className="h-px flex-1 bg-gold" />
            </div>
            <div className="bg-navy/3 border border-navy/8 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {dossier}
            </div>
          </div>
        )}

        {/* Budget estimate */}
        {proposal.ai_budget_estimate && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wide mb-1">AI Budget Estimate</div>
            <div className="font-display text-2xl font-bold text-blue-900">
              ₹{Number(proposal.ai_budget_estimate).toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-blue-600/70 mt-1">Estimated project cost based on similar past projects in the region.</div>
          </div>
        )}

        {/* Action buttons */}
        {!isSanctioned && !isRejected && (
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button onClick={onRevise} className="btn-outline flex-1">
              <RotateCcw size={14} /> Request Revisions
            </button>
            <button onClick={onReject} className="btn-danger">
              <XCircle size={14} /> Reject
            </button>
            <button onClick={onSanction} className="btn-emerald flex-1">
              <Stamp size={14} /> Sanction & Authorize
            </button>
          </div>
        )}

        {isSanctioned && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
            <div>
              <div className="font-bold text-emerald-800 text-sm">Project Sanctioned</div>
              <div className="text-emerald-600/70 text-xs">Project Code: {proposal.project_code} · DBT disbursed to citizen</div>
            </div>
          </div>
        )}

        {isRejected && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <XCircle size={20} className="text-red-500 flex-shrink-0" />
            <div>
              <div className="font-bold text-red-800 text-sm">Proposal Rejected</div>
              <div className="text-red-600/70 text-xs">{proposal.rejection_reason}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Admin Dashboard ──────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user } = useAuthStore();
  const [proposals, setProposals] = useState([]);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [dossier, setDossier] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState(user?.dept || '');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  // Modals
  const [showSanction, setShowSanction] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { fetchProposals(); fetchStats(); }, [statusFilter, deptFilter, page]);

  const fetchProposals = async () => {
    setLoading(true);
    try {
      const res = await proposalsAPI.getAdminList({
        page, limit: 15,
        ...(statusFilter && { status: statusFilter }),
        ...(deptFilter && { dept: deptFilter }),
        ...(search && { search }),
      });
      setProposals(res.data.data.proposals);
      setPagination(res.data.data.pagination);
    } catch { toast.error('Failed to load proposals'); }
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const res = await proposalsAPI.getStats();
      setStats(res.data.data);
    } catch {}
  };

  const selectProposal = async (p) => {
    setSelectedProposal(p);
    setDossier(null);
    setDossierLoading(true);
    try {
      const res = await proposalsAPI.getDossier(p.id);
      setDossier(res.data.data.dossier);
      // Update selected with latest data
      setSelectedProposal(prev => ({ ...prev, ...res.data.data.proposal }));
    } catch { toast.error('Failed to load dossier'); }
    setDossierLoading(false);
  };

  const handleSanction = async (note) => {
    setActionLoading(true);
    try {
      const res = await proposalsAPI.sanction(selectedProposal.id, { sanction_note: note });
      setSuccessData(res.data.data);
      setShowSanction(false);
      setShowSuccess(true);
      // Update local state
      setProposals(prev => prev.map(p => p.id === selectedProposal.id ? { ...p, status: 'sanctioned' } : p));
      setSelectedProposal(prev => ({ ...prev, status: 'sanctioned', project_code: res.data.data.project_code }));
    } catch (e) {
      toast.error(e.response?.data?.message || 'Sanction failed');
    } finally { setActionLoading(false); }
  };

  const handleRevise = async () => {
    const note = prompt('Enter revision request note for the citizen:');
    if (!note?.trim()) return;
    try {
      await proposalsAPI.requestRevision(selectedProposal.id, { revision_note: note });
      toast.success('Revision request sent to citizen.');
      setProposals(prev => prev.map(p => p.id === selectedProposal.id ? { ...p, status: 'revision_requested' } : p));
      setSelectedProposal(prev => ({ ...prev, status: 'revision_requested' }));
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const handleReject = async (reason) => {
    setActionLoading(true);
    try {
      await proposalsAPI.reject(selectedProposal.id, { rejection_reason: reason });
      toast.success('Proposal rejected.');
      setShowReject(false);
      setProposals(prev => prev.map(p => p.id === selectedProposal.id ? { ...p, status: 'rejected' } : p));
      setSelectedProposal(prev => ({ ...prev, status: 'rejected', rejection_reason: reason }));
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } finally { setActionLoading(false); }
  };

  const byStatus = stats?.by_status || [];
  const sanctioned = byStatus.find(s => s.status === 'sanctioned')?.count || 0;
  const pending = byStatus.find(s => s.status === 'dossier_compiled')?.count || 0;
  const total = stats?.total_proposals || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-navy">Administrative Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {user?.role === 'superadmin' ? 'All departments' : `${user?.dept || ''} Department`} · AI-compiled dossiers awaiting review
          </p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-emerald-700 text-xs font-semibold">AI Engine Online</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Proposals', value: total, icon: '📝', sub: 'All departments', color: 'text-navy' },
          { label: 'Threshold Met', value: pending, icon: '📋', sub: 'Awaiting your review', color: 'text-amber-600' },
          { label: 'Sanctioned', value: sanctioned, icon: '✅', sub: 'This period', color: 'text-emerald-600' },
          { label: 'DBT Disbursed', value: `₹${(sanctioned * 1000).toLocaleString('en-IN')}`, icon: '💰', sub: 'To citizens', color: 'text-navy' },
        ].map(s => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="card">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{s.label}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{s.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid xl:grid-cols-5 gap-5">
        {/* Left: Proposal list */}
        <div className="xl:col-span-2 space-y-3">
          {/* Filters */}
          <div className="card py-3">
            <div className="flex gap-2 mb-3">
              <div className="flex-1 relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="form-input pl-8 py-2 text-xs" placeholder="Search proposals..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchProposals()} />
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {STATUS_TABS.map(t => (
                <button key={t.value} onClick={() => { setStatusFilter(t.value); setPage(1); }}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all
                    ${statusFilter === t.value ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {user?.role === 'superadmin' && (
              <select className="mt-2 w-full text-xs border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none bg-white"
                value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }}>
                <option value="">All Departments</option>
                {Object.entries(DEPT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            )}
          </div>

          {/* List */}
          <div className="space-y-2">
            {loading ? [...Array(5)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />) :
              proposals.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No proposals in this category</p>
                </div>
              ) : proposals.map(p => {
                const dept = DEPT_CONFIG[p.assigned_dept] || DEPT_CONFIG.PWD;
                const total = Number(p.upvote_count) + Number(p.downvote_count);
                const approval = total > 0 ? Math.round((p.upvote_count / total) * 100) : 0;
                const isSelected = selectedProposal?.id === p.id;

                return (
                  <button key={p.id} onClick={() => selectProposal(p)}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all hover:shadow-card
                      ${isSelected ? 'border-gold bg-gold/5' : 'border-navy/8 bg-white hover:border-navy/20'}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ background: dept.color + '15' }}>
                        {dept.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-navy text-xs leading-snug mb-1 line-clamp-2">{p.title}</div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] text-gray-400">{dept.label}</span>
                          <span className="text-[9px] text-gray-400">·</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full
                            ${p.status === 'sanctioned' ? 'bg-green-100 text-green-700'
                              : p.status === 'rejected' ? 'bg-red-100 text-red-700'
                              : p.threshold_met ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-500'}`}>
                            {p.status === 'sanctioned' ? '✓ Sanctioned'
                              : p.status === 'rejected' ? '✗ Rejected'
                              : p.threshold_met ? '📋 Threshold Met'
                              : `${p.upvote_count}/50`}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-display text-lg font-bold text-emerald-600">{approval}%</div>
                        <div className="text-[9px] text-gray-400">approval</div>
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>

          {pagination.pages > 1 && (
            <div className="flex gap-2 justify-center">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40">←</button>
              <span className="text-xs text-gray-500 py-1.5">{page}/{pagination.pages}</span>
              <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40">→</button>
            </div>
          )}
        </div>

        {/* Right: Dossier */}
        <div className="xl:col-span-3">
          {!selectedProposal ? (
            <div className="h-full flex items-center justify-center bg-white rounded-2xl border-2 border-dashed border-navy/10 min-h-[400px]">
              <div className="text-center">
                <FileText size={40} className="mx-auto mb-4 text-gray-200" />
                <p className="font-semibold text-gray-400 text-sm">Select a proposal to view the AI-compiled executive dossier</p>
                <p className="text-gray-300 text-xs mt-1">Proposals that have met the voting threshold are prioritised</p>
              </div>
            </div>
          ) : dossierLoading ? (
            <div className="space-y-3">
              <div className="skeleton h-32 rounded-2xl" />
              <div className="skeleton h-16 rounded-xl" />
              <div className="skeleton h-48 rounded-xl" />
            </div>
          ) : (
            <DossierPanel
              proposal={selectedProposal}
              dossier={dossier}
              onSanction={() => setShowSanction(true)}
              onRevise={handleRevise}
              onReject={() => setShowReject(true)}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showSanction && <SanctionModal proposal={selectedProposal} onConfirm={handleSanction} onClose={() => setShowSanction(false)} loading={actionLoading} />}
      {showReject && <RejectModal proposal={selectedProposal} onConfirm={handleReject} onClose={() => setShowReject(false)} loading={actionLoading} />}
      {showSuccess && <SuccessModal data={successData} onClose={() => setShowSuccess(false)} />}
    </div>
  );
}
