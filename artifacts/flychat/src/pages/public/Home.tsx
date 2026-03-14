import { Link } from "wouter";
import { ArrowRight, CheckCircle2, MessageSquare, Zap, Target } from "lucide-react";
import { motion } from "framer-motion";
import { PublicLayout } from "@/components/PublicLayout";

export default function Home() {
  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-background pt-24 pb-32">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Background" 
            className="w-full h-full object-cover opacity-15"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/80 to-background"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Built for COD Sellers in MENA
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-7xl font-display font-extrabold text-foreground tracking-tight max-w-4xl mx-auto leading-tight"
          >
            Turn Chats into <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Confirmed COD Orders</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
          >
            The all-in-one platform to capture leads, confirm cash-on-delivery orders, and manage your ecommerce customers right from the chat.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link 
              href="/signup" 
              className="px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg shadow-xl shadow-primary/25 hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
            >
              Start Free Trial <ArrowRight className="w-5 h-5" />
            </Link>
            <a 
              href="#features" 
              className="px-8 py-4 rounded-xl bg-white border-2 border-border text-foreground font-semibold text-lg hover:border-primary/50 hover:bg-secondary transition-all flex items-center justify-center"
            >
              See How It Works
            </a>
          </motion.div>
        </div>

        {/* Dashboard Mockup */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
        >
          <div className="rounded-2xl border border-white/20 bg-white/40 backdrop-blur-xl p-2 shadow-2xl shadow-black/10 ring-1 ring-black/5">
            <img 
              src={`${import.meta.env.BASE_URL}images/dashboard-mockup.png`} 
              alt="FlyChat COD Dashboard" 
              className="w-full h-auto rounded-xl border border-border/50"
            />
          </div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground">Everything you need to scale your COD business</h2>
            <p className="mt-4 text-lg text-muted-foreground">We built FlyChat to solve the exact problems Cash on Delivery sellers face every day.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: MessageSquare, title: "Universal Inbox", desc: "Manage Website Widget, WhatsApp, and Instagram DMs in one unified view." },
              { icon: Zap, title: "1-Click Order Creation", desc: "Create an order directly from the chat window without switching tabs." },
              { icon: Target, title: "Customer CRM", desc: "Know instantly if a chatting customer has bought from you before." }
            ].map((f, i) => (
              <div key={i} className="bg-secondary/50 border border-border rounded-2xl p-8 hover:bg-white hover:shadow-xl transition-all duration-300">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-6">
                  <f.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
