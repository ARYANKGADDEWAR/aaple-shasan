import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { adminAPI } from '../../utils/api';

export default function AdminSettings() {
  const [config, setConfig] = useState([]);
  const [saving, setSaving] = useState({});
  useEffect(() => { (async () => { try { const r = await adminAPI.getConfig(); setConfig(r.data.data.config); } catch {} })(); }, []);

  const save = async (key, value) => {
    setSaving(s=>({...s,[key]:true}));
    try { await adminAPI.updateConfig(key, value); toast.success(`${key} updated.`); } catch { toast.error('Failed'); }
    setSaving(s=>({...s,[key]:false}));
  };

  const upd = (key, val) => setConfig(prev => prev.map(c => c.key===key ? {...c, value: val} : c));

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h1 className="text-2xl font-display font-bold text-navy">System Configuration</h1>
      {config.map(c => (
        <div key={c.key} className="card">
          <label className="form-label">{c.key.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())}</label>
          <div className="flex gap-3">
            <input className="form-input flex-1" value={typeof c.value==='object'?JSON.stringify(c.value):String(c.value)}
              onChange={e=>upd(c.key, e.target.value)} />
            <button onClick={()=>save(c.key, c.value)} disabled={saving[c.key]} className="btn-primary px-4">
              {saving[c.key]?'⏳':'Save'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
