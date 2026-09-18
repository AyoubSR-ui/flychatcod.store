import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, CheckCircle2, XCircle, AlertCircle, Loader2, Plus, Trash2, Pencil, Check, X, RefreshCw } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { format } from "date-fns";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("flychat_token") || ""}` });

interface CredentialField { key: string; label: string; placeholder: string; secret?: boolean; }
interface CarrierMeta { id: string; name: string; status: "live" | "not_available"; credentialFields: CredentialField[]; logo?: string; }
interface CarrierVerification {
  status: "verified" | "failed" | "unverified";
  checkedAt: string | null;
  message: string | null;
  failureReason: string | null;
}
interface CarrierConnection { id: string; carrier: string; label: string; status: string; created_at: string; verification: CarrierVerification | null; }

function VerificationBadge({ verification }: { verification: CarrierVerification | null }) {
  const { t } = useI18n();
  if (!verification || verification.status === "unverified") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
        <AlertCircle className="w-3 h-3" /> {t("deliveryPage.unverified_badge")}
      </span>
    );
  }
  if (verification.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
        <XCircle className="w-3 h-3" /> {t("deliveryPage.failed_badge")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 border border-green-200">
      <CheckCircle2 className="w-3 h-3" /> {t("deliveryPage.verified_badge")}
    </span>
  );
}

function CarrierLogo({ logo, name, size = "w-9 h-9" }: { logo?: string; name: string; size?: string }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return <img src={logo} alt={name} className={`${size} rounded-xl object-contain bg-white border border-border shrink-0 p-1`} onError={() => setFailed(true)} />;
  }
  return (
    <div className={`${size} bg-primary/10 rounded-xl flex items-center justify-center shrink-0`}>
      <Truck className="w-4 h-4 text-primary" />
    </div>
  );
}

function ConnectModal({ meta, onClose, onSuccess }: { meta: CarrierMeta; onClose: () => void; onSuccess: (verification: CarrierVerification | null) => void }) {
  const { t } = useI18n();
  const [label, setLabel] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    if (!label.trim()) { setError(t("deliveryPage.err.label_required")); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/carriers/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ carrier: meta.id, label: label.trim(), credentials }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Connection failed");
      onSuccess(data.verification ?? null); onClose();
    } catch (err: any) {
      setError(err.message || t("deliveryPage.err.connect_failed"));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <CarrierLogo logo={meta.logo} name={meta.name} size="w-10 h-10" />
          <div><h2 className="font-bold text-foreground text-lg">{t("deliveryPage.connect_title").replace("{name}", meta.name)}</h2><p className="text-xs text-muted-foreground">{t("deliveryPage.connect_desc")}</p></div>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t("deliveryPage.account_label")}</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder={t("deliveryPage.account_label_placeholder")}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {meta.credentialFields.map(f => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{f.label}</label>
              <input
                type={f.secret ? "password" : "text"}
                value={credentials[f.key] || ""}
                onChange={e => setCredentials(c => ({ ...c, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          ))}
        </div>
        {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary">{t("common.cancel")}</button>
          <button onClick={handleConnect} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} {t("deliveryPage.connect")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Delivery() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [connectMeta, setConnectMeta] = useState<CarrierMeta | null>(null);
  const [successMsg, setSuccessMsg] = useState<{ text: string; tone: "success" | "warning" | "error" } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["carriers"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/carriers`, { headers: authHeaders() });
      return res.json() as Promise<{ registry: CarrierMeta[]; connections: CarrierConnection[] }>;
    },
  });

  const registry = data?.registry || [];
  const connections = data?.connections || [];
  const registryById = Object.fromEntries(registry.map(m => [m.id, m]));

  // Group connections by carrier so accounts of the same courier (e.g. two
  // Anderson Ecotrack accounts) render together instead of a flat list.
  const connectionsByCarrier = connections.reduce<Record<string, CarrierConnection[]>>((acc, c) => {
    (acc[c.carrier] ||= []).push(c);
    return acc;
  }, {});

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["carriers"] });

  const handleDisconnect = async (id: string) => {
    await fetch(`${API_BASE}/api/carriers/${id}`, { method: "DELETE", headers: authHeaders() });
    invalidate();
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await fetch(`${API_BASE}/api/carriers/${id}/verify`, { method: "POST", headers: authHeaders() });
      invalidate();
    } finally {
      setVerifyingId(null);
    }
  };

  const startRename = (c: CarrierConnection) => { setRenamingId(c.id); setRenameValue(c.label); };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    setRenaming(true);
    try {
      await fetch(`${API_BASE}/api/carriers/${id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ label: renameValue.trim() }),
      });
      setRenamingId(null);
      invalidate();
    } finally { setRenaming(false); }
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3"><Truck className="w-7 h-7 text-primary" /> {t("deliveryPage.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("deliveryPage.subtitle")}</p>
          </div>

          {successMsg && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium border ${
              successMsg.tone === "error" ? "bg-red-50 border-red-200 text-red-800"
              : successMsg.tone === "warning" ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-green-50 border-green-200 text-green-800"
            }`}>
              {successMsg.tone === "error" ? <XCircle className="w-4 h-4" /> : successMsg.tone === "warning" ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {successMsg.text}
              <button onClick={() => setSuccessMsg(null)} className="ml-auto">✕</button>
            </div>
          )}

          {/* ── Connected accounts (grouped per carrier) ── */}
          {Object.keys(connectionsByCarrier).length > 0 && (
            <div className="space-y-4">
              {Object.entries(connectionsByCarrier).map(([carrier, accounts]) => (
                <div key={carrier} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-border flex items-center gap-3">
                    <CarrierLogo logo={registryById[carrier]?.logo} name={carrier} size="w-7 h-7" />
                    <span className="font-bold text-sm text-foreground">{registryById[carrier]?.name || carrier}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("deliveryPage.accounts_connected").replace("{n}", String(accounts.length))}
                    </span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {accounts.map(c => (
                      <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        {renamingId === c.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleRename(c.id); if (e.key === "Escape") setRenamingId(null); }}
                              className="flex-1 px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <button onClick={() => handleRename(c.id)} disabled={renaming} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setRenamingId(null)} className="p-1.5 text-muted-foreground hover:bg-secondary rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <div className="font-semibold text-foreground text-sm">{c.label}</div>
                        )}
                        {renamingId !== c.id && (
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-2">
                              <VerificationBadge verification={c.verification} />
                              <button onClick={() => handleVerify(c.id)} disabled={verifyingId === c.id} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors disabled:opacity-50" title={t("deliveryPage.reverify")}>
                                {verifyingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => startRename(c)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors" title={t("deliveryPage.rename")}><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDisconnect(c.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={t("deliveryPage.disconnect")}><Trash2 className="w-4 h-4" /></button>
                            </div>
                            <p className="text-[10px] text-muted-foreground max-w-[280px] text-right">
                              {c.verification?.checkedAt
                                ? t("deliveryPage.checked_at").replace("{date}", format(new Date(c.verification.checkedAt), "MMM dd, HH:mm"))
                                : t("deliveryPage.never_checked")}
                              {c.verification?.status !== "verified" && c.verification?.message ? ` — ${c.verification.message}` : ""}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {registryById[carrier]?.status === "live" && (
                    <button
                      onClick={() => setConnectMeta(registryById[carrier])}
                      className="w-full px-5 py-2.5 text-sm font-bold text-primary hover:bg-primary/5 border-t border-border flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t("deliveryPage.add_another")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Available carriers ── */}
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">{t("common.loading")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {registry.filter(meta => !connectionsByCarrier[meta.id]).map(meta => (
                <div key={meta.id} className={`bg-card border rounded-2xl shadow-sm p-5 space-y-3 ${meta.status === "live" ? "border-border" : "border-border opacity-60"}`}>
                  <div className="flex items-center gap-3">
                    <CarrierLogo logo={meta.logo} name={meta.name} />
                    <div className="font-bold text-foreground">{meta.name}</div>
                  </div>
                  {meta.status === "live" ? (
                    <button onClick={() => setConnectMeta(meta)} className="w-full py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 flex items-center justify-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" /> {t("deliveryPage.connect")}
                    </button>
                  ) : (
                    <div className="w-full py-2 rounded-xl text-sm font-bold bg-secondary text-muted-foreground text-center flex items-center justify-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" /> {t("deliveryPage.not_available")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {connectMeta && (
        <ConnectModal
          meta={connectMeta}
          onClose={() => setConnectMeta(null)}
          onSuccess={(verification) => {
            const name = connectMeta.name;
            if (verification?.status === "verified") {
              setSuccessMsg({ text: t("deliveryPage.connected_verified_success").replace("{name}", name), tone: "success" });
            } else if (verification?.status === "failed") {
              setSuccessMsg({ text: t("deliveryPage.connected_failed_warning").replace("{name}", name), tone: "error" });
            } else {
              setSuccessMsg({ text: t("deliveryPage.connected_unverified_note").replace("{name}", name), tone: "warning" });
            }
            invalidate();
          }}
        />
      )}
    </AppLayout>
  );
}
