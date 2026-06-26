import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { proposalsAPI } from '../../utils/api';

const STATUS_CONFIG = {
  ai_routed:{ label:'AI Routed', color:'bg-blue-100 text-blue-800', icon:'🤖' },
  dossier_compiled:{ label:'Dossier Ready', color:'bg-amber-100 text-amber-800', icon:'📋' },
  under_admin_review:{ label:'Under Review', color:'bg-purple-100 text-purple-800', icon:'👁️' },
  sanctioned:{ label:'Sanctioned ✓', color:'bg-green-100 text-green-800', icon:'✅' },
  revision_requested:{ label:'Needs Revision', color:'bg-orange-100 text-orange-800', icon:'✏️' },
  rejected:{ label:'Not Approved', color:'bg-red-100 text-red-800', icon:'❌' },
  pending_review:{ label:'Pending', color:'bg-gray-100 text-gray-600', icon:'⏳' },
};

export default function MyProposals() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await proposalsAPI.getMine({ page, limit: 10 });
        setProposals(res.data.data.proposals);
        setPagination(res.data.data.pagination);
      } catch {}
      setLoading(false);
    })();
  }, [page]);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-display font-bold text-navy">My Proposals</h1>
        <p className="text-gray-500 text-sm mt-1">Track all your civic proposals and their current status.</p>
      </div>
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="skeleton h-24 rounded-2xl"/>)}</div>
      ) : proposals.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📝</div>
          <h3 className="font-bold text-navy text-lg mb-2">No proposals yet</h3>
          <Link to="/citizen/submit" className="btn-primary inline-flex mt-2">Submit your first proposal</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map(p => {
            const s = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending_review;
            const total = Number(p.upvote_count) + Number(p.downvote_count);
            const approval = total > 0 ? Math.round((p.upvote_count/total)*100) : 0;
            return (
              <motion.div key={p.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                className="card hover:shadow-elevated transition-all">
                <div className="flex items-start gap-4">
                  <span className="text-2xl mt-0.5">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-navy text-sm mb-1 leading-snug">{p.title}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                      <span className="text-[10px] text-gray-400">{p.assigned_dept}</span>
                      <span className="text-[10px] text-gray-400">↑{p.upvote_count} · {approval}% approval</span>
                      <span className="text-[10px] text-gray-400">{formatDistanceToNow(new Date(p.submitted_at),{addSuffix:true})}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1 font-mono">{p.ref_number}</div>
                    {p.status === 'sanctioned' && (
                      <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-xs text-green-700 font-semibold inline-block">
                        🎉 ₹1,000 Civic Royalty credited to your wallet!
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="font-display text-xl font-bold text-emerald-600">{approval}%</div>
                    <div className="text-[10px] text-gray-400">approval</div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      {pagination.pages > 1 && (
        <div className="flex gap-2 justify-center">
          <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="btn-outline text-xs px-4 py-2 disabled:opacity-40">← Prev</button>
          <span className="text-sm text-gray-500 py-2">{page}/{pagination.pages}</span>
          <button disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)} className="btn-outline text-xs px-4 py-2 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
