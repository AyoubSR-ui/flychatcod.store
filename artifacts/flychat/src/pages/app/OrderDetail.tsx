import { AppLayout } from "@/components/AppLayout";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, Phone, MapPin, MessageSquare, Package, StickyNote, Truck,
  Printer, Copy, RefreshCw, CheckCircle2, Loader2,
} from "lucide-react";
import React, { useState } from "react";
import { useGetOrder, useUpdateOrder } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { DispatchModal } from "@/components/DispatchModal";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("flychat_token") || ""}` });

const WILAYAS = [
  "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar",
  "Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger",
  "Djelfa","Jijel","Sétif","Saïda","Skikda","Sidi Bel Abbès","Annaba","Guelma",
  "Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla","Oran","El Bayadh",
  "Illizi","Bordj Bou Arréridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued",
  "Khenchela","Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent",
  "Ghardaïa","Relizane","Timimoun","Bordj Badji Mokhtar","Ouled Djellal","Béni Abbès",
  "In Salah","In Guezzam","Touggourt","Djanet","El M'Ghair","El Méniaa",
];

const STATUS_OPTIONS = [
  "new", "awaiting_confirmation", "self_confirmation", "self_confirmed", "confirmed",
  "no_answer", "callback", "shipped", "delivered", "cancelled", "suspicious",
] as const;

const STATUS_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-700 border-gray-200",
  awaiting_confirmation: "bg-yellow-100 text-yellow-800 border-yellow-200",
  self_confirmation: "bg-amber-100 text-amber-800 border-amber-200",
  self_confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  no_answer: "bg-gray-100 text-gray-700 border-gray-200",
  callback: "bg-indigo-100 text-indigo-800 border-indigo-200",
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
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

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
  const deliveryEvents = events.filter(e => e.eventType === "parcel_created" || e.eventType === "label_created");

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
  const canCreateParcel = (o.status === "confirmed" || o.status === "self_confirmed") && !shipment;

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

            {canCreateParcel && (
              <button onClick={() => setDispatchOpen(true)} className="shrink-0 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 flex items-center gap-1.5 transition-colors">
                <Truck className="w-4 h-4" /> Create Parcel
              </button>
            )}
            <button onClick={handlePrint} className="shrink-0 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary flex items-center gap-1.5 transition-colors">
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
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
                    <div className="flex rounded-lg border border-border overflow-hidden text-xs font-bold">
                      {(["home_delivery", "stopdesk"] as const).map(opt => (
                        <button
                          key={opt}
                          onClick={async () => { await updateOrder.mutateAsync({ id: id!, data: { shippingOption: opt } as any }); refetch(); }}
                          className={`px-3 py-1.5 transition-colors ${(o.shippingOption || "home_delivery") === opt ? "bg-primary text-white" : "bg-background text-muted-foreground hover:bg-secondary"}`}
                        >
                          {opt === "home_delivery" ? "🏠 Home" : "🏢 Stop Desk"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Wilaya</span>
                    <select
                      value={order.wilaya}
                      onChange={async e => { await updateOrder.mutateAsync({ id: id!, data: { wilaya: e.target.value } as any }); refetch(); }}
                      className="font-medium text-foreground bg-transparent text-right outline-none cursor-pointer"
                    >
                      {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  {order.address && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Commune / Address</span>
                      <span className="font-medium text-foreground text-right">{order.address}</span>
                    </div>
                  )}
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
                      <span className="text-muted-foreground">Delivery Company</span>
                      <span className="font-bold text-foreground">{String(shipment.carrier).toUpperCase()}</span>
                    </div>
                  )}
                </div>
                {!shipment && o.status !== "confirmed" && o.status !== "self_confirmed" && (
                  <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">Confirm the order to create a parcel.</p>
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
                  <h3 className="font-bold text-foreground">Order Items</h3>
                </div>
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
                        {item.variant && <p className="text-xs text-muted-foreground mt-0.5">{item.variant}</p>}
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
                        {o.shippingOption === "stopdesk" ? "Stop Desk" : "Home"}
                      </span>
                    </span>
                    <span className="font-medium text-foreground">DZD {shippingFee.toLocaleString()}</span>
                  </div>
                )}
                <div className="px-5 py-4 border-t border-border flex justify-between items-center bg-secondary/20 rounded-b-2xl">
                  <span className="font-bold text-foreground">Total</span>
                  <span className="font-bold text-xl text-foreground">DZD {Number(order.total).toLocaleString()}</span>
                </div>
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
                    {deliveryEvents.map((e, idx) => (
                      <TimelineEvent
                        key={e.id}
                        dotColor={e.eventType === "parcel_created" ? "bg-purple-500" : "bg-green-500"}
                        title={e.eventType === "parcel_created" ? "Colis créé" : "Label Created"}
                        subtitle={e.description}
                        timestamp={e.createdAt}
                        by={idx === deliveryEvents.length - 1 ? e.createdBy : undefined}
                      />
                    ))}
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

      {dispatchOpen && <DispatchModal orderId={id!} onClose={() => setDispatchOpen(false)} onDone={() => { refetch(); refetchEvents(); }} />}
    </AppLayout>
  );
}
