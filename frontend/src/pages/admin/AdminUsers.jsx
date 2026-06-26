import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { UserCheck, UserX, Plus, Search, Shield } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { adminAPI } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';

export default function AdminUsers() {
  const { user: me } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ full_name:'', phone:'', email:'', dept:'PWD', department_designation:'' });
  const [creating, setCreating] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getUsers({ search, ...(roleFilter&&{role:roleFilter}) });
      setUsers(res.data.data.users);
    } catch { toast.error('Failed to load users'); }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [search, roleFilter]);

  const toggleLock = async (id, name) => {
    try {
      const res = await adminAPI.toggleLock(id);
      toast.success(`${name} ${res.data.data.is_locked ? 'locked' : 'unlocked'}.`);
      setUsers(prev => prev.map(u => u.id===id ? {...u, is_locked:res.data.data.is_locked} : u));
    } catch { toast.error('Action failed'); }
  };

  const createAdmin = async () => {
    if (!form.full_name||!form.phone) return toast.error('Name and phone required.');
    setCreating(true);
    try {
      const res = await adminAPI.createAdmin(form);
      toast.success(`Admin created! Temp password: ${res.data.data.temp_password}`);
      setShowCreate(false);
      fetch();
    } catch (e) { toast.error(e.response?.data?.message||'Failed'); }
    setCreating(false);
  };

  const roleColor = { citizen:'bg-blue-100 text-blue-800', admin:'bg-amber-100 text-amber-800', superadmin:'bg-purple-100 text-purple-800', auditor:'bg-gray-100 text-gray-700' };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-display font-bold text-navy">User Management</h1></div>
        {me?.role==='superadmin' && (
          <button onClick={()=>setShowCreate(true)} className="btn-primary"><Plus size={15}/> Create Admin</button>
        )}
      </div>

      <div className="card py-3 flex gap-3">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="form-input pl-8 py-2 text-xs" placeholder="Search by name or phone..."
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="text-xs border border-gray-200 rounded-xl px-3 focus:outline-none bg-white"
          value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          <option value="citizen">Citizens</option>
          <option value="admin">Admins</option>
          <option value="superadmin">Super Admin</option>
          <option value="auditor">Auditors</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i=><div key={i} className="skeleton h-14 rounded-xl"/>)}</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Name','Phone','Role','Aadhaar','Last Login','Status','Action'].map(h=>(
                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-navy">{u.full_name}</div>
                    <div className="text-[10px] text-gray-400">{u.email||'—'}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{u.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${roleColor[u.role]||'bg-gray-100 text-gray-600'}`}>
                      {u.role}{u.dept?` · ${u.dept}`:''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.aadhaar_verified
                      ? <span className="text-emerald-600 font-semibold">✓ Verified</span>
                      : <span className="text-gray-400">Not verified</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {u.last_login_at ? format(new Date(u.last_login_at),'dd MMM, HH:mm') : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.is_locked?'bg-red-100 text-red-700':u.is_active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                      {u.is_locked?'Locked':u.is_active?'Active':'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {me?.role==='superadmin' && u.id!==me.id && (
                      <button onClick={()=>toggleLock(u.id,u.full_name)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all
                          ${u.is_locked?'border-emerald-200 text-emerald-700 hover:bg-emerald-50':'border-red-200 text-red-700 hover:bg-red-50'}`}>
                        {u.is_locked?'Unlock':'Lock'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8">
            <h2 className="font-display text-xl font-bold text-navy mb-5">Create Admin Account</h2>
            <div className="space-y-3">
              {[['Full Name','full_name','text','Full name'],['Phone','phone','tel','10-digit mobile'],['Email','email','email','Email address'],['Designation','department_designation','text','Job title']].map(([l,k,t,p])=>(
                <div key={k}><label className="form-label">{l}</label>
                <input className="form-input" type={t} placeholder={p} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/></div>
              ))}
              <div><label className="form-label">Department</label>
              <select className="form-input" value={form.dept} onChange={e=>setForm(f=>({...f,dept:e.target.value}))}>
                {['PWD','NMC','GramPanchayat','RevenueDeskTahsildar','SDMDesk'].map(d=><option key={d} value={d}>{d}</option>)}
              </select></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={()=>setShowCreate(false)} className="btn-outline flex-1">Cancel</button>
              <button onClick={createAdmin} disabled={creating} className="btn-primary flex-1">{creating?'⏳ Creating...':'Create Admin'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
