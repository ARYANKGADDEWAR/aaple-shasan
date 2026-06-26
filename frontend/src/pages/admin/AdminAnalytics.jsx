import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { proposalsAPI } from '../../utils/api';

const COLORS = ['#002147','#d97706','#10b981','#ef4444','#8b5cf6'];

export default function AdminAnalytics() {
  const [stats, setStats] = useState(null);
  useEffect(() => { (async () => { try { const r = await proposalsAPI.getStats(); setStats(r.data.data); } catch {} })(); }, []);

  const byStatus = (stats?.by_status||[]).map(r=>({ name: r.status.replace('_',' '), value: Number(r.count) }));
  const byDept = (stats?.by_dept||[]).map(r=>({ name: r.assigned_dept||'Unknown', value: Number(r.count), confidence: Number(r.avg_confidence||0).toFixed(1) }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold text-navy">Analytics Dashboard</h1>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-bold text-navy text-sm uppercase tracking-wide mb-5">Proposals by Status</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byStatus}>
              <XAxis dataKey="name" tick={{fontSize:10}} />
              <YAxis tick={{fontSize:10}} />
              <Tooltip />
              <Bar dataKey="value" fill="#002147" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h2 className="font-bold text-navy text-sm uppercase tracking-wide mb-5">Distribution by Department</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byDept} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                {byDept.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h2 className="font-bold text-navy text-sm uppercase tracking-wide mb-4">Recent Sanctions</h2>
        {(stats?.recent_sanctions||[]).length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">No sanctions yet.</p>
        ) : (stats?.recent_sanctions||[]).map((s,i)=>(
          <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
            <span className="text-xl">✅</span>
            <div className="flex-1"><div className="font-semibold text-navy text-sm">{s.title}</div>
            <div className="text-xs text-gray-400">{s.ref_number} · {s.full_name}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
