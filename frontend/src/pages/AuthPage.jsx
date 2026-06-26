// src/pages/AuthPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Shield, Phone, Lock, ArrowRight, CheckCircle, Eye, EyeOff, ChevronLeft, User, MapPin } from 'lucide-react';
import { authAPI } from '../utils/api';
import { useAuthStore } from '../store/authStore';

// ── OTP Input ──────────────────────────────────────────────────────────
function OTPInput({ value, onChange }) {
  const digits = 6;
  const vals = value.split('').concat(Array(digits).fill('')).slice(0, digits);

  const handleKey = (e, idx) => {
    if (e.key === 'Backspace' && !vals[idx] && idx > 0) {
      document.getElementById(`otp-${idx - 1}`)?.focus();
    }
  };

  const handleChange = (e, idx) => {
    const v = e.target.value.replace(/\D/g, '').slice(-1);
    const newVals = [...vals];
    newVals[idx] = v;
    onChange(newVals.join(''));
    if (v && idx < digits - 1) document.getElementById(`otp-${idx + 1}`)?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, digits);
    onChange(pasted);
    document.getElementById(`otp-${Math.min(pasted.length, digits - 1)}`)?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {vals.map((v, i) => (
        <input
          key={i}
          id={`otp-${i}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={v}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKey(e, i)}
          onPaste={handlePaste}
          className="w-11 h-12 text-center text-xl font-bold rounded-xl border-2 border-navy/20
                     focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20
                     bg-civic-slate transition-all"
        />
      ))}
    </div>
  );
}

// ── Login Page ──────────────────────────────────────────────────────────
export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();

  const [mode, setMode] = useState('phone'); // 'phone' | 'otp' | 'password'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [usePassword, setUsePassword] = useState(false);

  useEffect(() => {
    if (searchParams.get('session') === 'expired') {
      toast.error('Session expired. Please log in again.');
    }
  }, []);

  useEffect(() => {
    if (timer > 0) {
      const t = setTimeout(() => setTimer(t => t - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [timer]);

  const requestOTP = async () => {
    if (!/^\d{10}$/.test(phone)) return toast.error('Enter a valid 10-digit mobile number.');
    setLoading(true);
    try {
      await authAPI.requestLoginOTP({ phone });
      toast.success('OTP sent to your mobile!');
      setMode('otp');
      setTimer(60);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  const verifyOTP = async () => {
    if (otp.length !== 6) return toast.error('Enter all 6 digits of the OTP.');
    setLoading(true);
    try {
      const res = await authAPI.verifyLoginOTP({ phone, otp });
      const { accessToken, user } = res.data.data;
      login(accessToken, user);
      toast.success(`Welcome back, ${user.full_name.split(' ')[0]}! 🙏`);
      navigate(user.role === 'citizen' ? '/citizen' : '/admin');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Invalid OTP');
      setOtp('');
    } finally { setLoading(false); }
  };

  const loginPassword = async () => {
    if (!password) return toast.error('Enter your password.');
    setLoading(true);
    try {
      const res = await authAPI.loginWithPassword({ phone, password });
      const { accessToken, user } = res.data.data;
      login(accessToken, user);
      toast.success(`Welcome back, ${user.full_name.split(' ')[0]}! 🙏`);
      navigate(user.role === 'citizen' ? '/citizen' : '/admin');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Invalid credentials');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex bg-hero-gradient">
      {/* Left branding panel */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 text-white">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 rounded-full bg-gold flex items-center justify-center text-2xl font-black text-navy">🏛️</div>
            <div>
              <div className="font-bold text-lg">Aaple Shasan</div>
              <div className="text-gold text-xs tracking-widest uppercase">आपले शासन</div>
            </div>
          </div>
          <h2 className="font-display text-5xl font-bold leading-tight mb-6">
            Your Voice.<br/>
            <span className="text-gold">Your City.</span><br/>
            Your Government.
          </h2>
          <p className="text-white/70 text-lg leading-relaxed max-w-sm">
            Maharashtra's first AI-powered decentralized civic platform. Submit proposals, earn Civic Royalties, and watch your community transform.
          </p>
        </div>
        <div className="space-y-4">
          {[
            { icon: '🏗️', label: '2,400+ Proposals', sub: 'Submitted by citizens' },
            { icon: '✅', label: '186 Projects Sanctioned', sub: 'This fiscal year' },
            { icon: '💰', label: '₹1.86 Crore Disbursed', sub: 'In Civic Royalties' },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-4 bg-white/10 rounded-xl p-3">
              <span className="text-2xl">{stat.icon}</span>
              <div>
                <div className="font-bold text-sm">{stat.label}</div>
                <div className="text-white/50 text-xs">{stat.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right auth panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="lg:hidden flex items-center gap-2 mb-8">
              <span className="text-2xl">🏛️</span>
              <span className="font-bold text-navy">Aaple Shasan</span>
            </div>

            <AnimatePresence mode="wait">
              {mode === 'phone' && (
                <motion.div key="phone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <h3 className="font-display text-2xl font-bold text-navy mb-1">Welcome back</h3>
                  <p className="text-gray-500 text-sm mb-8">Enter your registered mobile number</p>

                  <div className="mb-6">
                    <label className="form-label">Mobile Number</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-semibold">+91</span>
                      <input
                        className="form-input pl-12"
                        placeholder="Enter 10-digit number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        onKeyDown={(e) => e.key === 'Enter' && !usePassword && requestOTP()}
                        inputMode="numeric"
                        autoFocus
                      />
                    </div>
                  </div>

                  {!usePassword ? (
                    <button className="btn-primary w-full mb-4" onClick={requestOTP} disabled={loading}>
                      {loading ? <span className="animate-spin">⏳</span> : <><Phone size={16} /> Send OTP</>}
                    </button>
                  ) : (
                    <>
                      <div className="mb-4">
                        <label className="form-label">Password</label>
                        <div className="relative">
                          <input
                            className="form-input pr-12"
                            type={showPass ? 'text' : 'password'}
                            placeholder="Your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && loginPassword()}
                          />
                          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPass(!showPass)}>
                            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <button className="btn-primary w-full mb-4" onClick={loginPassword} disabled={loading}>
                        {loading ? <span className="animate-spin">⏳</span> : <><Lock size={16} /> Login</>}
                      </button>
                    </>
                  )}

                  <button className="w-full text-center text-sm text-navy/60 hover:text-navy transition-colors" onClick={() => setUsePassword(!usePassword)}>
                    {usePassword ? 'Use OTP instead' : 'Login with password instead'}
                  </button>

                  <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                    <span className="text-gray-500 text-sm">New to Aaple Shasan? </span>
                    <Link to="/register" className="text-navy font-semibold text-sm hover:text-gold transition-colors">Create Account</Link>
                  </div>
                </motion.div>
              )}

              {mode === 'otp' && (
                <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <button className="flex items-center gap-1 text-sm text-gray-500 mb-6 hover:text-navy" onClick={() => setMode('phone')}>
                    <ChevronLeft size={16} /> Back
                  </button>
                  <h3 className="font-display text-2xl font-bold text-navy mb-1">Enter OTP</h3>
                  <p className="text-gray-500 text-sm mb-8">We sent a 6-digit code to <strong>+91-{phone}</strong></p>

                  <div className="mb-8">
                    <OTPInput value={otp} onChange={setOtp} />
                  </div>

                  <button className="btn-primary w-full mb-4" onClick={verifyOTP} disabled={loading || otp.length < 6}>
                    {loading ? <span className="animate-spin">⏳</span> : <><CheckCircle size={16} /> Verify & Login</>}
                  </button>

                  <div className="text-center">
                    {timer > 0 ? (
                      <p className="text-sm text-gray-400">Resend OTP in <strong className="text-navy">{timer}s</strong></p>
                    ) : (
                      <button className="text-sm text-navy font-semibold hover:text-gold" onClick={requestOTP}>
                        Resend OTP
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p className="text-center text-white/40 text-xs mt-6">
            Government of Maharashtra · Secure Platform · ISO 27001 Certified
          </p>
        </motion.div>
      </div>
    </div>
  );
}

// ── Register Page ──────────────────────────────────────────────────────────
export function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [step, setStep] = useState(1); // 1: details, 2: OTP, 3: password
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', ward_constituency: '', district: '', password: '', confirm_password: '' });
  const [otp, setOtp] = useState('');
  const [timer, setTimer] = useState(0);
  const [showPass, setShowPass] = useState(false);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (timer > 0) { const t = setTimeout(() => setTimer(t => t - 1), 1000); return () => clearTimeout(t); }
  }, [timer]);

  const sendOTP = async () => {
    if (!form.full_name.trim()) return toast.error('Full name required.');
    if (!/^\d{10}$/.test(form.phone)) return toast.error('Valid 10-digit mobile required.');
    setLoading(true);
    try {
      await authAPI.requestRegisterOTP({ phone: form.phone, full_name: form.full_name, email: form.email });
      toast.success('OTP sent!');
      setStep(2);
      setTimer(60);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  const verifyAndRegister = async () => {
    if (otp.length !== 6) return toast.error('Enter all 6 OTP digits.');
    if (!form.password || form.password.length < 8) return toast.error('Password must be at least 8 characters.');
    if (form.password !== form.confirm_password) return toast.error('Passwords do not match.');
    setLoading(true);
    try {
      await authAPI.verifyRegisterOTP({
        phone: form.phone, otp,
        password: form.password,
        ward_constituency: form.ward_constituency,
        district: form.district,
      });
      toast.success('Account created! Please log in.');
      navigate('/login');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-hero-gradient flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-6 text-white">
          <span className="text-2xl">🏛️</span>
          <span className="font-bold">Aaple Shasan · नागरिक नोंदणी</span>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            {[1,2].map((s) => (
              <div key={s} className={`flex-1 h-1.5 rounded-full transition-all ${s <= step ? 'bg-navy' : 'bg-gray-200'}`} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3 className="font-display text-2xl font-bold text-navy mb-1">Create Account</h3>
                <p className="text-gray-500 text-sm mb-6">Join Maharashtra's civic community</p>

                <div className="space-y-4">
                  <div>
                    <label className="form-label">Full Name *</label>
                    <input className="form-input" placeholder="As per Aadhaar" value={form.full_name} onChange={(e) => upd('full_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Mobile Number *</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-semibold">+91</span>
                      <input className="form-input pl-12" placeholder="10-digit number" inputMode="numeric" value={form.phone} onChange={(e) => upd('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Email (Optional)</label>
                    <input className="form-input" type="email" placeholder="your@email.com" value={form.email} onChange={(e) => upd('email', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Ward / Area</label>
                      <input className="form-input" placeholder="Ward 7, Dharampeth" value={form.ward_constituency} onChange={(e) => upd('ward_constituency', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">District</label>
                      <input className="form-input" placeholder="Nagpur" value={form.district} onChange={(e) => upd('district', e.target.value)} />
                    </div>
                  </div>
                </div>

                <button className="btn-primary w-full mt-6" onClick={sendOTP} disabled={loading}>
                  {loading ? '⏳ Sending...' : <><ArrowRight size={16} /> Continue</>}
                </button>

                <p className="text-center text-gray-400 text-xs mt-4">
                  By registering you agree to our{' '}
                  <a href="#" className="text-navy">Terms of Service</a> and{' '}
                  <a href="#" className="text-navy">Privacy Policy</a>.
                </p>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <button className="flex items-center gap-1 text-sm text-gray-500 mb-4 hover:text-navy" onClick={() => setStep(1)}>
                  <ChevronLeft size={16} /> Back
                </button>
                <h3 className="font-display text-2xl font-bold text-navy mb-1">Verify & Set Password</h3>
                <p className="text-gray-500 text-sm mb-6">OTP sent to <strong>+91-{form.phone}</strong></p>

                <div className="mb-6">
                  <label className="form-label text-center block mb-3">Enter 6-Digit OTP</label>
                  <OTPInput value={otp} onChange={setOtp} />
                  <div className="text-center mt-3">
                    {timer > 0 ? <span className="text-xs text-gray-400">Resend in {timer}s</span>
                      : <button className="text-xs text-navy font-semibold" onClick={sendOTP}>Resend OTP</button>}
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div>
                    <label className="form-label">Create Password *</label>
                    <div className="relative">
                      <input className="form-input pr-12" type={showPass ? 'text' : 'password'} placeholder="Min. 8 characters" value={form.password} onChange={(e) => upd('password', e.target.value)} />
                      <button className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPass(!showPass)}>
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Confirm Password *</label>
                    <input className="form-input" type="password" placeholder="Repeat password" value={form.confirm_password} onChange={(e) => upd('confirm_password', e.target.value)} />
                  </div>
                </div>

                <button className="btn-emerald w-full" onClick={verifyAndRegister} disabled={loading}>
                  {loading ? '⏳ Creating Account...' : <><CheckCircle size={16} /> Create My Account</>}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {step === 1 && (
            <p className="text-center mt-6 text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-navy font-semibold hover:text-gold">Log In</Link>
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
