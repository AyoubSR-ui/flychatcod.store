import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { authFetch } from "@/lib/auth-fetch";

// Shared by Orders.tsx (list row) and OrderDetail.tsx ("Create Parcel").
export function DispatchModal({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { data, isLoading, isError: carriersIsError, refetch: refetchCarriers } = useQuery({
    queryKey: ["carriers"],
    queryFn: () => authFetch<any>("/api/carriers"),
  });
  const [carrierConnectionId, setCarrierConnectionId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const connections = data?.connections || [];

  const handleDispatch = async () => {
    if (!carrierConnectionId) { setError(t("dispatchModal.err.choose_carrier_account")); return; }
    setSubmitting(true); setError("");
    try {
      await authFetch(`/api/orders/${orderId}/dispatch`, { method: "POST", body: JSON.stringify({ carrierConnectionId }) });
      onDone(); onClose();
    } catch (err: any) {
      setError(err.message || t("orderDetail.err.dispatch_failed"));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center"><Truck className="w-5 h-5 text-primary" /></div>
          <div><h2 className="font-bold text-foreground text-lg">{t("orderDetail.create_parcel_label")}</h2><p className="text-xs text-muted-foreground">{t("dispatchModal.subtitle")}</p></div>
        </div>
        {isLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : carriersIsError ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between gap-2">
            <span>{t("common.load_failed")}</span>
            <button onClick={() => refetchCarriers()} className="font-bold hover:underline shrink-0">{t("common.retry")}</button>
          </div>
        ) : connections.length === 0 ? (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm">
            {t("dispatchModal.no_carrier_connected")}
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t("dispatchModal.carrier_account_label")}</label>
            <select value={carrierConnectionId} onChange={e => setCarrierConnectionId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">{t("dispatchModal.select_placeholder")}</option>
              {connections.map((c: any) => <option key={c.id} value={c.id}>{c.label} ({c.carrier})</option>)}
            </select>
          </div>
        )}
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary">{t("common.cancel")}</button>
          <button onClick={handleDispatch} disabled={submitting || carriersIsError || connections.length === 0} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} {t("dispatchModal.submit_btn")}
          </button>
        </div>
      </div>
    </div>
  );
}
