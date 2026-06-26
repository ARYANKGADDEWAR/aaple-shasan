// src/pages/citizen/SubmitProposal.jsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Brain, CheckCircle, MapPin, FileText, ChevronRight, AlertTriangle, Paperclip, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { proposalsAPI } from '../../utils/api';
import { useAuthStore } from '../../store/authStore';

const PIPELINE_STEPS = [
  { id: 'profanity', label: 'Filtering Profanity & Harmful Content', icon: '🛡️' },
  { id: 'geo', label: 'Extracting Geospatial Data & Ward Boundaries', icon: '🗺️' },
  { id: 'intent', label: 'Parsing Intent & Keyword Classification', icon: '🧠' },
  { id: 'routing', label: 'Routing to Appropriate Department', icon: '🏢' },
];

const DEPT_META = {
  PWD: { label: 'Public Works Dept.', icon: '🏗️', color: 'bg-navy/8 text-navy border-navy/15' },
  NMC: { label: 'Nagpur Municipal Corp.', icon: '🏙️', color: 'bg-amber-100 text-amber-900 border-amber-200' },
  GramPanchayat: { label: 'Gram Panchayat', icon: '🌾', color: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  RevenueDeskTahsildar: { label: 'Revenue / Tahsildar', icon: '📋', color: 'bg-red-100 text-red-900 border-red-200' },
  SDMDesk: { label: 'SDM Desk', icon: '⚖️', color: 'bg-purple-100 text-purple-900 border-purple-200' },
};

const SAMPLE_TEXTS = [
  { lang: 'English', text: 'The road near Sadar bus stand has multiple deep potholes causing accidents. Urgent repair needed before monsoon.' },
  { lang: 'Marathi', text: 'धरमपेठ वार्ड ७ मधील नाल्यामध्ये कचरा साचल्यामुळे पाणी तुंबते. तातडीने साफसफाई व डागडुजी आवश्यक आहे.' },
  { lang: 'Hindi', text: 'वाइफाड गाँव में किसानों के लिए सोलर ड्रिप सिंचाई प्रणाली की आवश्यकता है। भूजल स्तर गिर रहा है।' },
];

export default function SubmitProposal() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const fileRef = useRef();

  const [form, setForm] = useState({
    title: '', region: '', ward: '', district: user?.district || '', taluka: '', pincode: '', description: '', manual_dept: '',
  });
  const [files, setFiles] = useState([]);
  const [stage, setStage] = useState('form'); // 'form' | 'processing' | 'result'
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFiles = (e) => {
    const newFiles = Array.from(e.target.files).filter(f => f.size < 10 * 1024 * 1024);
    if (newFiles.length + files.length > 5) return toast.error('Max 5 files allowed.');
    setFiles(prev => [...prev, ...newFiles]);
  };

  const runPipeline = async () => {
    if (!form.title.trim()) return toast.error('Proposal title is required.');
    if (!form.region.trim()) return toast.error('Region / Ward is required.');
    if (form.description.trim().length < 50) return toast.error('Please describe your proposal in at least 50 characters.');
    if (!user?.aadhaar_verified) return toast.error('Please verify your Aadhaar first to submit proposals.');

    setStage('processing');
    setLoading(true);
    setPipelineStep(0);

    // Animate pipeline steps
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      setPipelineStep(i);
      await new Promise(r => setTimeout(r, 900 + Math.random() * 500));
    }

    try {
      const payload = { ...form };
      const res = await proposalsAPI.submit(payload);
      setResult(res.data);
      setStage('result');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed. Please try again.');
      setStage('form');
      setPipelineStep(-1);
    } finally {
      setLoading(false);
    }
  };

  const dept = result?.data?.proposal?.detected_dept;
  const deptMeta = DEPT_META[dept] || DEPT_META.PWD;
  const classification = result?.data?.ai_classification || {};

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-navy">Submit Developmental Proposal</h1>
        <p className="text-gray-500 text-sm mt-1">Your idea will be AI-classified, community-reviewed, and routed to the right department.</p>
      </div>

      {/* Pipeline progress indicator */}
      {stage !== 'form' && (
        <div className="flex items-center gap-2 text-xs font-semibold">
          {['Draft', 'AI Processing', 'Submitted'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                ${i < (stage === 'result' ? 3 : 2) ? 'bg-navy text-white' : 'bg-gray-200 text-gray-400'}`}>
                {i < (stage === 'result' ? 3 : 2) ? '✓' : i + 1}
              </div>
              <span className={i < (stage === 'result' ? 3 : 2) ? 'text-navy' : 'text-gray-400'}>{s}</span>
              {i < 2 && <ChevronRight size={14} className="text-gray-300" />}
            </div>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── FORM ── */}
        {stage === 'form' && (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <div className="card">
                <h2 className="font-bold text-navy text-sm uppercase tracking-wide mb-4 flex items-center gap-2">
                  <FileText size={15} className="text-gold-dark" /> Proposal Details
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="form-label">Proposal Title <span className="text-red-400">*</span></label>
                    <input className="form-input" value={form.title} onChange={e => upd('title', e.target.value)}
                      placeholder="e.g., Repair of Blocked Drainage — Ward 7 Dharampeth" />
                    <div className="text-right text-[10px] text-gray-400 mt-1">{form.title.length}/500</div>
                  </div>

                  <div>
                    <label className="form-label">Detailed Description <span className="text-red-400">*</span></label>
                    <textarea className="form-input min-h-[130px] resize-y"
                      value={form.description}
                      onChange={e => upd('description', e.target.value)}
                      placeholder="Describe the problem, its impact on the community, and your proposed solution. You can write in English, Marathi (मराठी), or Hindi (हिंदी)..." />
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-[10px] ${form.description.length < 50 ? 'text-red-400' : 'text-emerald-500'}`}>
                        {form.description.length < 50 ? `${50 - form.description.length} more characters needed` : '✓ Minimum length met'}
                      </span>
                      <span className="text-[10px] text-gray-400">{form.description.length} chars</span>
                    </div>
                  </div>

                  {/* Sample texts */}
                  <div className="bg-navy/3 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-2">Quick fill with sample text</p>
                    <div className="flex gap-2 flex-wrap">
                      {SAMPLE_TEXTS.map(s => (
                        <button key={s.lang} onClick={() => upd('description', s.text)}
                          className="text-[11px] px-2.5 py-1 rounded-lg border border-navy/15 text-navy/60 hover:bg-navy hover:text-white transition-all">
                          {s.lang}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h2 className="font-bold text-navy text-sm uppercase tracking-wide mb-4 flex items-center gap-2">
                  <MapPin size={15} className="text-gold-dark" /> Location Details
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="form-label">Region / Area / Street <span className="text-red-400">*</span></label>
                    <input className="form-input" value={form.region} onChange={e => upd('region', e.target.value)}
                      placeholder="e.g., Near Sadar Bus Stand, Dharampeth" />
                  </div>
                  <div>
                    <label className="form-label">Ward / Constituency</label>
                    <input className="form-input" value={form.ward} onChange={e => upd('ward', e.target.value)}
                      placeholder="Ward 7" />
                  </div>
                  <div>
                    <label className="form-label">District</label>
                    <input className="form-input" value={form.district} onChange={e => upd('district', e.target.value)}
                      placeholder="Nagpur" />
                  </div>
                  <div>
                    <label className="form-label">Taluka</label>
                    <input className="form-input" value={form.taluka} onChange={e => upd('taluka', e.target.value)}
                      placeholder="Nagpur (Urban)" />
                  </div>
                  <div>
                    <label className="form-label">Pincode</label>
                    <input className="form-input" value={form.pincode} onChange={e => upd('pincode', e.target.value.replace(/\D/g,'').slice(0,6))}
                      placeholder="440010" inputMode="numeric" />
                  </div>
                </div>
              </div>

              {/* Attachments */}
              <div className="card">
                <h2 className="font-bold text-navy text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Paperclip size={15} className="text-gold-dark" /> Attachments (Optional)
                </h2>
                <p className="text-xs text-gray-500 mb-3">Add photos or documents to support your proposal (max 5 files, 10MB each).</p>
                <div className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
                      <span className="text-gray-600 max-w-24 truncate">{f.name}</span>
                      <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {files.length < 5 && (
                    <button onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-dashed border-navy/20 rounded-lg text-xs text-navy/50 hover:border-navy/40 hover:text-navy transition-all">
                      <Paperclip size={12} /> Add file
                    </button>
                  )}
                  <input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={handleFiles} />
                </div>
              </div>
            </div>

            {/* Right panel */}
            <div className="space-y-4">
              <div className="card">
                <h2 className="font-bold text-navy text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Brain size={15} className="text-gold-dark" /> AI Department Routing
                </h2>
                <p className="text-xs text-gray-500 mb-4">Our AI will automatically detect the right department. You can override below.</p>
                <div>
                  <label className="form-label">Manual Override (Optional)</label>
                  <select className="form-input" value={form.manual_dept} onChange={e => upd('manual_dept', e.target.value)}>
                    <option value="">— Let AI Auto-Detect —</option>
                    <option value="PWD">Public Works Dept. (PWD)</option>
                    <option value="NMC">Nagpur Municipal Corp. (NMC)</option>
                    <option value="GramPanchayat">Gram Panchayat</option>
                    <option value="RevenueDeskTahsildar">Revenue / Tahsildar</option>
                    <option value="SDMDesk">SDM Desk</option>
                  </select>
                </div>

                <div className="mt-4 space-y-2">
                  {Object.entries(DEPT_META).map(([key, meta]) => (
                    <div key={key} className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{meta.icon}</span>
                      <span className="font-medium">{key}:</span>
                      <span className="text-gray-400">{meta.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card bg-amber-50 border-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-amber-900 text-xs mb-1">Submission Guidelines</div>
                    <ul className="text-[11px] text-amber-700/80 space-y-1 list-disc list-inside">
                      <li>Max 3 proposals per day</li>
                      <li>Aadhaar verification required</li>
                      <li>No duplicate proposals in 30 days</li>
                      <li>Must be a genuine civic issue</li>
                      <li>Proposals need 50 votes to reach admin</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button className="btn-primary w-full" onClick={runPipeline} disabled={loading}>
                <Send size={16} /> Submit to AI Routing Engine
              </button>
            </div>
          </motion.div>
        )}

        {/* ── PROCESSING ── */}
        {stage === 'processing' && (
          <motion.div key="processing" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="max-w-lg mx-auto">
            <div className="card text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-navy mx-auto mb-6 flex items-center justify-center">
                <Brain size={32} className="text-gold animate-pulse" />
              </div>
              <h2 className="font-display text-xl font-bold text-navy mb-1">AI Pipeline Processing</h2>
              <p className="text-gray-500 text-sm mb-8">Your proposal is being analyzed by our AI routing engine...</p>

              <div className="space-y-3 text-left">
                {PIPELINE_STEPS.map((step, i) => {
                  const isDone = i < pipelineStep;
                  const isActive = i === pipelineStep;
                  const isPending = i > pipelineStep;
                  return (
                    <motion.div key={step.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: isPending ? 0.4 : 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all
                        ${isDone ? 'bg-emerald-50 border-emerald-200' : isActive ? 'bg-gold/8 border-gold/30' : 'bg-gray-50 border-gray-100'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0
                        ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-gold text-navy' : 'bg-gray-200 text-gray-400'}`}>
                        {isDone ? '✓' : isActive ? <span className="animate-spin inline-block">⟳</span> : step.icon}
                      </div>
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${isDone ? 'text-emerald-700' : isActive ? 'text-navy' : 'text-gray-400'}`}>
                          {step.label}
                        </div>
                      </div>
                      <div className={`text-[10px] font-bold uppercase
                        ${isDone ? 'text-emerald-600' : isActive ? 'text-amber-600' : 'text-gray-400'}`}>
                        {isDone ? 'Done' : isActive ? 'Running' : 'Waiting'}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── RESULT ── */}
        {stage === 'result' && result && (
          <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto space-y-5">
            <div className="card text-center py-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}
                className="w-20 h-20 rounded-full bg-emerald-100 mx-auto mb-4 flex items-center justify-center text-4xl">
                ✅
              </motion.div>
              <h2 className="font-display text-2xl font-bold text-navy mb-2">Proposal Submitted!</h2>
              <p className="text-gray-500 text-sm mb-1">
                Reference: <strong className="text-navy font-mono">{result.data?.proposal?.ref_number}</strong>
              </p>
              <p className="text-gray-400 text-xs">Now visible in the Community Feed for democratic review.</p>
            </div>

            {/* AI Classification result */}
            <div className="card">
              <h3 className="font-bold text-navy text-sm uppercase tracking-wide mb-4 flex items-center gap-2">
                <Brain size={15} className="text-gold-dark" /> AI Classification Results
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-navy/4 rounded-xl p-4">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Routed To</div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-bold ${deptMeta.color}`}>
                    {deptMeta.icon} {dept}
                  </div>
                </div>
                <div className="bg-navy/4 rounded-xl p-4">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">AI Confidence</div>
                  <div className="font-display text-3xl font-bold text-navy">
                    {result.data?.proposal?.ai_confidence}%
                  </div>
                </div>
              </div>

              {/* Confidence bars */}
              {Object.keys(classification).length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-2">Department Probability Distribution</div>
                  {Object.entries(classification).sort((a,b)=>b[1]-a[1]).map(([d, pct]) => (
                    <div key={d}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">{d}</span>
                        <span className="font-bold text-navy">{pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1, delay: 0.3 }}
                          className={`h-full rounded-full ${d === dept ? 'bg-navy' : 'bg-gray-300'}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setStage('form'); setForm({ title:'',region:'',ward:'',district:user?.district||'',taluka:'',pincode:'',description:'',manual_dept:'' }); setResult(null); setPipelineStep(-1); }}
                className="btn-outline flex-1">
                Submit Another
              </button>
              <button onClick={() => navigate('/citizen/feed')} className="btn-primary flex-1">
                View in Community Feed →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
