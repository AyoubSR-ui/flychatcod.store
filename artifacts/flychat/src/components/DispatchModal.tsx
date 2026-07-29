import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, Loader2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("flychat_token") || ""}` });

// Shared by Orders.tsx (list row) and OrderDetail.tsx ("Create Parcel").
export function DispatchModal({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["carriers"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/carriers`, { headers: authHeaders() });
      return res.json();
    },
  });
  const [carrierConnectionId, setCarrierConnectionId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const connections = data?.connections || [];

  const handleDispatch = async () => {
    if (!carrierConnectionId) { setError("Choisissez un compte transporteur."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ carrierConnectionId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Échec de la création du colis");
      onDone(); onClose();
    } catch (err: any) {
      setError(err.message || "Échec de la création du colis");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center"><Truck className="w-5 h-5 text-primary" /></div>
          <div><h2 className="font-bold text-foreground text-lg">Créer un colis</h2><p className="text-xs text-muted-foreground">Choisir un transporteur connecté</p></div>
        </div>
        {isLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : connections.length === 0 ? (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm">
            Aucun compte transporteur connecté. Rendez-vous sur la page Livraison pour en connecter un.
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Compte transporteur</label>
            <select value={carrierConnectionId} onChange={e => setCarrierConnectionId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Sélectionner...</option>
              {connections.map((c: any) => <option key={c.id} value={c.id}>{c.label} ({c.carrier})</option>)}
            </select>
          </div>
        )}
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary">Annuler</button>
          <button onClick={handleDispatch} disabled={submitting || connections.length === 0} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Créer le colis
          </button>
        </div>
      </div>
    </div>
  );
}
