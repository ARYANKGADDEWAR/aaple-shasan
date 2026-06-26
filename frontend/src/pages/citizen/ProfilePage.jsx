import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, User, Lock, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';

export default function ProfilePage() {
  const { user, refreshUser } = useAuthStore();
  const [aadhaar, setAadhaar] = useState('');
  const [loading, setLoading] = useState(false);
  const [pwForm, setPwForm] = useState({ current:'', new_password:'', confirm:'' });

  const verifyAadhaar = async () => {
    if (!/^\d{12}$/.test(aadhaar)) return toast.error('Enter a valid 12-digit Aadhaar number.');
    setLoading(true);
    try {
      await authAPI.verifyAadhaar({ aadhaar_number: aadhaar });
      toast.success('Aadhaar verified successfully!');
      await refreshUser();
      setAadhaar('');
    } catch (e) { toast.error(e.response?.data?.message || 'Verification failed'); }
    setLoading(false);
  };

  const changePassword = async () => {
    if (!pwForm.current || !pwForm.new_password) return toast.error('Fill all fields.');
    if (pwForm.new_password !== pwForm.confirm) return toast.error('Passwords do not match.');
    if (pwForm.new_password.length < 8) return toast.error('Minimum 8 characters.');
    setLoading(true);
    try {
      await authAPI.changePassword({ current_password: pwForm.current, new_password: pwForm.new_password });
      toast.success('Password changed!');
      setPwForm({ current:'', new_password:'', confirm:'' });
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setLoading(false);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-display font-bold text-navy">My Profile</h1></div>

      <div className="card">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gold-gradient flex items-center justify-center text-2xl font-black text-navy">
            {user?.full_name?.charAt(0)}
          </div>
          <div>
            <div className="font-bold text-navy text-lg">{user?.full_name}</div>
            <div className="text-gray-500 text-sm">{user?.phone}</div>
            <div className="flex items-center gap-1.5 mt-1">
              {user?.aadhaar_verified
                ? <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold"><CheckCircle size={12}/> Aadhaar Verified</span>
                : <span className="text-amber-600 text-xs font-semibold">⚠️ Aadhaar Not Verified</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[['Phone', user?.phone], ['Email', user?.email||'Not set'], ['Ward', user?.ward_constituency||'Not set'], ['District', user?.district||'Not set']].map(([l,v])=>(
            <div key={l} className="bg-gray-50 rounded-xl p-3">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{l}</div>
              <div className="font-medium text-navy text-sm">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {!user?.aadhaar_verified && (
        <div className="card border-amber-200 bg-amber-50">
          <h2 className="font-bold text-amber-900 text-sm mb-3 flex items-center gap-2"><Shield size={15}/> Verify Aadhaar</h2>
          <p className="text-amber-700/80 text-xs mb-4">Required to submit proposals and receive Civic Royalties via DBT.</p>
          <label className="form-label">Aadhaar Number (12 digits)</label>
          <input className="form-input mb-3" type="password" placeholder="Enter 12-digit Aadhaar" maxLength={12}
            value={aadhaar} onChange={e=>setAadhaar(e.target.value.replace(/\D/g,'').slice(0,12))} inputMode="numeric" />
          <button onClick={verifyAadhaar} disabled={loading} className="btn-primary w-full">
            {loading ? '⏳ Verifying...' : <><Shield size={14}/> Verify Aadhaar</>}
          </button>
          <p className="text-[10px] text-amber-600/60 mt-2 text-center">Your Aadhaar number is never stored — only a secure hash is kept.</p>
        </div>
      )}

      <div className="card">
        <h2 className="font-bold text-navy text-sm mb-4 flex items-center gap-2"><Lock size={15}/> Change Password</h2>
        <div className="space-y-3">
          {[['Current Password','current','Your current password'],['New Password','new_password','Min. 8 characters'],['Confirm New Password','confirm','Repeat new password']].map(([l,k,p])=>(
            <div key={k}>
              <label className="form-label">{l}</label>
              <input className="form-input" type="password" placeholder={p} value={pwForm[k]} onChange={e=>setPwForm(f=>({...f,[k]:e.target.value}))} />
            </div>
          ))}
        </div>
        <button onClick={changePassword} disabled={loading} className="btn-primary w-full mt-4">
          {loading ? '⏳' : 'Change Password'}
        </button>
      </div>
    </div>
  );
}
