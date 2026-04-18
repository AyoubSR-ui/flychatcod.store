import { useState } from "react"
import { Link } from "wouter"
import { motion } from "framer-motion"
import {
  ArrowRight, MessageSquare, Bot, Package, Users, TrendingUp, Link2,
  Sparkles, BarChart3, Truck, ShoppingBag, Globe, Users2, Shield,
  Download, MonitorSmartphone, CreditCard, Zap, RefreshCw, Building2,
  Check, ChevronDown, ChevronUp, Play,
} from "lucide-react"
import { PublicLayout } from "@/components/PublicLayout"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.55, delay },
})

// ─── Features data ────────────────────────────────────────────────────────────
const FEATURES = [
  // Core
  { icon: MessageSquare, emoji: "📥", name: "Unified Inbox", desc: "All WhatsApp, Messenger and Instagram DMs in one place", doc: "inbox", color: "blue" },
  { icon: Bot, emoji: "🤖", name: "AI Sales Agent", desc: "Replies in Algerian darija automatically, 24/7", doc: "ai-agent", color: "violet" },
  { icon: Package, emoji: "📦", name: "Order Management", desc: "Create, track and manage COD orders directly from chat", doc: "orders", color: "orange" },
  { icon: Users, emoji: "👥", name: "Customer Profiles", desc: "Auto-built from conversations with full history", doc: "customers", color: "green" },
  // Intelligence
  { icon: TrendingUp, emoji: "📊", name: "Lead Intelligence", desc: "Real-time funnel showing who's a serious buyer", doc: "lead-intelligence", color: "sky" },
  { icon: Link2, emoji: "🎯", name: "Ad Links", desc: "Track which Facebook ad each conversation came from", doc: "ad-links", color: "pink" },
  { icon: Sparkles, emoji: "🧠", name: "Communication Optimizer", desc: "AI learns from your conversations and improves itself", doc: "communication-optimizer", color: "purple" },
  { icon: BarChart3, emoji: "📈", name: "Analytics Dashboard", desc: "Conversion rates, drop-off points and top performing ads", doc: "lead-intelligence", color: "emerald" },
  // Operations
  { icon: Truck, emoji: "🚚", name: "Shipping Calculator", desc: "Automatic delivery prices for all 58 wilayas", doc: "shipping", color: "yellow" },
  { icon: ShoppingBag, emoji: "🛍️", name: "Product Catalog", desc: "Manage products with AI-suggested images per color", doc: "products", color: "red" },
  { icon: Globe, emoji: "🔗", name: "Shopify Integration", desc: "Sync orders and products with your Shopify store", doc: "channels", color: "green" },
  { icon: Users2, emoji: "👤", name: "Team Management", desc: "Assign conversations, manage agent roles and access", doc: "team", color: "blue" },
  // AI & Settings
  { icon: Shield, emoji: "⚙️", name: "AI Rules", desc: "Set custom rules your AI agent must always follow", doc: "ai-settings", color: "slate" },
  { icon: Globe, emoji: "🌐", name: "Language Settings", desc: "Control AI reply language per channel", doc: "ai-settings", color: "cyan" },
  { icon: Download, emoji: "🎓", name: "Training Data Export", desc: "Export conversations as JSONL fine-tuning data", doc: "ai-settings", color: "violet" },
  { icon: MonitorSmartphone, emoji: "📱", name: "Website Widget", desc: "Add a chat widget to your website instantly", doc: "widget", color: "orange" },
  // Billing & Growth
  { icon: CreditCard, emoji: "💳", name: "Plans & Billing", desc: "Free, Starter, Pro and Agency plans", doc: "billing", color: "indigo" },
  { icon: Zap, emoji: "🔔", name: "Automation", desc: "Auto-assign, auto-escalate and auto-archive rules", doc: "automation", color: "amber" },
  { icon: RefreshCw, emoji: "📢", name: "Meta Sync", desc: "Sync Messenger and Instagram conversation history", doc: "channels", color: "blue" },
  { icon: Building2, emoji: "🏪", name: "Multi-store", desc: "Manage multiple stores from one account", doc: "channels", color: "pink" },
]

