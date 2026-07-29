import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, CheckCircle2, XCircle, AlertCircle, Loader2, Plus, Trash2, Pencil, Check, X } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("flychat_token") || ""}` });

interface CredentialField { key: string; label: string; placeholder: string; secret?: boolean; }
interface CarrierMeta { id: string; name: string; implemented: boolean; credentialFields: CredentialField[]; logo?: string; }
interface CarrierConnection { id: string; carrier: string; label: string; status: string; created_at: string; }

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

function ConnectModal({ meta, onClose, onSuccess }: { meta: CarrierMeta; onClose: () => void; onSuccess: () => void }) {
  const [label, setLabel] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    if (!label.trim()) { setError("Account label is required."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/carriers/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ carrier: meta.id, label: label.trim(), credentials }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Connection failed");
      onSuccess(); onClose();
    } catch (err: any) {
      setError(err.message || "Failed to connect.");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <CarrierLogo logo={meta.logo} name={meta.name} size="w-10 h-10" />
          <div><h2 className="font-bold text-foreground text-lg">Connect {meta.name}</h2><p className="text-xs text-muted-foreground">Add a carrier account</p></div>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Account Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Main account"
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
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary">Cancel</button>
          <button onClick={handleConnect} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Connect
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Delivery() {
  const queryClient = useQueryClient();
  const [connectMeta, setConnectMeta] = useState<CarrierMeta | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

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
            <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3"><Truck className="w-7 h-7 text-primary" /> Delivery</h1>
            <p className="text-muted-foreground mt-1">Connect Algerian delivery companies to dispatch confirmed orders as colis.</p>
          </div>

          {successMsg && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> {successMsg}
              <button onClick={() => setSuccessMsg("")} className="ml-auto">✕</button>
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
                      {accounts.length} account{accounts.length > 1 ? "s" : ""} connected
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
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 border border-green-200"><CheckCircle2 className="w-3 h-3" /> Connected</span>
                            <button onClick={() => startRename(c)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors" title="Rename"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDisconnect(c.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Disconnect"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {registryById[carrier]?.implemented && (
                    <button
                      onClick={() => setConnectMeta(registryById[carrier])}
                      className="w-full px-5 py-2.5 text-sm font-bold text-primary hover:bg-primary/5 border-t border-border flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add another account
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Available carriers ── */}
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {registry.filter(meta => !connectionsByCarrier[meta.id]).map(meta => (
                <div key={meta.id} className={`bg-card border rounded-2xl shadow-sm p-5 space-y-3 ${meta.implemented ? "border-border" : "border-border opacity-60"}`}>
                  <div className="flex items-center gap-3">
                    <CarrierLogo logo={meta.logo} name={meta.name} />
                    <div className="font-bold text-foreground">{meta.name}</div>
                  </div>
                  {meta.implemented ? (
                    <button onClick={() => setConnectMeta(meta)} className="w-full py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 flex items-center justify-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" /> Connect
                    </button>
                  ) : (
                    <div className="w-full py-2 rounded-xl text-sm font-bold bg-secondary text-muted-foreground text-center flex items-center justify-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" /> Coming soon
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
          onSuccess={() => { setSuccessMsg(`${connectMeta.name} connected!`); invalidate(); }}
        />
      )}
    </AppLayout>
  );
}
