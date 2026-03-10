import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { 
  Mic, MicOff, Languages, BookOpen, FileText, 
  ChevronRight, Landmark, User, MessageSquare, 
  Settings, History, Info, CheckCircle2, AlertCircle,
  Shield, ShieldCheck, ShieldAlert, Search, ExternalLink,
  Lock, CreditCard, UserCheck, LogOut, LogIn, Clock
} from 'lucide-react';
import { GeminiLiveService } from './services/geminiLiveService';
import { useAudioProcessor } from './hooks/useAudioProcessor';
import { Message, SUPPORTED_LANGUAGES, BANKING_PROCESSES, BankingProcess, Customer } from './types';
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy,
  Timestamp 
} from 'firebase/firestore';

const MOCK_CUSTOMERS: Customer[] = [
  { id: '8829-X', name: 'Elena Rodriguez', accountType: 'Private Banking', status: 'Verified', lastVisit: '2026-02-15' },
  { id: '1102-Y', name: 'Chen Wei', accountType: 'Retail Savings', status: 'Unverified', lastVisit: 'First Visit' },
  { id: '4456-Z', name: 'Amara Okafor', accountType: 'Business Platinum', status: 'Flagged', lastVisit: '2026-03-01' },
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [view, setView] = useState<'dashboard' | 'history'>('dashboard');
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  const [isConnected, setIsConnected] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(SUPPORTED_LANGUAGES[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeProcess, setActiveProcess] = useState<BankingProcess | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [securityAlerts, setSecurityAlerts] = useState<string[]>([]);

  const { startRecording, stopRecording, playAudioChunk } = useAudioProcessor();
  const geminiServiceRef = useRef<GeminiLiveService | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (view === 'history' && user) {
      fetchHistory();
    }
  }, [view, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchHistory = async () => {
    if (!user) return;
    setIsLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'interactions'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(docs);
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsConnected(false);
    geminiServiceRef.current?.disconnect();
    stopRecording();
  };

  const handleConnect = async () => {
    if (isConnected) {
      geminiServiceRef.current?.disconnect();
      stopRecording();
      setIsConnected(false);
      return;
    }

    const service = new GeminiLiveService((message) => {
      if (message.serverContent?.modelTurn) {
        const parts = message.serverContent.modelTurn.parts;
        const audioPart = parts.find(p => p.inlineData);
        const textPart = parts.find(p => p.text);

        if (audioPart?.inlineData?.data) {
          playAudioChunk(audioPart.inlineData.data);
        }

        if (textPart?.text) {
          // Parse translation and response from text
          const text = textPart.text;
          const translationMatch = text.match(/\[TRANSLATION\]:\s*(.*)/i);
          const responseMatch = text.match(/\[RESPONSE\]:\s*(.*)/is);
          
          const translation = translationMatch ? translationMatch[1].trim() : undefined;
          const response = responseMatch ? responseMatch[1].trim() : text;

          addMessage('model', response, translation);
        }
      }
    });

    try {
      await service.connect(selectedLanguage.name);
      geminiServiceRef.current = service;
      setIsConnected(true);
      
      await startRecording((base64) => {
        service.sendAudio(base64);
      });
      
      addMessage('system', `Connected. Assistant is ready in ${selectedLanguage.name}.`);
    } catch (err) {
      console.error("Failed to connect:", err);
      addMessage('system', "Connection failed. Please check your microphone and API key.");
    }
  };

  const addMessage = (role: 'user' | 'model' | 'system', text: string, translation?: string) => {
    const isSensitive = text.toLowerCase().includes('password') || 
                        text.toLowerCase().includes('pin') || 
                        text.toLowerCase().includes('cvv') ||
                        text.toLowerCase().includes('social security');

    if (isSensitive) {
      setSecurityAlerts(prev => [...new Set([...prev, "Sensitive data detected in conversation"])]);
    }

    const newMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role,
      text,
      translation,
      timestamp: new Date(),
      isSensitive
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const toggleStep = (stepLabel: string) => {
    setCompletedSteps(prev => 
      prev.includes(stepLabel) ? prev.filter(s => s !== stepLabel) : [...prev, stepLabel]
    );
  };

  const generateSummary = async () => {
    const interactionText = messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'Customer/Staff' : 'Assistant'}: ${m.text}`)
      .join('\n');
    
    const summaryText = `
# Interaction Audit Report
**Reference ID:** ${Math.random().toString(36).substring(2, 10).toUpperCase()}
**Date:** ${new Date().toLocaleString()}
**Branch:** Downtown Global Branch
**Staff ID:** ${user?.email || 'ST-9921'}

## 1. Customer Context
- **Name:** ${activeCustomer?.name || 'Anonymous / Walk-in'}
- **Account ID:** ${activeCustomer?.id || 'N/A'}
- **Language:** ${selectedLanguage.name}

## 2. Process Compliance
- **Process Type:** ${activeProcess?.name || 'General Inquiry'}
- **Completion Rate:** ${completedSteps.length} / ${activeProcess?.steps.length || 0}
- **Mandatory Steps Completed:** ${activeProcess?.steps.filter(s => s.required && completedSteps.includes(s.label)).length || 0} / ${activeProcess?.steps.filter(s => s.required).length || 0}

## 3. Security & Sensitivity
- **Sensitive Data Flags:** ${securityAlerts.length > 0 ? 'YES' : 'NONE'}
- **Alerts:** ${securityAlerts.join(', ') || 'None'}

## 4. Full Interaction Transcript
\`\`\`text
${interactionText}
\`\`\`

---
*This report is generated for internal compliance and audit purposes.*
    `;
    setSummary(summaryText);
    setIsSummaryOpen(true);

    // Save to Firebase
    if (user) {
      try {
        await addDoc(collection(db, 'interactions'), {
          userId: user.uid,
          customerName: activeCustomer?.name || 'Anonymous',
          language: selectedLanguage.name,
          process: activeProcess?.name || 'General Inquiry',
          summary: summaryText,
          createdAt: Timestamp.now()
        });
      } catch (err) {
        console.error("Error saving to Firebase:", err);
      }
    }
  };

  const handleCustomerSearch = () => {
    const found = MOCK_CUSTOMERS.find(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.id.includes(searchQuery));
    if (found) {
      setActiveCustomer(found);
      addMessage('system', `Customer Profile Loaded: ${found.name}`);
    } else {
      addMessage('system', "No customer found with that ID or Name.");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-[40px] p-12 shadow-2xl border border-[#1A1A1A]/5 text-center"
        >
          <div className="w-20 h-20 bg-[#5A5A40] rounded-full flex items-center justify-center text-white mx-auto mb-8 shadow-xl shadow-[#5A5A40]/20">
            <Landmark size={40} />
          </div>
          <h1 className="text-3xl font-bold mb-2">Frontline Desk</h1>
          <p className="text-[#1A1A1A]/50 mb-10">Secure Multilingual Banking Assistant</p>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-[#4A4A30] transition-all shadow-lg shadow-[#5A5A40]/10"
          >
            <LogIn size={20} />
            Sign in with Google
          </button>

          <p className="mt-6 text-[10px] text-[#1A1A1A]/40 leading-relaxed">
            If the login popup doesn't appear or shows an error, please try 
            <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="text-[#5A5A40] font-bold underline ml-1">
              opening the app in a new tab
            </a>.
          </p>
          
          <div className="mt-10 pt-8 border-t border-[#1A1A1A]/5 flex items-center justify-center gap-6 text-[#1A1A1A]/30">
            <Shield size={20} />
            <Lock size={20} />
            <UserCheck size={20} />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-sans selection:bg-[#5A5A40]/20">
      {/* Header */}
      <header className="border-b border-[#1A1A1A]/10 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
              <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center text-white">
                <Landmark size={22} />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Frontline Desk</h1>
                <p className="text-[10px] text-[#1A1A1A]/50 uppercase tracking-widest font-bold">Global Branch Support</p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1 bg-[#F5F5F0] p-1 rounded-xl border border-[#1A1A1A]/5">
              <button 
                onClick={() => setView('dashboard')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${view === 'dashboard' ? 'bg-white shadow-sm text-[#5A5A40]' : 'text-[#1A1A1A]/40 hover:text-[#1A1A1A]'}`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setView('history')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${view === 'history' ? 'bg-white shadow-sm text-[#5A5A40]' : 'text-[#1A1A1A]/40 hover:text-[#1A1A1A]'}`}
              >
                History
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {view === 'dashboard' && (
              <div className="flex items-center gap-2 bg-[#F5F5F0] px-4 py-2 rounded-full border border-[#1A1A1A]/5">
                <Languages size={16} className="text-[#5A5A40]" />
                <select 
                  value={selectedLanguage.code}
                  onChange={(e) => setSelectedLanguage(SUPPORTED_LANGUAGES.find(l => l.code === e.target.value)!)}
                  className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer"
                  disabled={isConnected}
                >
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="flex items-center gap-3 pl-4 border-l border-[#1A1A1A]/10">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold">{user.displayName}</p>
                <p className="text-[10px] text-[#1A1A1A]/40">{user.email}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2.5 bg-white border border-[#1A1A1A]/10 rounded-xl text-[#1A1A1A]/40 hover:text-red-500 hover:border-red-100 transition-all"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {view === 'dashboard' ? (
        <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Customer & Interaction */}
          <div className="lg:col-span-8 space-y-6 flex flex-col h-[calc(100vh-12rem)]">
            {/* Customer Profile Bar */}
            <div className="bg-white rounded-3xl border border-[#1A1A1A]/10 p-4 shadow-sm flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1A1A1A]/30" size={18} />
                <input 
                  type="text" 
                  placeholder="Search Customer by Name or ID..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomerSearch()}
                  className="w-full bg-[#F5F5F0] border-none rounded-2xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#5A5A40]/20 outline-none"
                />
              </div>
              {activeCustomer ? (
                <div className="flex items-center gap-4 px-4 border-l border-[#1A1A1A]/10">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${activeCustomer.status === 'Verified' ? 'bg-green-500' : activeCustomer.status === 'Flagged' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                    <span className="text-sm font-semibold">{activeCustomer.name}</span>
                  </div>
                  <span className="text-xs bg-[#5A5A40]/10 text-[#5A5A40] px-2 py-1 rounded-lg font-medium">{activeCustomer.accountType}</span>
                  <button onClick={() => setActiveCustomer(null)} className="text-[#1A1A1A]/30 hover:text-red-500 transition-colors">
                    <Settings size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[#1A1A1A]/40 text-xs font-medium px-4">
                  <User size={14} />
                  No Customer Selected
                </div>
              )}
            </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare size={20} className="text-[#5A5A40]" />
              Live Interaction Log
            </h2>
            <div className="flex items-center gap-4">
              {securityAlerts.length > 0 && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-100 animate-pulse">
                  <ShieldAlert size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Security Alert</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></span>
                <span className="text-xs font-medium text-[#1A1A1A]/60 uppercase tracking-wider">
                  {isConnected ? 'System Active' : 'System Standby'}
                </span>
              </div>
            </div>
          </div>

          <div 
            ref={scrollRef}
            className="flex-1 bg-white rounded-3xl border border-[#1A1A1A]/10 shadow-sm overflow-y-auto p-6 space-y-6 scroll-smooth"
          >
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <div className="w-16 h-16 bg-[#F5F5F0] rounded-full flex items-center justify-center mb-4">
                  <Info size={32} />
                </div>
                <p className="max-w-xs">Start a session to begin real-time translation and banking support.</p>
              </div>
            )}
            
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] rounded-2xl p-4 ${
                    msg.role === 'user' 
                    ? 'bg-[#5A5A40] text-white rounded-tr-none' 
                    : msg.role === 'system'
                    ? 'bg-[#F5F5F0] text-[#1A1A1A]/60 text-sm border border-[#1A1A1A]/5 italic'
                    : 'bg-white border border-[#1A1A1A]/10 shadow-sm rounded-tl-none'
                  } ${msg.isSensitive ? 'border-red-500 ring-1 ring-red-500/20' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-tighter opacity-60">
                        {msg.role === 'user' ? 'Staff/Customer' : msg.role === 'model' ? 'AI Assistant' : 'System'}
                      </span>
                      <span className="text-[10px] opacity-40">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {msg.isSensitive && <ShieldAlert size={12} className="text-red-500" />}
                    </div>
                    <p className="text-sm leading-relaxed">
                      {msg.isSensitive ? '•••••••••••• (Sensitive Data Masked)' : msg.text}
                    </p>
                    {msg.translation && !msg.isSensitive && (
                      <div className="mt-2 pt-2 border-t border-black/10">
                        <p className="text-xs font-medium opacity-70 italic">{msg.translation}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          
          <div className="mt-4 flex gap-3">
            <button 
              onClick={generateSummary}
              className="flex-1 bg-white border border-[#1A1A1A]/10 py-3 rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-[#F5F5F0] transition-colors"
            >
              <FileText size={18} />
              Generate Compliance Audit Report
            </button>
          </div>
        </div>

        {/* Right Column: Tools & Guidance */}
        <div className="lg:col-span-4 space-y-6">
          {/* Process Guidance */}
          <section className="bg-white rounded-3xl border border-[#1A1A1A]/10 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-semibold flex items-center gap-2">
                <BookOpen size={18} className="text-[#5A5A40]" />
                Compliance Guidance
              </h3>
              {activeProcess && (
                <button onClick={() => setActiveProcess(null)} className="text-xs text-[#1A1A1A]/40 hover:text-[#5A5A40]">Reset</button>
              )}
            </div>
            
            {!activeProcess ? (
              <div className="space-y-3">
                {BANKING_PROCESSES.map(process => (
                  <button
                    key={process.id}
                    onClick={() => {
                      setActiveProcess(process);
                      setCompletedSteps([]);
                    }}
                    className="w-full text-left p-4 rounded-2xl border border-[#1A1A1A]/5 hover:bg-[#F5F5F0] transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{process.name}</span>
                      <ChevronRight size={14} className="text-[#1A1A1A]/30 group-hover:translate-x-1 transition-transform" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A]/40">{process.category}</span>
                  </button>
                ))}
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="bg-[#F5F5F0] rounded-2xl p-4">
                  <h4 className="text-sm font-bold mb-1">{activeProcess.name}</h4>
                  <p className="text-[10px] text-[#1A1A1A]/50 uppercase tracking-widest">{activeProcess.category} Protocol</p>
                </div>

                <div className="space-y-4">
                  {activeProcess.steps.map((step, idx) => (
                    <div 
                      key={idx}
                      onClick={() => toggleStep(step.label)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        completedSteps.includes(step.label) 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-white border-[#1A1A1A]/10 hover:border-[#5A5A40]'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-1">
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${
                          completedSteps.includes(step.label) ? 'bg-green-500' : 'border border-[#1A1A1A]/20'
                        }`}>
                          {completedSteps.includes(step.label) && <CheckCircle2 size={10} className="text-white" />}
                        </div>
                        <span className={`text-xs font-semibold ${completedSteps.includes(step.label) ? 'text-green-700' : ''}`}>
                          {step.label}
                          {step.required && <span className="text-red-500 ml-1">*</span>}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#1A1A1A]/50 ml-7">{step.description}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </section>

          {/* Security Status */}
          <section className="bg-[#1A1A1A] text-white rounded-3xl p-6 shadow-xl">
            <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
              <Shield size={18} className="text-green-400" />
              Security & Compliance
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="opacity-60">Voice Encryption</span>
                <span className="text-green-400 font-mono">ACTIVE</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="opacity-60">PII Masking</span>
                <span className="text-green-400 font-mono">ENABLED</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="opacity-60">Audit Logging</span>
                <span className="text-green-400 font-mono">STREAMING</span>
              </div>
              
              {securityAlerts.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">Active Alerts</p>
                  {securityAlerts.map((alert, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] bg-red-500/20 text-red-200 p-2 rounded-lg">
                      <ShieldAlert size={12} />
                      {alert}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
      ) : (
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold">Interaction History</h2>
              <p className="text-sm text-[#1A1A1A]/50">Review past multilingual banking sessions</p>
            </div>
            <button 
              onClick={fetchHistory}
              className="p-2 bg-white border border-[#1A1A1A]/10 rounded-xl hover:bg-[#F5F5F0] transition-all"
            >
              <History size={20} className={isLoadingHistory ? 'animate-spin' : ''} />
            </button>
          </div>

          {isLoadingHistory ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-64 bg-white rounded-3xl border border-[#1A1A1A]/5 animate-pulse"></div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="bg-white rounded-[40px] p-20 text-center border border-[#1A1A1A]/5">
              <div className="w-20 h-20 bg-[#F5F5F0] rounded-full flex items-center justify-center mx-auto mb-6 text-[#1A1A1A]/20">
                <Clock size={40} />
              </div>
              <h3 className="text-xl font-bold mb-2">No History Found</h3>
              <p className="text-[#1A1A1A]/50">Your completed banking sessions will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {history.map((item) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-3xl border border-[#1A1A1A]/10 p-6 shadow-sm hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40] bg-[#5A5A40]/5 px-2 py-1 rounded-lg">
                      {item.process}
                    </span>
                    <span className="text-[10px] text-[#1A1A1A]/30">
                      {item.createdAt?.toDate().toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="text-lg font-bold mb-1">{item.customerName}</h4>
                  <div className="flex items-center gap-2 text-xs text-[#1A1A1A]/50 mb-6">
                    <Languages size={12} />
                    {item.language}
                  </div>
                  <button 
                    onClick={() => {
                      setSummary(item.summary);
                      setIsSummaryOpen(true);
                    }}
                    className="w-full py-3 bg-[#F5F5F0] rounded-2xl text-sm font-semibold group-hover:bg-[#5A5A40] group-hover:text-white transition-all flex items-center justify-center gap-2"
                  >
                    <FileText size={16} />
                    View Audit Report
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* Summary Modal */}
      <AnimatePresence>
        {isSummaryOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSummaryOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 border-b border-[#1A1A1A]/10 flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Interaction Summary</h2>
                <button onClick={() => setIsSummaryOpen(false)} className="p-2 hover:bg-[#F5F5F0] rounded-full transition-colors">
                  <Settings size={20} />
                </button>
              </div>
              <div className="p-8 overflow-y-auto flex-1 bg-[#F5F5F0]/50">
                <div className="markdown-body">
                  <Markdown>{summary}</Markdown>
                </div>
              </div>
              <div className="p-8 border-t border-[#1A1A1A]/10 flex gap-4">
                <button 
                  onClick={() => {
                    const blob = new Blob([summary], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `banking-summary-${new Date().toISOString().split('T')[0]}.txt`;
                    a.click();
                  }}
                  className="flex-1 bg-[#5A5A40] text-white py-4 rounded-2xl font-medium hover:bg-[#4A4A30] transition-colors"
                >
                  Download Summary
                </button>
                <button 
                  onClick={() => setIsSummaryOpen(false)}
                  className="flex-1 bg-[#F5F5F0] text-[#1A1A1A] py-4 rounded-2xl font-medium hover:bg-[#E5E5E0] transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