const PLANS = [
  { name: "Free", msgs: "20 messages", price: "0", unit: "Free forever", cta: "Get Started", accent: "from-gray-400 to-gray-500", features: ["1 channel", "AI agent", "Orders", "Customers"] },
  { name: "Starter", msgs: "1,500 messages/mo", price: "9,900", unit: "DZD/month", cta: "Start Starter", accent: "from-blue-500 to-cyan-500", features: ["3 channels", "AI agent", "Team (2 agents)", "Analytics", "Ad Links"], popular: false },
  { name: "Pro", msgs: "7,000 messages/mo", price: "24,900", unit: "DZD/month", cta: "Start Pro", accent: "from-primary to-blue-600", features: ["All channels", "AI agent", "Team (5 agents)", "Optimizer", "Shopify sync", "Priority support"], popular: true },
  { name: "Agency", msgs: "15,000 messages/mo", price: "49,900", unit: "DZD/month", cta: "Start Agency", accent: "from-violet-500 to-purple-600", features: ["All channels", "Unlimited agents", "Multi-store", "Custom AI rules", "Training data export", "Dedicated support"] },
]

const FAQS = [
  {
    q: "Does the AI really understand Algerian darija?",
    a: "Yes. The AI is specifically trained for Algerian darija — both Arabic script (دارجة) and Latin darija (wach, 3andi, kifach...). It auto-detects the customer's language and never switches mid-conversation.",
  },
  {
    q: "Which channels does FlyChat COD support?",
    a: "WhatsApp, Facebook Messenger, Instagram DMs, and your own website via the embeddable chat widget. All conversations appear in one unified inbox.",
  },
  {
    q: "Can I use it with Shopify?",
    a: "Yes. Connect your Shopify store from the Channels page. FlyChat COD syncs products, customers and orders automatically between the two platforms.",
  },
  {
    q: "What happens when the AI can't handle a conversation?",
    a: "If a customer asks something outside the AI's scope, or if you have an automation rule to escalate, the conversation is flagged for human review. You take over and reply manually — the AI pauses and waits.",
  },
  {
    q: "Is there a free trial?",
    a: "The Free plan is free forever with 20 AI messages per month — no credit card required. Paid plans come with a 7-day trial.",
  },
]

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400",
  green: "bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-400",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
  pink: "bg-pink-100 text-pink-600 dark:bg-pink-950/50 dark:text-pink-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
  yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-950/50 dark:text-yellow-400",
  red: "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400",
  cyan: "bg-cyan-100 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function SectionHeading({ label, title, sub }: { label?: string; title: string; sub?: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto mb-12">
      {label && (
        <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">{label}</p>
      )}
      <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight">{title}</h2>
      {sub && <p className="mt-4 text-lg text-muted-foreground leading-relaxed">{sub}</p>}
    </div>
  )
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-secondary/50 transition-colors"
      >
        <span className="font-semibold text-foreground pr-4">{q}</span>
        {open ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-6 pb-5">
          <p className="text-muted-foreground leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <PublicLayout>
      {/* SEO */}
      <title>FlyChat COD — AI Sales Agent for Algerian E-Commerce</title>
      <meta name="description" content="Turn WhatsApp, Messenger and Instagram messages into confirmed COD orders. AI-powered sales agent that speaks Algerian darija. Built for Algeria." />

      {/* ── Section 1: Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-32 bg-gradient-to-br from-background via-background to-primary/5">
        {/* Grid decoration */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />
        {/* Glow blob */}
        <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm mb-8 border border-primary/20"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            AI-powered · Built for Algeria · COD-first
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="text-5xl md:text-7xl font-display font-extrabold text-foreground tracking-tight max-w-4xl mx-auto leading-tight"
          >
            Turn Every Message{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-violet-500">
              Into a Sale
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
          >
            FlyChat COD is the AI-powered sales platform for Algerian e-commerce. Manage all your
            conversations, qualify leads, and confirm orders — across WhatsApp, Messenger, and Instagram.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              href="/signup"
              className="px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg shadow-xl shadow-primary/25 hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
            >
              Start Free <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#ai-demo"
              className="px-8 py-4 rounded-xl bg-white/70 backdrop-blur border border-border text-foreground font-semibold text-lg hover:border-primary/50 hover:bg-white transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 text-primary" /> Watch Demo
            </a>
          </motion.div>

          {/* Mockup frame */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-16"
          >
            <div className="rounded-2xl border border-white/20 bg-white/40 backdrop-blur-xl p-2 shadow-2xl shadow-black/10 ring-1 ring-black/5">
              <div className="rounded-xl bg-background border border-border overflow-hidden">
                {/* Fake browser bar */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div className="flex-1 mx-4 bg-secondary rounded-md h-6 flex items-center px-3">
                    <span className="text-xs text-muted-foreground">app.flychatcod.store/inbox</span>
                  </div>
                </div>
                <img
                  src={`${import.meta.env.BASE_URL}images/dashboard-mockup.png`}
                  alt="FlyChat COD Dashboard"
                  className="w-full h-auto"
                  onError={(e) => {
                    // Fallback: show placeholder
                    const target = e.currentTarget.parentElement!
                    target.innerHTML = `<div class="h-64 flex items-center justify-center bg-secondary text-muted-foreground text-sm">Dashboard Preview</div>`
                  }}
                />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Section 2: Social proof bar ───────────────────────────────────── */}
      <section className="py-10 border-y border-border bg-secondary/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-center text-sm font-medium text-muted-foreground mb-6">
            Trusted by COD stores across Algeria
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { n: "972+", label: "Conversations Managed" },
              { n: "75", label: "Qualified Leads" },
              { n: "58", label: "Wilayas Covered" },
              { n: "3", label: "Channels Connected" },
            ].map((s) => (
              <div key={s.n}>
                <p className="text-3xl font-extrabold text-foreground">{s.n}</p>
                <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 3: Problem ────────────────────────────────────────────── */}
      <section className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <motion.div {...fade()}>
            <SectionHeading label="The problem" title="The COD Problem Nobody Talks About" />
          </motion.div>
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              { emoji: "🔁", text: "You reply to hundreds of messages manually every day" },
              { emoji: "❓", text: "You don't know which customers are serious buyers" },
              { emoji: "📦", text: "Orders get lost between conversation and confirmation" },
            ].map((p, i) => (
              <motion.div key={i} {...fade(i * 0.1)}>
                <div className="p-6 rounded-2xl border border-destructive/20 bg-destructive/5 text-center h-full flex flex-col items-center gap-4">
                  <span className="text-4xl">{p.emoji}</span>
                  <p className="text-foreground font-medium leading-relaxed">{p.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <motion.p {...fade(0.3)} className="text-center text-xl font-semibold text-primary">
            FlyChat COD solves all three. →
          </motion.p>
        </div>
      </section>

      {/* ── Section 4: Features Showcase ──────────────────────────────────── */}
      <section id="features" className="py-24 bg-secondary/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div {...fade()}>
            <SectionHeading
              label="Everything you need"
              title="Everything You Need to Sell More"
              sub="Built specifically for COD e-commerce in Algeria"
            />
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              const iconClass = COLOR_MAP[f.color] || COLOR_MAP.blue
              return (
                <motion.div key={i} {...fade(Math.floor(i / 4) * 0.1 + (i % 4) * 0.04)}>
                  <div className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/30 hover:shadow-md transition-all duration-200 h-full flex flex-col">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${iconClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <p className="font-semibold text-foreground text-sm mb-1">{f.name}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed flex-1">{f.desc}</p>
                    <Link
                      href={`/docs/${f.doc}`}
                      className="mt-3 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                    >
                      Learn more <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Section 5: How It Works ────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <motion.div {...fade()}>
            <SectionHeading label="The flow" title="From Ad Click to Confirmed Order" />
          </motion.div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { emoji: "📱", step: "1", title: "Ad Click", desc: "Customer clicks your Facebook ad" },
              { emoji: "💬", step: "2", title: "AI Replies", desc: "Agent replies instantly in darija, 24/7" },
              { emoji: "🎯", step: "3", title: "Lead Qualified", desc: "Lead Intelligence identifies serious buyers" },
              { emoji: "✅", step: "4", title: "Order Confirmed", desc: "Order confirmed and shipped via ZR Express" },
            ].map((s, i) => (
              <motion.div key={i} {...fade(i * 0.12)}>
                <div className="relative p-6 rounded-2xl bg-card border border-border text-center">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {s.step}
                  </div>
                  <span className="text-3xl block mt-2 mb-3">{s.emoji}</span>
                  <p className="font-semibold text-foreground mb-1">{s.title}</p>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 6: Lead Intelligence ──────────────────────────────────── */}
      <section className="py-24 bg-primary/5 border-y border-primary/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <motion.div {...fade()}>
            <SectionHeading label="Lead Intelligence" title="Not All Messages Are Equal" />
          </motion.div>
          <motion.div {...fade(0.1)} className="max-w-3xl mx-auto">
            {/* Funnel bars */}
            <div className="space-y-3 mb-8">
              {[
                { label: "Interested", pct: 77, color: "bg-blue-400" },
                { label: "Engaged", pct: 16, color: "bg-violet-500" },
                { label: "Qualified", pct: 8, color: "bg-primary" },
                { label: "Confirmed", pct: 4, color: "bg-green-500" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-4">
                  <div className="w-24 text-sm font-medium text-foreground text-right shrink-0">{s.label}</div>
                  <div className="flex-1 bg-secondary rounded-full h-8 overflow-hidden">
                    <div
                      className={`h-full ${s.color} rounded-full flex items-center px-3`}
                      style={{ width: `${s.pct}%` }}
                    >
                      <span className="text-white text-xs font-bold">{s.pct}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-lg font-semibold text-muted-foreground">
              Most tools count messages.{" "}
              <span className="text-foreground">FlyChat COD counts buyers.</span>
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Section 7: AI Agent Showcase ──────────────────────────────────── */}
      <section id="ai-demo" className="py-24 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <motion.div {...fade()}>
            <SectionHeading label="AI Agent" title="An AI That Speaks Algerian" />
          </motion.div>
          <div className="grid md:grid-cols-2 gap-10 items-start max-w-4xl mx-auto">
            {/* Chat bubbles */}
            <motion.div {...fade(0.1)} className="space-y-3">
              {/* Customer */}
              <div className="flex justify-end">
                <div className="max-w-[75%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3">
                  <p className="text-sm font-medium" dir="rtl">شحال جلابة؟</p>
                </div>
              </div>
              {/* AI */}
              <div className="flex gap-2 items-end">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="max-w-[80%] bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                  <p className="text-sm" dir="rtl">السعر 3500 دج ✨ كاين توصيل ل58 ولاية. شحال المقاس تاعك؟</p>
                </div>
              </div>
              {/* Customer */}
              <div className="flex justify-end">
                <div className="max-w-[75%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3">
                  <p className="text-sm">3liya L, tawsil l dar lwehrane</p>
                </div>
              </div>
              {/* AI */}
              <div className="flex gap-2 items-end">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="max-w-[80%] bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                  <p className="text-sm">mlih! tawsil l dar Oran = 700 DZD. 3tini smiytek kamla w numéro téléphone.</p>
                </div>
              </div>
            </motion.div>
            {/* Language badges */}
            <motion.div {...fade(0.2)} className="space-y-4">
              <p className="text-foreground font-semibold">Auto-detects and replies in:</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { flag: "🇩🇿", lang: "Arabic Script", example: "وعليكم السلام، كيفاش نعاونك؟" },
                  { flag: "🇩🇿", lang: "Latin Darija", example: "wa3lik salam, kifach n3awnk?" },
                  { flag: "🇫🇷", lang: "French", example: "Bonjour, comment puis-je vous aider?" },
                  { flag: "🔀", lang: "Mixed Darija", example: "mrhba! kayen jalaba M w L" },
                ].map((l) => (
                  <div key={l.lang} className="p-3 bg-card border border-border rounded-xl">
                    <p className="text-xs font-semibold text-foreground mb-1">{l.flag} {l.lang}</p>
                    <p className="text-xs text-muted-foreground italic">"{l.example}"</p>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl">
                <p className="text-sm text-green-800 dark:text-green-300 font-medium">
                  ✓ Never switches language mid-conversation
                </p>
                <p className="text-sm text-green-800 dark:text-green-300">✓ Uses correct Algerian vocabulary, not Moroccan</p>
                <p className="text-sm text-green-800 dark:text-green-300">✓ Gender-aware replies (masculine / feminine)</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Section 8: Pricing ────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-secondary/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fade()}>
            <SectionHeading label="Pricing" title="Start Free, Scale When You're Ready" />
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((plan, i) => (
              <motion.div key={plan.name} {...fade(i * 0.08)}>
                <div className={`relative bg-card border rounded-2xl overflow-hidden h-full flex flex-col ${plan.popular ? "border-primary shadow-xl shadow-primary/10" : "border-border"}`}>
                  {plan.popular && (
                    <div className="bg-primary text-primary-foreground text-xs font-bold text-center py-1.5 tracking-wide">
                      MOST POPULAR
                    </div>
                  )}
                  <div className={`h-1.5 w-full bg-gradient-to-r ${plan.accent}`} />
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-bold text-foreground text-lg mb-1">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground mb-4">{plan.msgs}</p>
                    <div className="mb-4">
                      {plan.price === "0" ? (
                        <p className="text-3xl font-extrabold text-foreground">Free</p>
                      ) : (
                        <>
                          <p className="text-3xl font-extrabold text-foreground">{plan.price}</p>
                          <p className="text-xs text-muted-foreground">{plan.unit}</p>
                        </>
                      )}
                    </div>
                    <ul className="space-y-2 flex-1 mb-5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Check className="w-4 h-4 text-primary shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/signup"
                      className={`block text-center px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                        plan.popular
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                          : "bg-secondary text-foreground hover:bg-primary/10 border border-border hover:border-primary/30"
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 9: FAQ ────────────────────────────────────────────────── */}
      <section className="py-24 bg-background">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <motion.div {...fade()}>
            <SectionHeading label="FAQ" title="Common Questions" />
          </motion.div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <motion.div key={i} {...fade(i * 0.07)}>
                <FaqItem {...faq} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 10: Final CTA ──────────────────────────────────────────── */}
      <section className="py-24 bg-gradient-to-br from-primary/10 via-background to-violet-500/10 border-t border-border">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <motion.div {...fade()}>
            <h2 className="text-4xl font-display font-extrabold text-foreground mb-4">
              Ready to Sell More with AI?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join hundreds of Algerian COD stores already using FlyChat COD.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-10 py-5 rounded-2xl bg-primary text-primary-foreground font-bold text-xl shadow-2xl shadow-primary/30 hover:shadow-3xl hover:-translate-y-1 transition-all"
            >
              Start Free Today <ArrowRight className="w-6 h-6" />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              No credit card required · Free plan available · 7-day trial on paid plans
            </p>
          </motion.div>
        </div>
      </section>
    </PublicLayout>
  )
}
