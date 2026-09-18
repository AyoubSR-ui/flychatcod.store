import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Bot, Brain, BookOpen, Globe, CheckCircle2, AlertCircle, Loader2, Save, RefreshCw, Download, Sparkles, Play } from "lucide-react";
import { DocButton } from "@/components/DocButton";
import { useI18n } from "@/hooks/use-i18n";

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
  const { t } = useI18n();
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
      <Loader2 className="w-4 h-4 animate-spin" /> {t("aiSettings.analyzing_data")}
    </div>
  );
  if (!data) return null;

  const items = [
    {
      label: t("aiSettings.dq.store_name"),
      ok: data.hasStoreName,
      hint: t("aiSettings.dq.store_name_hint"),
    },
    {
      label: t("aiSettings.dq.system_prompt"),
      ok: data.hasSystemPrompt,
      hint: t("aiSettings.dq.system_prompt_hint"),
    },
    {
      label: t("aiSettings.dq.active_products").replace("{n}", String(data.products.active)),
      ok: data.products.active > 0,
      hint: t("aiSettings.dq.active_products_hint"),
    },
    {
      label: t("aiSettings.dq.products_with_desc").replace("{a}", String(data.products.withDescription)).replace("{b}", String(data.products.total)),
      ok: data.products.withDescription === data.products.total && data.products.total > 0,
      hint: t("aiSettings.dq.products_with_desc_hint"),
    },
    {
      label: t("aiSettings.dq.products_with_stock").replace("{a}", String(data.products.withStock)).replace("{b}", String(data.products.total)),
      ok: data.products.withStock === data.products.total && data.products.total > 0,
      hint: t("aiSettings.dq.products_with_stock_hint"),
    },
    {
      label: t("aiSettings.dq.shipping"),
      ok: data.hasShipping,
      hint: t("aiSettings.dq.shipping_hint"),
    },
  ];

  const score = items.filter(i => i.ok).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-foreground">{t("aiSettings.dq.score").replace("{score}", String(score)).replace("{total}", String(items.length))}</span>
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
function LanguageSection() {
  const { t } = useI18n();
  const LANGUAGES = [
    { value: "auto", label: t("aiSettings.lang.auto") },
    { value: "ar", label: t("aiSettings.lang.ar") },
    { value: "fr", label: t("aiSettings.lang.fr") },
    { value: "en", label: t("aiSettings.lang.en") },
    { value: "darija", label: t("aiSettings.lang.darija") },
  ];
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
        {t("aiSettings.lang_desc")}
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
        {saved ? t("aiSettings.saved") : t("common.save_short")}
      </button>
    </div>
  );
}

