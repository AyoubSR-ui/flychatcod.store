import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SCENES = [
  { id: 0, duration: 3000 },
  { id: 1, duration: 4000 },
  { id: 2, duration: 4000 },
  { id: 3, duration: 4000 },
  { id: 4, duration: 5000 },
];

const sharedTransition = {
  duration: 0.6,
  ease: [0.16, 1, 0.3, 1],
};

const TypewriterText = ({ text, delay = 0, className = "" }: { text: string, delay?: number, className?: string }) => {
  const characters = text.split("");
  
  return (
    <span className={className}>
      {characters.map((char, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.05, delay: delay + index * 0.03 }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
};

export default function WidgetGuideVideo() {
  const [currentScene, setCurrentScene] = useState(0);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const playScene = () => {
      timeout = setTimeout(() => {
        setCurrentScene((prev) => (prev + 1) % SCENES.length);
      }, SCENES[currentScene].duration);
    };
    
    playScene();
    
    return () => clearTimeout(timeout);
  }, [currentScene]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
      `}</style>
      
      <AnimatePresence mode="wait">
        {currentScene === 0 && (
          <motion.div
            key="scene-0"
            className="absolute inset-0 flex flex-col items-center justify-center p-8"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
            transition={sharedTransition}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, ...sharedTransition }}
              className="text-center mb-8"
            >
              <div className="flex items-center justify-center mb-4 text-[#2563EB]">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <h1 className="text-4xl font-bold mb-2">Website Widget</h1>
              <p className="text-xl text-slate-500">Connect your store in seconds.</p>
            </motion.div>

            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, ...sharedTransition }}
              className="relative"
            >
              <motion.div
                animate={{
                  boxShadow: ["0px 0px 0px 0px rgba(37, 99, 235, 0)", "0px 0px 40px 10px rgba(37, 99, 235, 0.2)", "0px 0px 0px 0px rgba(37, 99, 235, 0)"]
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 rounded-2xl"
              />
              <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 w-80 relative z-10">
                <div className="h-4 w-24 bg-slate-200 rounded mb-4" />
                <div className="h-3 w-full bg-slate-100 rounded mb-2" />
                <div className="h-3 w-4/5 bg-slate-100 rounded mb-6" />
                <div className="h-10 w-full bg-[#2563EB] rounded-lg" />
              </div>
            </motion.div>
          </motion.div>
        )}

        {currentScene === 1 && (
          <motion.div
            key="scene-1"
            className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[#0F172A]"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            transition={sharedTransition}
          >
            <motion.div 
              className="bg-[#1E293B] p-6 rounded-xl w-full max-w-lg border border-slate-700 shadow-2xl relative"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, ...sharedTransition }}
            >
              <div className="flex space-x-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <pre className="text-sm font-mono text-emerald-400 overflow-hidden">
                <code>
                  <TypewriterText text={`<script src="https://widget.flychat.dz/embed.js"\n  data-store="YOUR-STORE-ID">\n</script>`} delay={0.5} />
                </code>
              </pre>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 2.5 }}
                className="absolute top-4 right-4"
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ delay: 2.8, duration: 0.5 }}
                  className="bg-[#2563EB] text-white px-3 py-1 rounded-md text-xs font-semibold flex items-center shadow-lg"
                >
                  <span className="mr-1">Copied</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </motion.div>
              </motion.div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              className="mt-8 text-white text-xl font-medium"
            >
              Paste before &lt;/body&gt;
            </motion.div>
          </motion.div>
        )}

        {currentScene === 2 && (
          <motion.div
            key="scene-2"
            className="absolute inset-0 flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={sharedTransition}
          >
            {/* Mock Store Header */}
            <div className="h-16 bg-white border-b border-slate-200 flex items-center px-6 justify-between shrink-0">
              <div className="text-xl font-bold">StoreName</div>
              <div className="flex space-x-4">
                <div className="h-4 w-16 bg-slate-200 rounded" />
                <div className="h-4 w-16 bg-slate-200 rounded" />
              </div>
            </div>

            {/* Mock Store Content */}
            <div className="flex-1 p-8 flex justify-center items-center">
              <div className="flex w-full max-w-3xl gap-8">
                <div className="w-1/2 bg-white rounded-2xl shadow-sm aspect-square border border-slate-100 flex items-center justify-center p-8">
                  <div className="w-full h-full bg-slate-100 rounded-xl" />
                </div>
                <div className="w-1/2 flex flex-col justify-center space-y-4">
                  <div className="h-8 w-3/4 bg-slate-200 rounded" />
                  <div className="h-6 w-1/4 bg-blue-100 rounded mb-4" />
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-slate-100 rounded" />
                    <div className="h-3 w-5/6 bg-slate-100 rounded" />
                    <div className="h-3 w-4/6 bg-slate-100 rounded" />
                  </div>
                  <div className="h-12 w-full bg-slate-800 rounded-xl mt-4" />
                </div>
              </div>
            </div>

            {/* Widget and Label */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="absolute top-24 right-8 bg-white px-4 py-2 rounded-lg shadow-lg border border-slate-100 text-sm font-semibold text-slate-700 z-20"
            >
              Your customers see this ↓
            </motion.div>

            {/* Chat Bubble */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1, type: "spring", stiffness: 300, damping: 20 }}
              className="absolute bottom-8 right-8 w-16 h-16 bg-[#2563EB] rounded-full shadow-2xl flex items-center justify-center text-white cursor-default z-10"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.8, type: "spring" }}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold"
              >
                1
              </motion.div>
            </motion.div>
          </motion.div>
        )}

        {currentScene === 3 && (
          <motion.div
            key="scene-3"
            className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[#F8FAFC]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={sharedTransition}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-6 bg-white px-5 py-2 rounded-full shadow-sm border border-slate-200 text-[#2563EB] font-bold text-lg"
            >
              Reply from FlyChat Inbox
            </motion.div>

            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
              <div className="bg-[#2563EB] p-4 text-white flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold">FC</div>
                <div>
                  <div className="font-bold text-sm">FlyChat Team</div>
                  <div className="text-xs text-white/80">Typically replies instantly</div>
                </div>
              </div>

              <div className="p-4 space-y-4 bg-slate-50 min-h-[300px] flex flex-col justify-end">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                  className="self-end bg-[#2563EB] text-white p-3 rounded-2xl rounded-tr-sm max-w-[80%] text-sm shadow-sm"
                >
                  Bonjour, je veux commander 2 paires
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ delay: 1.5, duration: 1.5 }}
                  className="self-start bg-white border border-slate-200 text-slate-500 p-3 rounded-2xl rounded-tl-sm text-sm flex space-x-1 items-center shadow-sm"
                >
                  <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                  <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                  <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 3 }}
                  className="self-start bg-white border border-slate-200 text-slate-800 p-3 rounded-2xl rounded-tl-sm max-w-[80%] text-sm shadow-sm flex flex-col"
                >
                  <span>Bien reçu! Je prépare votre commande ✓</span>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}

        {currentScene === 4 && (
          <motion.div
            key="scene-4"
            className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-white"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, filter: "blur(10px)" }}
            transition={sharedTransition}
          >
            <div className="w-full max-w-lg bg-white p-8 rounded-3xl shadow-2xl border border-slate-100">
              <h2 className="text-2xl font-bold mb-6 text-slate-800">Create COD Order</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Customer Name</label>
                  <div className="w-full h-10 border border-slate-200 rounded-lg px-3 flex items-center bg-slate-50 text-sm font-medium">
                    <TypewriterText text="Ahmed Benali" delay={0.5} />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Phone Number</label>
                  <div className="w-full h-10 border border-slate-200 rounded-lg px-3 flex items-center bg-slate-50 text-sm font-medium">
                    <TypewriterText text="0555 12 34 56" delay={1.5} />
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Wilaya</label>
                    <div className="w-full h-10 border border-slate-200 rounded-lg px-3 flex items-center bg-slate-50 text-sm font-medium">
                      <TypewriterText text="16 - Alger" delay={2.5} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Products</label>
                    <div className="w-full h-10 border border-slate-200 rounded-lg px-3 flex items-center bg-slate-50 text-sm font-medium">
                      <TypewriterText text="2x AirMax" delay={3.0} />
                    </div>
                  </div>
                </div>

                <motion.div
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 0.95, 1], backgroundColor: ["#2563EB", "#10B981"] }}
                  transition={{ delay: 3.8, duration: 0.4 }}
                  className="w-full h-12 bg-[#2563EB] text-white rounded-xl mt-6 flex items-center justify-center font-bold shadow-lg shadow-blue-500/30"
                >
                  <motion.span
                    initial={{ opacity: 1 }}
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ delay: 3.8, duration: 0.4 }}
                  >
                    Confirm Order ✓
                  </motion.span>
                </motion.div>
              </div>
            </div>

            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 4.2, type: "spring", stiffness: 200 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none bg-white/80 backdrop-blur-sm z-50"
            >
              <div className="text-4xl font-extrabold text-[#10B981] flex flex-col items-center">
                <span className="text-6xl mb-4">🎉</span>
                FlyChat COD — Done!
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
