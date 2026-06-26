import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { adminAPI } from '../../utils/api';

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { const r = await adminAPI.getAuditLogs(); setLogs(r.data.data.logs); } catch {} setLoading(false); })(); }, []);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-display font-bold text-navy">Audit Logs</h1>
      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-8 text-center text-gray-400">Loading logs...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b"><tr>{['Time','User','Action','Resource','IP','Status'].map(h=><th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">{h}</th>)}</tr></thead>
              <tbody>
                {logs.map(l=>(
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2 text-gray-400 font-mono whitespace-nowrap">{format(new Date(l.created_at),'dd MMM HH:mm:ss')}</td>
                    <td className="px-4 py-2 text-navy font-medium">{l.full_name||'System'}</td>
                    <td className="px-4 py-2 text-gray-600">{l.action}</td>
                    <td className="px-4 py-2 text-gray-400">{l.resource||'—'}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono">{l.ip_address||'—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${l.response_code<400?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>
                        {l.response_code||'—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
