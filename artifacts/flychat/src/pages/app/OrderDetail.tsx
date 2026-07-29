import { AppLayout } from "@/components/AppLayout";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, Phone, MapPin, MessageSquare, Package, StickyNote, Truck,
  Printer, Copy, RefreshCw, CheckCircle2, Loader2, Plus, Trash2, Pencil, CalendarClock,
} from "lucide-react";
import React, { useState } from "react";
import { useGetOrder, useUpdateOrder } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { ALGERIA_WILAYAS } from "@/data/algeria-communes";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("flychat_token") || ""}` });

// Delivery type isn't always stored as our own 'home_delivery'/'stopdesk'
// values — Shopify orders carry the merchant's raw shipping-line title
// (e.g. "Livraison à domicile"), so classify by keyword instead of exact match.
function classifyDeliveryType(raw: string | null | undefined): "home" | "stopdesk" {
  const v = (raw || "").toLowerCase();
  if (v.includes("stop") || v.includes("desk") || v.includes("bureau")) return "stopdesk";
  return "home";
}

const STATUS_OPTIONS = [
  "new", "awaiting_confirmation", "self_confirmation", "self_confirmed", "confirmed",
  "no_answer", "callback", "scheduled", "shipped", "delivered", "cancelled", "suspicious",
] as const;

const STATUS_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-700 border-gray-200",
  awaiting_confirmation: "bg-yellow-100 text-yellow-800 border-yellow-200",
  self_confirmation: "bg-amber-100 text-amber-800 border-amber-200",
  self_confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  no_answer: "bg-gray-100 text-gray-700 border-gray-200",
  callback: "bg-indigo-100 text-indigo-800 border-indigo-200",
  scheduled: "bg-blue-100 text-blue-800 border-blue-200",
  shipped: "bg-blue-100 text-blue-800 border-blue-200",
  delivered: "bg-teal-100 text-teal-800 border-teal-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  suspicious: "bg-orange-100 text-orange-800 border-orange-200",
};

const SOURCE_META: Record<string, { label: string; emoji: string; dot: string }> = {
  shopify: { label: "Shopify", emoji: "🛍️", dot: "bg-green-500" },
  whatsapp: { label: "WhatsApp", emoji: "💬", dot: "bg-green-500" },
  instagram: { label: "Instagram", emoji: "📷", dot: "bg-pink-500" },
  messenger: { label: "Messenger", emoji: "💠", dot: "bg-blue-500" },
  widget: { label: "Widget", emoji: "🌐", dot: "bg-blue-400" },
  manual: { label: "Manuel", emoji: "✍️", dot: "bg-gray-400" },
};

function EditableField({ icon, value, href, onSave }: {
  icon: React.ReactNode;
  value: string;
  href?: string;
  onSave: (val: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background w-full"
        />
        <div className="flex gap-2">
          <button
            onClick={async () => { setSaving(true); await onSave(val); setSaving(false); setEditing(false); }}
            disabled={saving}
            className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={() => { setVal(value); setEditing(false); }} className="px-4 py-1.5 border border-border rounded-lg text-xs hover:bg-secondary">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm group">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        {href ? <a href={href} className="font-medium truncate hover:text-primary">{value}</a> : <span className="font-medium truncate">{value}</span>}
      </div>
      <button
        onClick={() => setEditing(true)}
        className="shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-xs text-muted-foreground hover:text-primary px-2 py-1 rounded border border-border hover:border-primary"
      >
        Edit
      </button>
    </div>
  );
}

// ─── Timeline (shared visual style for Confirmation Status + Delivery History) ─
function TimelineEvent({ dotColor, title, subtitle, timestamp, by }: { dotColor: string; title: string; subtitle?: string; timestamp: string; by?: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
        <span className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="pb-4 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 break-words">{subtitle}</p>}
        <p className="text-[11px] text-muted-foreground mt-1">
          {format(new Date(timestamp), "MMM dd, h:mm a")}{by ? ` · ${by}` : ""}
        </p>
      </div>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, refetch } = useGetOrder(id!);
  const updateOrder = useUpdateOrder();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedCarrierId, setSelectedCarrierId] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState("");
  const [editingItems, setEditingItems] = useState(false);
  const [itemsDraft, setItemsDraft] = useState<Array<{ productName: string; variant: string; quantity: number; price: number }>>([]);
  const [savingItems, setSavingItems] = useState(false);
  const [syncingShopify, setSyncingShopify] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [cancellingSchedule, setCancellingSchedule] = useState(false);
  const { t } = useI18n();

  const { data: carriersData } = useQuery({
    queryKey: ["carriers"],
    queryFn: async () => { const res = await fetch(`${API_BASE}/api/carriers`, { headers: authHeaders() }); return res.json(); },
  });
  const connectedCarriers: any[] = carriersData?.connections || [];

  const { data: eventsData, refetch: refetchEvents } = useQuery({
    queryKey: ["order-events", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/orders/${id}/events`, { headers: authHeaders() });
      return res.json();
    },
    enabled: !!id,
  });
  const events: any[] = eventsData?.events || [];
  const statusEvents = events.filter(e => e.eventType === "status_change");
  const deliveryEvents = events.filter(e =>
    e.eventType === "parcel_created" || e.eventType === "label_created" ||
    e.eventType === "parcel_scheduled" || e.eventType === "schedule_cancelled"
  );

  const handleStatusChange = async (status: string) => {
    await updateOrder.mutateAsync({ id: id!, data: { status: status as any } });
    refetch(); refetchEvents();
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    await updateOrder.mutateAsync({ id: id!, data: { sellerNote: note } });
    setSavingNote(false);
    refetch();
  };

  const handleRefreshTracking = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/refresh-tracking`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to refresh");
      refetch();
    } catch (err: any) {
      alert(err.message || "Failed to refresh tracking status");
    } finally { setRefreshing(false); }
  };

  const handleCopyTracking = (tracking: string) => {
    navigator.clipboard.writeText(tracking).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const handlePrint = () => window.print();

  const handleSchedule = async () => {
    if (!selectedCarrierId) { setDispatchError("Choisissez un transporteur."); return; }
    if (!scheduleDate) { setDispatchError("Choisissez une date d'expédition."); return; }
    setScheduling(true); setDispatchError("");
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ carrierConnectionId: selectedCarrierId, scheduledDate: new Date(scheduleDate).toISOString(), note: scheduleNote || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Échec de la programmation");
      setScheduleMode(false); setScheduleDate(""); setScheduleNote("");
      refetch(); refetchEvents();
    } catch (err: any) {
      setDispatchError(err.message || "Échec de la programmation");
    } finally { setScheduling(false); }
  };

  const handleCancelSchedule = async () => {
    setCancellingSchedule(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/schedule`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Échec de l'annulation");
      refetch(); refetchEvents();
    } catch (err: any) {
      alert(err.message || "Échec de l'annulation");
    } finally { setCancellingSchedule(false); }
  };

  const handleSyncShopify = async () => {
    setSyncingShopify(true); setSyncMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/sync-shopify`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Sync failed");
      setSyncMessage({ ok: true, text: "Synced to Shopify" });
      refetchEvents();
    } catch (err: any) {
      setSyncMessage({ ok: false, text: err.message || "Sync failed" });
    } finally { setSyncingShopify(false); }
  };

  const handleCreateParcel = async () => {
    if (!selectedCarrierId) { setDispatchError("Choisissez un transporteur."); return; }
    setDispatching(true); setDispatchError("");
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ carrierConnectionId: selectedCarrierId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Échec de la création du colis");
      refetch(); refetchEvents();
    } catch (err: any) {
      setDispatchError(err.message || "Échec de la création du colis");
    } finally { setDispatching(false); }
  };

  const startEditingItems = (currentItems: any[]) => {
    setItemsDraft(currentItems.map(i => ({
      productName: i.productName || i.title || "",
      variant: i.variant || i.variant_title || "",
      quantity: i.quantity || 1,
      price: Number(i.price) || 0,
    })));
    setEditingItems(true);
  };

  const handleSaveItems = async () => {
    const valid = itemsDraft.filter(i => i.productName.trim());
    if (valid.length === 0) { alert("At least one item with a product name is required."); return; }
    setSavingItems(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ items: valid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save items");
      setEditingItems(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["orders-list"] });
    } catch (err: any) {
      alert(err.message || "Failed to save items");
    } finally { setSavingItems(false); }
  };

  if (isLoading) return (
    <AppLayout>
      <div className="p-10 flex justify-center"><div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full" /></div>
    </AppLayout>
  );
  if (!order) return (
    <AppLayout><div className="p-10 text-center text-muted-foreground">Order not found.</div></AppLayout>
  );

  const o = order as any;
  const source = SOURCE_META[o.source] || SOURCE_META.manual;
  const shipment = o.shipment;
  const items = order.items || [];
  const subtotal = items.reduce((sum: number, i: any) => sum + Number(i.price ?? 0) * (i.quantity ?? 1), 0);
  const shippingFee = Number(o.shippingFee || 0);
  // Parcel creation is available at any stage before the order is fully
  // resolved — a failed dispatch means "try again", a successful one means
  // "create a replacement" (relabel, wrong carrier, etc). It never disappears
  // just because a shipment already exists.
  const SHIPPABLE_STATUSES = ["new", "awaiting_confirmation", "self_confirmation", "self_confirmed", "confirmed", "shipped"];
  const canCreateParcel = SHIPPABLE_STATUSES.includes(o.status);
  const isScheduled = o.status === "scheduled" && !!o.scheduledShipDate;
  const wilayaMatch = ALGERIA_WILAYAS.find(w => w.name.toLowerCase() === String(order.wilaya || "").toLowerCase());
  const communesForWilaya: string[] = wilayaMatch?.communes || [];

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background print:overflow-visible">

        {/* ── Sticky Header ── */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 lg:px-10 lg:py-5 print:hidden">
          <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
            <Link href="/orders" className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg lg:text-2xl font-display font-bold text-foreground truncate">{order.orderNumber}</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border bg-green-100 text-green-800 border-green-200 shrink-0">COD</span>
              </div>
              <p className="text-xs lg:text-sm text-muted-foreground flex items-center gap-1.5">
                {format(new Date(order.createdAt), "MMM dd, yyyy · HH:mm")}
                <span className="inline-flex items-center gap-1">
                  · via {source.label} <span className={`w-1.5 h-1.5 rounded-full ${source.dot}`} />
                </span>
              </p>
            </div>

            <select
              value={order.status}
              onChange={e => handleStatusChange(e.target.value)}
              className={`shrink-0 px-2 py-1.5 lg:px-3 rounded-xl border font-bold text-xs lg:text-sm outline-none cursor-pointer ${STATUS_COLORS[order.status] || ""}`}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </select>

            {o.source === "shopify" && (
              <button
                onClick={handleSyncShopify}
                disabled={syncingShopify}
                title="FlyChat edits never auto-sync to Shopify — this pushes the current status/tracking note manually."
                className="shrink-0 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {syncingShopify ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync to Shopify
              </button>
            )}

            <button onClick={handlePrint} className="shrink-0 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary flex items-center gap-1.5 transition-colors">
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
          {syncMessage && (
            <div className="max-w-5xl mx-auto pt-2">
              <p className={`text-xs ${syncMessage.ok ? "text-green-700" : "text-red-600"}`}>{syncMessage.text}</p>
            </div>
          )}
        </div>

        {/* ── Page Body ── */}
        <div className="p-4 lg:p-10">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

            {/* ══ LEFT COLUMN ══ */}
            <div className="space-y-4 lg:space-y-6">

              {/* Customer Info */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-foreground border-b border-border pb-3">Customer Info</h3>
                <EditableField
                  icon={null}
                  value={order.customerName}
                  onSave={async (val) => { await updateOrder.mutateAsync({ id: id!, data: { customerName: val } as any }); refetch(); }}
                />
                <EditableField
                  icon={<Phone className="w-4 h-4 text-muted-foreground shrink-0" />}
                  value={order.customerPhone}
                  href={`tel:${order.customerPhone}`}
                  onSave={async (val) => { await updateOrder.mutateAsync({ id: id!, data: { customerPhone: val } as any }); refetch(); }}
                />
                <EditableField
                  icon={<MapPin className="w-4 h-4 text-muted-foreground shrink-0" />}
                  value={order.wilaya + (order.address ? `, ${order.address}` : "")}
                  onSave={async (val) => { await updateOrder.mutateAsync({ id: id!, data: { address: val } as any }); refetch(); }}
                />
                {order.conversationId && (
                  <Link href="/inbox" className="flex items-center gap-2 text-sm text-primary hover:underline pt-2 border-t border-border font-medium">
                    <MessageSquare className="w-4 h-4" /> Open Conversation
                  </Link>
                )}
              </div>

              {/* Delivery Info */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-foreground border-b border-border pb-3">Delivery Info</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Delivery Type</span>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[11px] text-muted-foreground">via {source.label}</span>
                      <div className="flex rounded-lg border border-border overflow-hidden text-xs font-bold">
                        {(["home", "stopdesk"] as const).map(opt => (
                          <button
                            key={opt}
                            onClick={async () => { await updateOrder.mutateAsync({ id: id!, data: { shippingOption: opt === "home" ? "home_delivery" : "stopdesk" } as any }); refetch(); }}
                            className={`px-3 py-1.5 transition-colors ${classifyDeliveryType(o.shippingOption) === opt ? "bg-primary text-white" : "bg-background text-muted-foreground hover:bg-secondary"}`}
                          >
                            {opt === "home" ? "🏠 Home" : "🏢 Stop Desk"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground shrink-0">Wilaya</span>
                    <select
                      value={order.wilaya}
                      onChange={async e => { await updateOrder.mutateAsync({ id: id!, data: { wilaya: e.target.value, address: "" } as any }); refetch(); }}
                      className="font-medium text-foreground bg-transparent text-right outline-none cursor-pointer max-w-[200px]"
                    >
                      <option value="">Select wilaya...</option>
                      {ALGERIA_WILAYAS.map(w => <option key={w.code} value={w.name}>{String(w.code).padStart(2, "0")}. {w.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground shrink-0">Commune</span>
                    {communesForWilaya.length > 0 ? (
                      <select
                        value={order.address || ""}
                        onChange={async e => { await updateOrder.mutateAsync({ id: id!, data: { address: e.target.value } as any }); refetch(); }}
                        className="font-medium text-foreground bg-transparent text-right outline-none cursor-pointer max-w-[200px]"
                      >
                        <option value="">Select commune...</option>
                        {communesForWilaya.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <EditableField icon={null} value={order.address || "—"} onSave={async (val) => { await updateOrder.mutateAsync({ id: id!, data: { address: val } as any }); refetch(); }} />
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Shipping Fee</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">DZD</span>
                      <input
                        type="number"
                        defaultValue={shippingFee}
                        onBlur={async e => {
                          const val = Number(e.target.value);
                          if (val !== shippingFee) { await updateOrder.mutateAsync({ id: id!, data: { shippingFee: val } as any }); refetch(); }
                        }}
                        className="w-20 text-right font-medium text-foreground bg-transparent outline-none border-b border-transparent focus:border-primary"
                      />
                    </div>
                  </div>
                  {shipment && (
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <span className="text-muted-foreground">Current Parcel</span>
                      <span className="font-bold text-foreground">{String(shipment.carrier).toUpperCase()} · {shipment.trackingNumber || "—"}</span>
                    </div>
                  )}
                </div>

                {isScheduled && (
                  <div className="pt-3 border-t border-border">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-blue-800 flex items-center gap-1.5">
                          <CalendarClock className="w-4 h-4" /> Expédition programmée
                        </p>
                        <button
                          onClick={handleCancelSchedule}
                          disabled={cancellingSchedule}
                          className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-50"
                        >
                          {cancellingSchedule ? "..." : "Annuler"}
                        </button>
                      </div>
                      <p className="text-xs text-blue-600">
                        {new Date(o.scheduledShipDate).toLocaleDateString("fr-DZ", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {o.scheduleNote && <p className="text-xs text-blue-500 italic">"{o.scheduleNote}"</p>}
                    </div>
                  </div>
                )}

                {canCreateParcel && !isScheduled && (
                  <div className="pt-3 border-t border-border space-y-2.5">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setScheduleMode(false)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${!scheduleMode ? "bg-purple-600 text-white" : "border border-border text-muted-foreground hover:bg-secondary"}`}
                      >
                        📦 Expédier maintenant
                      </button>
                      <button
                        onClick={() => setScheduleMode(true)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${scheduleMode ? "bg-blue-600 text-white" : "border border-border text-muted-foreground hover:bg-secondary"}`}
                      >
                        📅 Programmer
                      </button>
                    </div>

                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide block">
                      {scheduleMode ? "Programmer un colis" : shipment ? "Créer un colis de remplacement" : "Créer un colis"}
                    </label>
                    {connectedCarriers.length === 0 ? (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        No courier connected. <Link href="/delivery" className="underline font-medium">Connect one in Delivery</Link>.
                      </div>
                    ) : (
                      <select
                        value={selectedCarrierId}
                        onChange={e => setSelectedCarrierId(e.target.value)}
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background"
                      >
                        <option value="">Select delivery company...</option>
                        {connectedCarriers.map(c => <option key={c.id} value={c.id}>{c.label} ({c.carrier})</option>)}
                      </select>
                    )}

                    {scheduleMode && (
                      <div className="space-y-2.5 p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <div>
                          <label className="text-xs font-medium text-blue-700 mb-1 block">📅 Date d'expédition</label>
                          <input
                            type="datetime-local"
                            value={scheduleDate}
                            onChange={e => setScheduleDate(e.target.value)}
                            min={new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)}
                            className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-blue-700 mb-1 block">📝 Note (optionnel)</label>
                          <input
                            type="text"
                            value={scheduleNote}
                            onChange={e => setScheduleNote(e.target.value)}
                            placeholder="ex. Client a demandé jeudi..."
                            className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </div>
                        <p className="text-xs text-blue-500">⚡ Le colis sera créé automatiquement à la date programmée.</p>
                      </div>
                    )}

                    {dispatchError && <p className="text-xs text-red-600">{dispatchError}</p>}
                    <button
                      onClick={scheduleMode ? handleSchedule : handleCreateParcel}
                      disabled={!selectedCarrierId || dispatching || scheduling || (scheduleMode && !scheduleDate)}
                      className={`w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors text-white ${scheduleMode ? "bg-blue-600 hover:bg-blue-700" : "bg-purple-600 hover:bg-purple-700"}`}
                    >
                      {(dispatching || scheduling) ? <Loader2 className="w-4 h-4 animate-spin" /> : scheduleMode ? <CalendarClock className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                      {dispatching ? "Creating parcel..." : scheduling ? "Programmation..." : scheduleMode ? "📅 Programmer le colis" : shipment ? "📦 Créer colis de remplacement" : "📦 Créer le colis"}
                    </button>
                  </div>
                )}
                {!canCreateParcel && !isScheduled && (
                  <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">Parcel creation isn't available for this order's current status.</p>
                )}
              </div>

              {/* Tracking */}
              {shipment && (
                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-primary" /> Tracking
                  </h3>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{String(shipment.carrier).replace(/_/g, " ")}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono font-bold text-foreground">{shipment.trackingNumber}</span>
                      <button onClick={() => handleCopyTracking(shipment.trackingNumber)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Copy">
                        {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {shipment.manualTrackingUrl ? (
                      <a href={shipment.manualTrackingUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs text-primary hover:underline font-medium">
                        Suivre sur le site du transporteur ↗
                      </a>
                    ) : (
                      <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">{String(shipment.status || "not_shipped").replace(/_/g, " ")}</span>
                    )}
                  </div>
                  {deliveryEvents.length > 0 && (
                    <div className="pt-2">
                      {deliveryEvents.map((e, idx) => (
                        <TimelineEvent key={e.id} dotColor={idx === deliveryEvents.length - 1 ? "bg-primary" : "bg-muted-foreground/40"} title={e.description || e.eventType} timestamp={e.createdAt} by={e.createdBy} />
                      ))}
                    </div>
                  )}
                  <button onClick={handleRefreshTracking} disabled={refreshing} className="w-full py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50">
                    {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
                  </button>
                </div>
              )}
            </div>

            {/* ══ RIGHT COLUMN ══ */}
            <div className="space-y-4 lg:space-y-6">

              {/* Order Items */}
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-foreground flex-1">Order Items</h3>
                  {!editingItems && items.length > 0 && (
                    <button onClick={() => startEditingItems(items)} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>

                {editingItems ? (
                  <div className="p-5 space-y-3">
                    {itemsDraft.map((item, idx) => (
                      <div key={idx} className="bg-secondary/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-muted-foreground">Item {idx + 1}</span>
                          {itemsDraft.length > 1 && (
                            <button onClick={() => setItemsDraft(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <input
                          value={item.productName}
                          onChange={e => setItemsDraft(prev => prev.map((it, i) => i === idx ? { ...it, productName: e.target.value } : it))}
                          placeholder="Product name"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <input
                          value={item.variant}
                          onChange={e => setItemsDraft(prev => prev.map((it, i) => i === idx ? { ...it, variant: e.target.value } : it))}
                          placeholder="Variant (color, size...)"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number" min={1} value={item.quantity}
                            onChange={e => setItemsDraft(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) } : it))}
                            placeholder="Qty"
                            className="px-2.5 py-1.5 rounded-lg border border-border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <input
                            type="number" min={0} value={item.price}
                            onChange={e => setItemsDraft(prev => prev.map((it, i) => i === idx ? { ...it, price: Number(e.target.value) } : it))}
                            placeholder="Price DZD"
                            className="px-2.5 py-1.5 rounded-lg border border-border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setItemsDraft(prev => [...prev, { productName: "", variant: "", quantity: 1, price: 0 }])}
                      className="w-full py-2 border border-dashed border-border rounded-xl text-xs font-bold text-muted-foreground hover:text-primary hover:border-primary flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Item
                    </button>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditingItems(false)} className="flex-1 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">Cancel</button>
                      <button onClick={handleSaveItems} disabled={savingItems} className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                        {savingItems && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-border/50">
                      {items.length === 0 ? (
                        <div className="px-5 py-6 space-y-2">
                          <div className="h-4 bg-secondary rounded animate-pulse w-3/4" />
                          <div className="h-3 bg-secondary rounded animate-pulse w-1/2" />
                        </div>
                      ) : items.map((item: any, idx: number) => (
                        <div key={item.id || idx} className="px-5 py-4 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">{item.productName || item.title}</p>
                            {(item.variant || item.variant_title) && <p className="text-xs text-muted-foreground mt-0.5">{item.variant || item.variant_title}</p>}
                            <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                          </div>
                          <p className="font-bold text-foreground shrink-0">DZD {(Number(item.price) * item.quantity).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                    <div className="px-5 py-3 border-t border-border flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium text-foreground">DZD {subtotal.toLocaleString()}</span>
                    </div>
                    {shippingFee > 0 && (
                      <div className="px-5 py-3 border-t border-border flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          Shipping
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-medium">
                            {classifyDeliveryType(o.shippingOption) === "stopdesk" ? "Stop Desk" : "Home"}
                          </span>
                        </span>
                        <span className="font-medium text-foreground">DZD {shippingFee.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="px-5 py-4 border-t border-border flex justify-between items-center bg-secondary/20 rounded-b-2xl">
                      <span className="font-bold text-foreground">Total</span>
                      <span className="font-bold text-xl text-foreground">DZD {Number(order.total).toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Confirmation Status */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <h3 className="font-bold text-foreground border-b border-border pb-3 mb-4">Confirmation Status</h3>
                {statusEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
                ) : (
                  <div>
                    {statusEvents.map((e, idx) => (
                      <TimelineEvent
                        key={e.id}
                        dotColor={idx === statusEvents.length - 1 ? (STATUS_COLORS[e.toStatus]?.includes("red") ? "bg-red-500" : "bg-primary") : "bg-muted-foreground/40"}
                        title={e.fromStatus ? `${t(`status.${e.fromStatus}`)} → ${t(`status.${e.toStatus}`)}` : t(`status.${e.toStatus}`)}
                        timestamp={e.createdAt}
                        by={e.createdBy}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Delivery History */}
              {deliveryEvents.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <h3 className="font-bold text-foreground border-b border-border pb-3 mb-4">Delivery Status</h3>
                  <div>
                    {deliveryEvents.map((e, idx) => {
                      const meta: Record<string, { dot: string; title: string }> = {
                        parcel_created: { dot: "bg-purple-500", title: "Colis créé" },
                        label_created: { dot: "bg-green-500", title: "Label Created" },
                        parcel_scheduled: { dot: "bg-blue-500", title: "Colis programmé" },
                        schedule_cancelled: { dot: "bg-gray-400", title: "Programmation annulée" },
                      };
                      const m = meta[e.eventType] || { dot: "bg-gray-400", title: e.eventType };
                      return (
                        <TimelineEvent
                          key={e.id}
                          dotColor={m.dot}
                          title={m.title}
                          subtitle={e.description}
                          timestamp={e.createdAt}
                          by={idx === deliveryEvents.length - 1 ? e.createdBy : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Seller Notes */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <button className="w-full flex items-center gap-2 px-5 py-4 text-left lg:cursor-default" onClick={() => setNotesOpen(o => !o)}>
                  <StickyNote className="w-5 h-5 text-primary shrink-0" />
                  <h3 className="font-bold text-foreground flex-1">Seller Notes</h3>
                  <span className="lg:hidden text-muted-foreground text-xs">{notesOpen ? "▲" : "▼"}</span>
                </button>
                <div className={`px-5 pb-5 ${notesOpen ? "block" : "hidden"} lg:block`}>
                  <textarea
                    defaultValue={order.sellerNote || ""}
                    onChange={e => setNote(e.target.value)}
                    rows={4}
                    placeholder="Add internal notes about this order..."
                    className="w-full border border-border rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-primary/20 outline-none bg-background"
                  />
                  <button onClick={handleSaveNote} disabled={savingNote} className="mt-3 w-full lg:w-auto px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                    {savingNote ? "Saving..." : t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Print-only receipt ── */}
        <div className="hidden print:block p-8 text-sm">
          <h1 className="text-xl font-bold mb-1">{order.orderNumber}</h1>
          <p className="text-muted-foreground mb-4">{format(new Date(order.createdAt), "MMM dd, yyyy · HH:mm")}</p>
          <p className="font-bold">{order.customerName}</p>
          <p>{order.customerPhone}</p>
          <p>{order.wilaya}{order.address ? `, ${order.address}` : ""}</p>
          <table className="w-full mt-4 border-collapse">
            <thead><tr className="border-b border-black"><th className="text-left py-1">Product</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Total</th></tr></thead>
            <tbody>
              {items.map((item: any, idx: number) => (
                <tr key={idx} className="border-b border-gray-300">
                  <td className="py-1">{item.productName || item.title}{item.variant ? ` (${item.variant})` : ""}</td>
                  <td className="text-right py-1">{item.quantity}</td>
                  <td className="text-right py-1">DZD {(Number(item.price) * item.quantity).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-right font-bold mt-3">Total: DZD {Number(order.total).toLocaleString()}</p>
          {shipment && <p className="mt-3">Tracking: {shipment.trackingNumber} ({shipment.carrier})</p>}
        </div>
      </div>

    </AppLayout>
  );
}
