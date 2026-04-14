import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Bot, Brain, BookOpen, Globe, CheckCircle2, AlertCircle, Loader2, Save } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Data Quality Card ────────────────────────────────────────────────────────
function DataQualitySection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/settings/ai-data-quality")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
      <Loader2 className="w-4 h-4 animate-spin" /> Analyzing your store data…
    </div>
  );
  if (!data) return null;

  const items = [
    {
      label: "Store name configured",
      ok: data.hasStoreName,
      hint: "The AI uses your store name in greetings and order confirmations.",
    },
    {
      label: "AI system prompt set",
      ok: data.hasSystemPrompt,
      hint: "Go to Settings → AI to write your agent persona and instructions.",
    },
    {
      label: `${data.products.active} active product${data.products.active !== 1 ? "s" : ""}`,
      ok: data.products.active > 0,
      hint: "The AI can only sell products that are active.",
    },
    {
      label: `${data.products.withDescription} / ${data.products.total} products have descriptions`,
      ok: data.products.withDescription === data.products.total && data.products.total > 0,
      hint: "Descriptions help the AI answer questions about the product.",
    },
    {
      label: `${data.products.withStock} / ${data.products.total} products have stock set`,
      ok: data.products.withStock === data.products.total && data.products.total > 0,
      hint: "Without stock, the AI cannot warn customers when an item is unavailable.",
    },
    {
      label: "Shipping options configured",
      ok: data.hasShipping,
      hint: "Go to Settings → Shipping to set up delivery options.",
    },
  ];

  const score = items.filter(i => i.ok).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-foreground">Data score: {score}/{items.length}</span>
        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${score === items.length ? "bg-green-500" : score >= 4 ? "bg-yellow-500" : "bg-red-400"}`}
            style={{ width: `${(score / items.length) * 100}%` }}
          />
        </div>
      </div>
      {items.map((item) => (
        <div key={item.label} className="flex items-start gap-3">
          {item.ok
            ? <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            : <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
          <div>
            <p className="text-sm font-medium text-foreground">{item.label}</p>
            {!item.ok && <p className="text-xs text-muted-foreground mt-0.5">{item.hint}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Language Selector ────────────────────────────────────────────────────────
const LANGUAGES = [
  { value: "auto", label: "Auto-detect (recommended)" },
  { value: "ar", label: "Arabic (العربية)" },
  { value: "fr", label: "French (Français)" },
  { value: "en", label: "English" },
  { value: "darija", label: "Darija (دارجة)" },
];

function LanguageSection() {
  const [lang, setLang] = useState("auto");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/api/settings/ai-language")
      .then(d => setLang(d.language || "auto"))
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/settings/ai-language", {
        method: "PATCH",
        body: JSON.stringify({ language: lang }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Controls the language the AI will reply in. "Auto-detect" matches whatever language the customer writes in.
      </p>
      <select
        value={lang}
        onChange={e => setLang(e.target.value)}
        className="w-full sm:w-72 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {LANGUAGES.map(l => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>
      <button
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? "Saved!" : "Save"}
      </button>
    </div>
  );
}

// ─── Rules Section ────────────────────────────────────────────────────────────
function RulesSection() {
  const [rules, setRules] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/api/settings/ai-rules")
      .then(d => setRules(d.rules || ""))
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/settings/ai-rules", {
        method: "PATCH",
        body: JSON.stringify({ rules }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Add explicit rules the AI must always follow. One rule per line. These are injected at the top of every AI prompt.
      </p>
      <div className="text-xs text-muted-foreground bg-secondary/50 border border-border rounded-lg px-3 py-2 space-y-0.5">
        <p className="font-medium text-foreground mb-1">Examples:</p>
        <p>• Never offer discounts unless the customer asks</p>
        <p>• Always confirm the wilaya before quoting shipping price</p>
        <p>• Do not discuss competitor products</p>
        <p>• If a product is out of stock, offer a substitute if available</p>
      </div>
      <textarea
        value={rules}
        onChange={e => setRules(e.target.value)}
        rows={7}
        placeholder="Enter your AI rules here, one per line…"
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none font-mono"
      />
      <button
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? "Saved!" : "Save rules"}
      </button>
    </div>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorksSection() {
  const steps = [
    {
      n: "1",
      title: "Customer sends a message",
      body: "When a customer writes on WhatsApp, Instagram, or Messenger, FlyChat receives the message instantly via webhooks.",
    },
    {
      n: "2",
      title: "AI reads the conversation context",
      body: "The AI reads the full conversation history, your product catalog, recent orders, and your system prompt before composing a reply.",
    },
    {
      n: "3",
      title: "AI extracts an order if one is detected",
      body: "When a customer confirms a purchase, the AI fills in a structured order: product, quantity, wilaya, address, and phone number.",
    },
    {
      n: "4",
      title: "Order is created in your dashboard",
      body: "The order appears instantly in Orders. If Shopify sync is enabled, it is also pushed to your Shopify store.",
    },
    {
      n: "5",
      title: "Handoff to human when needed",
      body: "If the AI cannot handle a request, or if a customer asks for a human, the conversation is escalated and your team is notified by email.",
    },
  ];

  return (
    <div className="space-y-4">
      {steps.map(s => (
        <div key={s.n} className="flex gap-3">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
            {s.n}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{s.title}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{s.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AiSettings() {
  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" /> AI Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure how your AI agent behaves across all channels.
            </p>
          </div>

          <Section icon={BookOpen} title="How It Works">
            <HowItWorksSection />
          </Section>

          <Section icon={Brain} title="AI Rules">
            <RulesSection />
          </Section>

          <Section icon={Globe} title="Reply Language">
            <LanguageSection />
          </Section>

          <Section icon={CheckCircle2} title="Data Quality">
            <DataQualitySection />
          </Section>
        </div>
      </div>
    </AppLayout>
  );
}
