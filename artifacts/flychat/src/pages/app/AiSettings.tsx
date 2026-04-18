import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Bot, Brain, BookOpen, Globe, CheckCircle2, AlertCircle, Loader2, Save, RefreshCw, Download, Sparkles, Play } from "lucide-react";
import { DocButton } from "@/components/DocButton";

const API = import.meta.env.VITE_API_URL ?? "";

function getToken() {
  return localStorage.getItem("flychat_token") ?? "";
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
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    apiFetch("/api/settings/ai-rules")
      .then((d: any) => setRules(d.rules || ""))
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      await apiFetch("/api/settings/ai-rules", {
        method: "POST",
        body: JSON.stringify({ rules }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Failed to save rules. Please try again.");
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
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved!" : "Save rules"}
        </button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Rules saved successfully
          </span>
        )}
        {saveError && (
          <span className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {saveError}
          </span>
        )}
      </div>
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

// ─── Training Data Section ────────────────────────────────────────────────────
function TrainingDataSection() {
  const [syncing, setSyncing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [syncResult, setSyncResult] = useState<{ messagesSynced: number; conversationsSynced: number; results?: Record<string, { synced: number; error: string | null }> } | null>(null);
  const [syncError, setSyncError] = useState("");
  const [syncWarning, setSyncWarning] = useState("");

  async function handleExport() {
    setDownloading(true);
    try {
      const res = await fetch(`${API}/api/sync/export-training-data`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "training_data.jsonl";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setDownloading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError("");
    setSyncWarning("");
    try {
      const data = await apiFetch<{ messagesSynced: number; conversationsSynced: number; results?: Record<string, { synced: number; error: string | null }> }>(
        "/api/sync/meta-conversations"
      );
      const failedChannels = Object.entries(data.results ?? {})
        .filter(([, r]) => r.error)
        .map(([ch]) => ch);

      if (data.conversationsSynced > 0 || data.messagesSynced > 0) {
        setSyncResult(data);
        if (failedChannels.length > 0) {
          setSyncWarning(
            `${failedChannels.length} channel(s) had errors (${failedChannels.join(", ")} — token may need reconnecting)`
          );
        }
      } else if (failedChannels.length > 0) {
        setSyncError("Sync failed. Check your Meta channel connections.");
      } else {
        setSyncResult(data);
      }
    } catch {
      setSyncError("Sync failed. Check your Meta channel connections.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Sync your Meta (Messenger/Instagram) conversation history and export it as a JSONL file for fine-tuning a custom AI model on your store's real conversations.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? "Syncing…" : "Sync Meta Conversations"}
        </button>
        <button
          onClick={handleExport}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export Training Data (JSONL)
        </button>
      </div>
      {syncResult && (
        <div className="space-y-1.5">
          <p className="text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="inline w-4 h-4 mr-1" />
            ✅ Synced {syncResult.messagesSynced} messages from {syncResult.conversationsSynced} conversations
          </p>
          {syncWarning && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="inline w-4 h-4 mr-1" />
              ⚠️ {syncWarning}
            </p>
          )}
          {syncResult.results && Object.entries(syncResult.results).map(([ch, r]) => (
            <p key={ch} className={`text-xs ${r.error ? "text-destructive" : "text-muted-foreground"}`}>
              {r.error
                ? <><AlertCircle className="inline w-3 h-3 mr-1" />{ch}: {r.error}</>
                : <><CheckCircle2 className="inline w-3 h-3 mr-1" />{ch}: {r.synced} messages synced</>
              }
            </p>
          ))}
        </div>
      )}
      {syncError && (
        <p className="text-sm text-destructive">
          <AlertCircle className="inline w-4 h-4 mr-1" />
          {syncError}
        </p>
      )}
    </div>
  );
}

// ─── Communication Optimizer Section ─────────────────────────────────────────
function OptimizerSection() {
  const [status, setStatus] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [runError, setRunError] = useState("");

  useEffect(() => {
    apiFetch("/api/analytics/optimizer/status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  async function handleRun() {
    setRunning(true);
    setRunError("");
    try {
      const result = await apiFetch("/api/analytics/optimizer/run", { method: "POST" });
      if (result.status === "no_data") {
        setRunError("No qualifying conversations found in the last 30 days.");
      } else {
        const updated = await apiFetch("/api/analytics/optimizer/status");
        setStatus(updated);
      }
    } catch {
      setRunError("Analysis failed. Try again later.");
    } finally {
      setRunning(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await apiFetch("/api/analytics/optimizer/approve", { method: "POST" });
      const updated = await apiFetch("/api/analytics/optimizer/status");
      setStatus(updated);
    } catch {
      // silent
    } finally {
      setApproving(false);
    }
  }

  const lastRun = status?.last_run
    ? new Date(status.last_run).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const avgScore = status?.avg_score != null ? Number(status.avg_score).toFixed(1) : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Analyzes your past conversations using AI and generates communication improvement rules
        that are automatically injected into the agent. Improvements are only applied after you approve them.
      </p>

      {status && (
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 space-y-1.5 text-sm">
          {lastRun && (
            <p className="text-muted-foreground">
              Last run: <span className="text-foreground font-medium">{lastRun}</span>
              {status.analyzed_count > 0 && (
                <> · Analyzed: <span className="text-foreground font-medium">{status.analyzed_count} conversations</span></>
              )}
            </p>
          )}
          {avgScore && (
            <p className="text-muted-foreground">
              Avg quality score: <span className="text-foreground font-medium">{avgScore}/10</span>
              {status.confidence_score != null && (
                <> · Confidence: <span className="text-foreground font-medium">{Math.round(status.confidence_score * 100)}%</span></>
              )}
            </p>
          )}
          {status.has_approved && !status.has_pending && (
            <p className="text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Improvements approved and active
            </p>
          )}
          {status.has_pending && (
            <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> Improvements pending your approval
            </p>
          )}
          {status.improvement_summary && (
            <p className="text-muted-foreground text-xs pt-1 border-t border-border">
              {status.improvement_summary}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleRun}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Analyzing…" : "Run Analysis"}
        </button>

        {status?.has_pending && (
          <button
            onClick={handleApprove}
            disabled={approving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-green-500 text-green-600 dark:text-green-400 text-sm font-medium hover:bg-green-500/10 disabled:opacity-50 transition-colors"
          >
            {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {approving ? "Approving…" : "Approve Improvements"}
          </button>
        )}
      </div>

      {runError && (
        <p className="text-sm text-destructive flex items-center gap-1">
          <AlertCircle className="w-4 h-4" /> {runError}
        </p>
      )}
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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Bot className="w-6 h-6 text-primary" /> AI Settings
              </h1>
              <DocButton docId="ai-settings" />
            </div>
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

          <Section icon={Download} title="Training Data">
            <TrainingDataSection />
          </Section>

          <Section icon={Sparkles} title="Communication Optimizer">
            <OptimizerSection />
          </Section>
        </div>
      </div>
    </AppLayout>
  );
}