// ─── Rules Section ────────────────────────────────────────────────────────────
function RulesSection() {
  const { t } = useI18n();
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
      setSaveError(t("aiSettings.err.save_rules"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("aiSettings.rules_desc")}
      </p>
      <div className="text-xs text-muted-foreground bg-secondary/50 border border-border rounded-lg px-3 py-2 space-y-0.5">
        <p className="font-medium text-foreground mb-1">{t("aiSettings.examples")}</p>
        <p>• {t("aiSettings.rules.example1")}</p>
        <p>• {t("aiSettings.rules.example2")}</p>
        <p>• {t("aiSettings.rules.example3")}</p>
        <p>• {t("aiSettings.rules.example4")}</p>
      </div>
      <textarea
        value={rules}
        onChange={e => setRules(e.target.value)}
        rows={7}
        placeholder={t("aiSettings.rules_placeholder")}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none font-mono"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? t("aiSettings.saved") : t("aiSettings.save_rules")}
        </button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> {t("aiSettings.rules_saved")}
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
  const { t } = useI18n();
  const steps = [
    { n: "1", title: t("aiSettings.how.step1_title"), body: t("aiSettings.how.step1_body") },
    { n: "2", title: t("aiSettings.how.step2_title"), body: t("aiSettings.how.step2_body") },
    { n: "3", title: t("aiSettings.how.step3_title"), body: t("aiSettings.how.step3_body") },
    { n: "4", title: t("aiSettings.how.step4_title"), body: t("aiSettings.how.step4_body") },
    { n: "5", title: t("aiSettings.how.step5_title"), body: t("aiSettings.how.step5_body") },
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
  const { t } = useI18n();
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
            t("aiSettings.sync_warning").replace("{n}", String(failedChannels.length)).replace("{list}", failedChannels.join(", "))
          );
        }
      } else if (failedChannels.length > 0) {
        setSyncError(t("aiSettings.err.sync_failed"));
      } else {
        setSyncResult(data);
      }
    } catch {
      setSyncError(t("aiSettings.err.sync_failed"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("aiSettings.training_desc")}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? t("aiSettings.syncing") : t("aiSettings.sync_meta")}
        </button>
        <button
          onClick={handleExport}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {t("aiSettings.export_training")}
        </button>
      </div>
      {syncResult && (
        <div className="space-y-1.5">
          <p className="text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="inline w-4 h-4 mr-1" />
            {t("aiSettings.sync_success").replace("{messages}", String(syncResult.messagesSynced)).replace("{conversations}", String(syncResult.conversationsSynced))}
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
                : <><CheckCircle2 className="inline w-3 h-3 mr-1" />{ch}: {t("aiSettings.messages_synced").replace("{n}", String(r.synced))}</>
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
  const { t } = useI18n();
  const [estimate, setEstimate] = useState<any>(null);
  const [estimateLoading, setEstimateLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [runError, setRunError] = useState("");

  // Phase 1: load estimate on mount (no credits deducted)
  useEffect(() => {
    Promise.all([
      apiFetch("/api/analytics/optimizer/estimate", { method: "POST" }).catch(() => null),
      apiFetch("/api/analytics/optimizer/status").catch(() => null),
    ]).then(([est, stat]) => {
      setEstimate(est);
      setStatus(stat);
    }).finally(() => setEstimateLoading(false));
  }, []);

  async function handleRun() {
    setRunning(true);
    setRunError("");
    try {
      const result = await apiFetch("/api/analytics/optimizer/run", { method: "POST" });

      // Billing blocked — show top-up message
      if (result.blocked || result.status === "blocked_insufficient_credits") {
        setEstimate((prev: any) => ({ ...prev, ...result.billing, blocked: true }));
        return;
      }
      if (result.status === "no_data") {
        setRunError(t("aiSettings.no_conversations"));
        return;
      }

      // Refresh status after successful run
      const [updatedStatus, updatedEstimate] = await Promise.all([
        apiFetch("/api/analytics/optimizer/status").catch(() => null),
        apiFetch("/api/analytics/optimizer/estimate", { method: "POST" }).catch(() => null),
      ]);
      setStatus(updatedStatus);
      setEstimate(updatedEstimate);
    } catch {
      setRunError(t("aiSettings.err.analysis_failed"));
    } finally {
      setRunning(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await apiFetch("/api/analytics/optimizer/approve", { method: "POST" });
      const updated = await apiFetch("/api/analytics/optimizer/status").catch(() => null);
      setStatus(updated);
    } catch {
      // silent
    } finally {
      setApproving(false);
    }
  }

  const lastRunAt = status?.last_run_at
    ? new Date(status.last_run_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const isBlocked = estimate?.blocked || estimate?.status === "blocked_insufficient_credits";
  const creditsRequired = estimate?.credits_required ?? 0;
  const creditsAvailable = estimate?.credits_available ?? 0;
  const creditsMissing = estimate?.credits_missing ?? 0;
  const hasConversations = (estimate?.conversations_to_analyze ?? 0) > 0;
  const canRun = hasConversations && !isBlocked && creditsRequired > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("aiSettings.optimizer_desc")}
      </p>

      {/* Phase 1 & 2: Estimate card */}
      {estimateLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {t("aiSettings.checking_conversations")}
        </div>
      ) : estimate && (
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 space-y-2 text-sm">
          {hasConversations ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("aiSettings.conversations_eligible")}</span>
                <span className="font-medium text-foreground">{estimate.conversations_to_analyze}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("aiSettings.model_label")}</span>
                <span className="font-medium text-foreground">{estimate.model_label ?? estimate.model}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("aiSettings.credits_required")}</span>
                <span className="font-medium text-foreground">{creditsRequired}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("aiSettings.your_credits")}</span>
                <span className={`font-medium ${isBlocked ? "text-destructive" : "text-foreground"}`}>
                  {creditsAvailable}
                </span>
              </div>

              {/* Phase 2B: blocked */}
              {isBlocked && (
                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-destructive text-sm flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {t("aiSettings.err.credits_insufficient").replace("{required}", String(creditsRequired)).replace("{available}", String(creditsAvailable)).replace("{missing}", String(creditsMissing))}
                  </p>
                  <a
                    href="/billing?action=topup"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
                  >
                    {t("aiSettings.topup_credits")}
                  </a>
                </div>
              )}

              {/* Phase 2A: ready */}
              {!isBlocked && (
                <p className="text-green-600 dark:text-green-400 flex items-center gap-1 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t("aiSettings.ready_to_run")}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              {t("aiSettings.no_conversations")}
            </p>
          )}
        </div>
      )}

      {/* Phase 3/4: prior run status */}
      {status && (status.has_pending || status.has_approved) && (
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 space-y-1.5 text-sm">
          {lastRunAt && (
            <p className="text-muted-foreground">
              {t("aiSettings.last_run")} <span className="text-foreground font-medium">{lastRunAt}</span>
            </p>
          )}
          {status.has_approved && !status.has_pending && (
            <p className="text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t("aiSettings.active_improvements")}
            </p>
          )}
          {status.has_pending && (
            <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {t("aiSettings.pending_approval")}
            </p>
          )}
          {status.improvement_summary && (
            <p className="text-muted-foreground text-xs pt-1 border-t border-border">
              {status.improvement_summary}
            </p>
          )}
          {status.confidence_score != null && (
            <p className="text-muted-foreground text-xs">
              {t("aiSettings.confidence").replace("{pct}", String(Math.round(status.confidence_score * 100)))}
            </p>
          )}
        </div>
      )}

      {/* Phase 3: action buttons */}
      <div className="flex flex-wrap gap-3">
        {!isBlocked && canRun && (
          <button
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? t("aiSettings.analyzing") : t("aiSettings.run_analysis")}
          </button>
        )}

        {/* Phase 4: approve button */}
        {status?.has_pending && (
          <button
            onClick={handleApprove}
            disabled={approving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-green-500 text-green-600 dark:text-green-400 text-sm font-medium hover:bg-green-500/10 disabled:opacity-50 transition-colors"
          >
            {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {approving ? t("aiSettings.approving") : t("aiSettings.approve_improvements")}
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
  const { t } = useI18n();
  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Bot className="w-6 h-6 text-primary" /> {t("nav.ai_settings")}
              </h1>
              <DocButton docId="ai-settings" />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t("aiSettings.page_subtitle")}
            </p>
          </div>

          <Section icon={BookOpen} title={t("aiSettings.section.how_it_works")}>
            <HowItWorksSection />
          </Section>

          <Section icon={Brain} title={t("aiSettings.section.ai_rules")}>
            <RulesSection />
          </Section>

          <Section icon={Globe} title={t("aiSettings.section.reply_language")}>
            <LanguageSection />
          </Section>

          <Section icon={CheckCircle2} title={t("aiSettings.section.data_quality")}>
            <DataQualitySection />
          </Section>

          <Section icon={Download} title={t("aiSettings.section.training_data")}>
            <TrainingDataSection />
          </Section>

          <Section icon={Sparkles} title={t("aiSettings.section.optimizer")}>
            <OptimizerSection />
          </Section>
        </div>
      </div>
    </AppLayout>
  );
}
