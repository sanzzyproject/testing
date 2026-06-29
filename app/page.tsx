'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Loader2, Globe, AlertCircle, CheckCircle2, History, Trash2, LayoutTemplate, Layers, Cpu, Code, Hexagon } from 'lucide-react';

interface HistoryItem {
  id: string;
  appName: string;
  websiteUrl: string;
  date: number;
  status: string;
  androidUrl?: string | null;
  iosUrl?: string | null;
}

export default function Home() {
  const [appName, setAppName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<any>(null);
  const [isDone, setIsDone] = useState(false);
  
  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Rate limiting state
  const [lastBuildTime, setLastBuildTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

  useEffect(() => {
    // Load history from local storage
    const saved = localStorage.getItem('web2native_history');
    if (saved) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }

    const lastTime = localStorage.getItem('web2native_last_build');
    if (lastTime) {
      setLastBuildTime(Number(lastTime));
    }
  }, []);

  useEffect(() => {
    if (lastBuildTime) {
      const checkRateLimit = () => {
        const timeDiff = Date.now() - lastBuildTime;
        const oneDay = 24 * 60 * 60 * 1000;
        if (timeDiff < oneDay) {
          const remainingMs = oneDay - timeDiff;
          const h = Math.floor(remainingMs / (1000 * 60 * 60));
          const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
          const s = Math.floor((remainingMs % (1000 * 60)) / 1000);
          
          const formatted = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
          setTimeRemaining(formatted);
        } else {
          setTimeRemaining(null);
        }
      };
      
      checkRateLimit();
      const interval = setInterval(checkRateLimit, 1000);
      return () => clearInterval(interval);
    }
  }, [lastBuildTime]);

  const saveHistory = (items: HistoryItem[]) => {
    setHistory(items);
    localStorage.setItem('web2native_history', JSON.stringify(items));
  };

  const updateHistoryItem = (id: string, updates: Partial<HistoryItem>) => {
    setHistory(prev => {
      const newHistory = prev.map(item => item.id === id ? { ...item, ...updates } : item);
      localStorage.setItem('web2native_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const clearHistory = () => {
    if (confirm('Yakin ingin menghapus semua history?')) {
      saveHistory([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName || !websiteUrl) {
      setError('App Name and Website URL are required.');
      return;
    }

    if (lastBuildTime && Date.now() - lastBuildTime < 24 * 60 * 60 * 1000) {
      const remainingMs = 24 * 60 * 60 * 1000 - (Date.now() - lastBuildTime);
      const h = Math.floor(remainingMs / (1000 * 60 * 60));
      const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((remainingMs % (1000 * 60)) / 1000);
      const formatted = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      setError(`Rate limit maksimal riset 1 hari 1 kali. Anda sudah membuat aplikasi hari ini. Tunggu besok (${formatted} lagi) untuk membuat aplikasi baru.`);
      return;
    }
    
    // Ensure URL starts with http:// or https://
    let formattedUrl = websiteUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    setIsLoading(true);
    setError(null);
    setBuildStatus(null);
    setIsDone(false);
    setRequestId(null);
    
    try {
      const response = await fetch('/api/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appName, websiteUrl: formattedUrl }),
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to initiate application build.');
      }
      
      const newId = result.data.requestId;
      setRequestId(newId);
      
      // Update rate limit
      const now = Date.now();
      setLastBuildTime(now);
      localStorage.setItem('web2native_last_build', now.toString());
      
      // Save initial history
      const newItem: HistoryItem = {
        id: newId,
        appName,
        websiteUrl: formattedUrl,
        date: now,
        status: 'PROCESSING'
      };
      saveHistory([newItem, ...history]);
      
    } catch (err: any) {
      setError(err.message || 'System error occurred.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const checkStatus = async () => {
      if (!requestId) return;

      try {
        const response = await fetch(`/api/status?requestId=${requestId}`);
        const result = await response.json();

        if (response.ok && result.success) {
          const data = result.data;
          
          setBuildStatus(data);

          if (data.isDone) {
            setIsDone(true);
            setIsLoading(false);
            clearInterval(interval);
            
            // Update history
            updateHistoryItem(requestId, {
              status: 'DONE',
              androidUrl: data.android_url,
              iosUrl: data.ios_url
            });
          }
        }
      } catch (err) {
        console.error('Failed to check status', err);
      }
    };

    if (requestId && !isDone) {
      // Check immediately, then every 5 seconds
      checkStatus();
      interval = setInterval(checkStatus, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [requestId, isDone]);

  // View renderer
  return (
    <div className="min-h-screen bg-background text-foreground font-sans p-4 md:p-8 flex flex-col items-center">
      
      <header className="w-full max-w-xl mx-auto flex justify-between items-center mb-12 mt-4 px-2">
        <div 
          className="flex items-center gap-3 cursor-pointer group" 
          onClick={() => setShowHistory(false)}
        >
          <Hexagon className="w-8 h-8 text-primary group-hover:-rotate-12 transition-transform drop-shadow" />
          <div className="flex flex-col">
            <span className="font-bold text-lg tracking-tight leading-none">ScrapeNative</span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#FF895D]">Pro</span>
          </div>
        </div>
        
        <button 
           onClick={() => setShowHistory(!showHistory)}
           className="p-2 rounded-full hover:bg-surface transition-colors relative"
           aria-label="History">
           <History className="w-5 h-5 text-primary" />
        </button>
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto flex flex-col gap-8 pb-12 px-2">
        
        <AnimatePresence mode="wait">
          {showHistory ? (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col gap-6"
            >
              <div className="flex justify-between items-center px-2">
                <h2 className="text-2xl font-bold tracking-tight">Recent Builds</h2>
                {history.length > 0 && (
                  <button 
                    onClick={clearHistory}
                    className="text-xs font-semibold text-red-500 hover:text-red-700 bg-[#FFF5F5] px-3 py-1.5 rounded-full transition-colors"
                  >
                    Clear History
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="bg-surface rounded-[24px] p-8 text-center text-gray-500 flex flex-col items-center shadow-sm">
                  <History className="w-8 h-8 mb-4 opacity-50" />
                  <p className="font-medium text-sm">No recent apps compiled yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {history.map((item) => (
                    <div key={item.id} className="bg-surface shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-[20px] p-5 flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-lg leading-tight">{item.appName}</h3>
                          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {item.websiteUrl}
                          </p>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider shadow-sm ${item.status === 'DONE' ? 'bg-[#E5F5EC] text-[#148348]' : 'bg-[#FFEGE5] text-[#FF895D] animate-pulse'}`}>
                          {item.status}
                        </span>
                      </div>
                      
                      <div className="flex gap-2 mt-2">
                        {item.status === 'DONE' ? (
                          <>
                            {item.androidUrl && (
                              <a href={item.androidUrl} target="_blank" rel="noreferrer" className="flex-1 bg-white hover:bg-gray-50 text-primary border border-border shadow-sm px-4 py-2.5 rounded-full text-xs font-bold transition-all text-center flex items-center justify-center gap-2">
                                <Download className="w-4 h-4" /> Android
                              </a>
                            )}
                            {item.iosUrl && (
                              <a href={item.iosUrl} target="_blank" rel="noreferrer" className="flex-1 bg-white hover:bg-gray-50 text-primary border border-border shadow-sm px-4 py-2.5 rounded-full text-xs font-bold transition-all text-center flex items-center justify-center gap-2">
                                <Download className="w-4 h-4" /> iOS
                              </a>
                            )}
                          </>
                        ) : (
                          <div className="w-full bg-white shadow-sm px-4 py-2.5 rounded-full text-xs font-semibold text-gray-500 text-center flex items-center justify-center gap-2 border border-border">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Compiling Platform Packages...
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="builder"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col gap-10"
            >
              <div className="px-2 text-center">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 leading-tight">
                  Unlock native mobile<br/>experiences
                </h1>
                <p className="text-sm text-gray-600 font-medium max-w-sm mx-auto">
                  Easily wrap any responsive website into powerful Android & iOS applications seamlessly. Zero coding.
                </p>
              </div>

              {/* Form Section */}
              <div className="bg-surface rounded-3xl p-3 pb-0 overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.03)] border border-border">
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="appName" className="text-xs font-bold text-gray-500 px-1">App Name</label>
                    <input
                      id="appName"
                      type="text"
                      placeholder="My Premium App"
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      disabled={isLoading || isDone || !!requestId || !!timeRemaining}
                      className="w-full bg-background rounded-2xl px-5 py-4 text-base font-semibold focus:outline-none focus:ring-1 focus:ring-primary shadow-inner transition-all disabled:opacity-60 disabled:bg-gray-100 placeholder:font-normal placeholder:text-gray-400"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="websiteUrl" className="text-xs font-bold text-gray-500 px-1">Website URL</label>
                    <div className="relative">
                      <Globe className="absolute left-5 top-[18px] w-5 h-5 text-gray-400" />
                      <input
                        id="websiteUrl"
                        type="text"
                        placeholder="example.com"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        disabled={isLoading || isDone || !!requestId || !!timeRemaining}
                        className="w-full bg-background rounded-2xl pl-12 pr-5 py-4 text-base font-semibold focus:outline-none focus:ring-1 focus:ring-primary shadow-inner transition-all disabled:opacity-60 disabled:bg-gray-100 placeholder:font-normal placeholder:text-gray-400"
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-start gap-2 text-red-600 bg-[#FFF5F5] border border-red-100 p-3 rounded-2xl text-xs font-medium mt-1"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>{error}</p>
                    </motion.div>
                  )}
                  
                  {timeRemaining && !error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex flex-col items-center justify-center gap-1.5 text-[#FF895D] bg-[#FFF5F0] border border-[#FFD8C9] p-4 rounded-2xl text-xs font-bold mt-1 text-center"
                    >
                      <AlertCircle className="w-5 h-5" />
                      <p>Rate limit maksimal riset 1 hari 1 kali agar spam terhindarkan.<br/>1 orang tidak bisa bikin banyak2. Silahkan tunggu besok (<span className="font-mono text-sm tracking-widest">{timeRemaining}</span> lagi).</p>
                    </motion.div>
                  )}
                </form>

                <div className="bg-background/80 p-6 pt-5 mt-2 rounded-t-[2.5rem]">
                   {!requestId && !isDone && (
                    <button
                      onClick={handleSubmit}
                      disabled={isLoading || !!timeRemaining}
                      className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-4 rounded-full flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-80 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(0,0,0,0.15)] text-[15px]"
                    >
                      {timeRemaining ? (
                        `Limit Tercapai (Tunggu Besok)`
                      ) : isLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Processing Wrap...
                        </>
                      ) : (
                        "Get ScrapeNative Bundle"
                      )}
                    </button>
                  )}

                  <AnimatePresence>
                    {(requestId || isLoading || isDone) && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex flex-col gap-4 overflow-hidden"
                      >
                         <div className="flex items-center justify-between bg-primary text-white p-5 rounded-[24px] shadow-lg mt-2">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Status</span>
                              <span className="text-[15px] font-bold flex items-center gap-2">
                                {isDone ? (
                                  <><CheckCircle2 className="w-4 h-4 text-[#FF895D]" /> Build Completed</>
                                ) : (
                                  <><Loader2 className="w-4 h-4 animate-spin text-[#FF895D]" /> Compiling systems</>
                                )}
                              </span>
                            </div>
                            {!isDone && (
                               <div className="text-right">
                                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-0.5">ETA</span>
                                  <span className="text-[15px] font-semibold">~2 mins</span>
                               </div>
                            )}
                         </div>

                         {buildStatus && (
                            <div className="flex flex-col gap-3 mt-3 bg-surface p-4 rounded-2xl shadow-inner border border-border">
                              <div className="flex justify-between items-center text-xs font-semibold px-2">
                                <span className="text-gray-500">Android Generation</span>
                                <span className={buildStatus.android_status === 'DONE' ? 'text-[#148348]' : 'text-[#FF895D]'}>{buildStatus.android_status || 'WAITING'}</span>
                              </div>
                              <div className="h-px w-full bg-border" />
                              <div className="flex justify-between items-center text-xs font-semibold px-2">
                                <span className="text-gray-500">iOS Generation</span>
                                <span className={buildStatus.ios_status === 'DONE' ? 'text-[#148348]' : 'text-[#FF895D]'}>{buildStatus.ios_status || 'WAITING'}</span>
                              </div>
                            </div>
                         )}

                         {isDone && buildStatus && (
                            <motion.div 
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex flex-col gap-3 mt-4"
                            >
                               {buildStatus.android_url && (
                                <a 
                                  href={buildStatus.android_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="w-full bg-[#FF895D] hover:bg-[#ff7a45] text-white py-4 rounded-full flex items-center justify-center gap-2 transition-all font-bold text-[15px] shadow-[0_8px_20px_rgba(255,137,93,0.3)]"
                                >
                                  <Download className="w-5 h-5" /> Download Android APK
                                </a>
                               )}
                               {buildStatus.ios_url && (
                                <a 
                                  href={buildStatus.ios_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="w-full bg-white hover:bg-gray-50 text-primary border border-border py-4 rounded-full flex items-center justify-center gap-2 transition-all font-bold text-[15px] shadow-sm"
                                >
                                  <Download className="w-5 h-5" /> Download iOS IPA
                                </a>
                               )}

                               <button 
                                 onClick={() => {
                                   setIsDone(false);
                                   setBuildStatus(null);
                                   setRequestId(null);
                                   setAppName('');
                                   setWebsiteUrl('');
                                 }}
                                 className="mt-4 text-xs font-bold text-gray-400 hover:text-primary transition-colors text-center w-full uppercase tracking-wider"
                               >
                                 Start New Wrap
                               </button>
                            </motion.div>
                         )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Documentation Section */}
              <div className="bg-surface rounded-3xl p-6 md:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-border mt-4">
                
                <h3 className="text-xl font-bold mb-8 flex items-center justify-center gap-2">
                  <LayoutTemplate className="w-5 h-5 text-[#FF895D]" /> Documentation
                </h3>
                
                <div className="flex flex-col gap-6">
                  <div className="flex gap-5 items-start">
                    <div className="w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Code className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[15px] font-bold">1. Input Details</h4>
                      <p className="text-xs text-gray-500 mt-1 font-medium leading-relaxed">Enter your app name which will appear on devices. Supply a valid URL. Required to be mobile-friendly for best experience.</p>
                    </div>
                    <div className="hidden sm:flex items-center h-8">
                       <CheckCircle2 className="w-5 h-5 text-[#FF895D]" />
                    </div>
                  </div>

                  <div className="h-px bg-border w-full pl-13 ml-12" />

                  <div className="flex gap-5 items-start">
                    <div className="w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                       <Layers className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[15px] font-bold">2. Native Wrapping</h4>
                      <p className="text-xs text-gray-500 mt-1 font-medium leading-relaxed">We will generate native Android and iOS configurations. A WebToNative module proxies interactions for seamless behavior.</p>
                    </div>
                    <div className="hidden sm:flex items-center h-8">
                       <CheckCircle2 className="w-5 h-5 text-[#FF895D]" />
                    </div>
                  </div>

                  <div className="h-px bg-border w-full pl-13 ml-12" />

                  <div className="flex gap-5 items-start">
                    <div className="w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Cpu className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[15px] font-bold">3. Compilation</h4>
                      <p className="text-xs text-gray-500 mt-1 font-medium leading-relaxed">Cloud runners sign, compile, and prepare both an APK and IPA package containing your optimized wrapper securely.</p>
                    </div>
                    <div className="hidden sm:flex items-center h-8">
                       <CheckCircle2 className="w-5 h-5 text-[#FF895D]" />
                    </div>
                  </div>
                </div>

                <div className="mt-10 pt-6 border-t border-border/50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <div className="flex flex-col gap-1 items-center bg-white p-3 rounded-2xl shadow-sm border border-border">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Language</span>
                        <div className="flex items-center gap-1.5"><Code className="w-3.5 h-3.5 text-primary"/> <span className="font-bold text-xs">TypeScript</span></div>
                     </div>
                     <div className="flex flex-col gap-1 items-center bg-white p-3 rounded-2xl shadow-sm border border-border">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Framework</span>
                        <div className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-primary"/> <span className="font-bold text-xs">Next.js 15</span></div>
                     </div>
                     <div className="flex flex-col gap-1 items-center bg-white p-3 rounded-2xl shadow-sm border border-border">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Styling</span>
                        <div className="flex items-center gap-1.5"><LayoutTemplate className="w-3.5 h-3.5 text-primary"/> <span className="font-bold text-xs">Tailwind</span></div>
                     </div>
                     <div className="flex flex-col gap-1 items-center bg-white p-3 rounded-2xl shadow-sm border border-border">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Rate Limit</span>
                        <div className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-primary"/> <span className="font-bold text-xs text-[#FF895D]">1 / 24hrs</span></div>
                     </div>
                  </div>
                </div>
                
                <div className="mt-8 text-center flex flex-col items-center">
                   <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-400 mb-2">
                     Developer Credit
                   </div>
                   <div className="text-sm font-black text-primary tracking-tight">SANN404 FORUM</div>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
