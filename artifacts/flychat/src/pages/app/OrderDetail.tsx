import { AppLayout } from "@/components/AppLayout";
import { Link, useParams } from "wouter";
import { ArrowLeft, Phone, MapPin, MessageSquare, Package, StickyNote } from "lucide-react";
import React, { useState } from "react";
import { useGetOrder, useUpdateOrder } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { Badge } from "@/components/ui/badge";

const STATUS_OPTIONS = ["new","awaiting_confirmation","confirmed","shipped","delivered","cancelled","suspicious"] as const;
const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 border-blue-200",
  awaiting_confirmation: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  shipped: "bg-purple-100 text-purple-800 border-purple-200",
  delivered: "bg-teal-100 text-teal-800 border-teal-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  suspicious: "bg-orange-100 text-orange-800 border-orange-200",
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
            onClick={async () => {
              setSaving(true);
              await onSave(val);
              setSaving(false);
              setEditing(false);
            }}
            disabled={saving}
            className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => { setVal(value); setEditing(false); }}
            className="px-4 py-1.5 border border-border rounded-lg text-xs hover:bg-secondary"
          >
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
        {href ? (
          <a href={href} className="font-medium truncate hover:text-primary">{value}</a>
        ) : (
          <span className="font-medium truncate">{value}</span>
        )}
      </div>
      {/* Mobile: always visible. Desktop: visible on hover only */}
      <button
        onClick={() => setEditing(true)}
        className="shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-xs text-muted-foreground hover:text-primary px-2 py-1 rounded border border-border hover:border-primary"
      >
        Edit
      </button>
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
  const { t } = useI18n();

  const handleStatusChange = async (status: string) => {
    await updateOrder.mutateAsync({ id: id!, data: { status: status as any } });
    refetch();
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    await updateOrder.mutateAsync({ id: id!, data: { sellerNote: note } });
    setSavingNote(false);
    refetch();
  };

  if (isLoading) return (
    <AppLayout>
      <div className="p-10 flex justify-center">
        <div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full"/>
      </div>
    </AppLayout>
  );
  if (!order) return (
    <AppLayout>
      <div className="p-10 text-center text-muted-foreground">Order not found.</div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background">

        {/* ── Sticky Header ──────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 lg:px-10 lg:py-5">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <Link href="/orders" className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg lg:text-2xl font-display font-bold text-foreground truncate">{order.orderNumber}</h1>
              <p className="text-xs lg:text-sm text-muted-foreground">{format(new Date(order.createdAt), 'MMM dd, yyyy · HH:mm')}</p>
            </div>
            {/* Badges — hidden on small screens to save space */}
            <div className="hidden sm:flex items-center gap-2 flex-wrap shrink-0">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-green-100 text-green-800 border-green-200">COD</span>
              {order.createdBySource === 'ai' && order.cancelledBySource !== 'ai' && (
                <Badge className="bg-violet-100 text-violet-700 border-violet-200 gap-1">
                  <span className="text-[10px]">✦</span> AI Created
                </Badge>
              )}
              {order.cancelledBySource === 'ai' && (
                <Badge className="bg-orange-100 text-orange-700 border-orange-200 gap-1">
                  <span className="text-[10px]">✦</span> AI Cancelled
                </Badge>
              )}
            </div>
            {/* Status select — always visible, smaller on mobile */}
            <select
              value={order.status}
              onChange={e => handleStatusChange(e.target.value)}
              className={`shrink-0 px-2 py-1.5 lg:px-3 rounded-xl border font-bold text-xs lg:text-sm outline-none cursor-pointer ${STATUS_COLORS[order.status] || ''}`}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
            </select>
          </div>
        </div>

        {/* ── Page Body ──────────────────────────────────────────────────────── */}
        <div className="p-4 lg:p-10">
          <div className="max-w-5xl mx-auto space-y-4 lg:space-y-6">

            {/* Mobile-only badges row */}
            <div className="flex sm:hidden items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border bg-green-100 text-green-800 border-green-200">COD</span>
              {order.createdBySource === 'ai' && order.cancelledBySource !== 'ai' && (
                <Badge className="bg-violet-100 text-violet-700 border-violet-200 gap-1 text-xs">
                  <span className="text-[10px]">✦</span> AI Created
                </Badge>
              )}
              {order.cancelledBySource === 'ai' && (
                <Badge className="bg-orange-100 text-orange-700 border-orange-200 gap-1 text-xs">
                  <span className="text-[10px]">✦</span> AI Cancelled
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">

              {/* ── Customer Info ─────────────────────────────────────────────── */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-foreground border-b border-border pb-3">Customer Info</h3>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Name</p>
                  <p className="font-semibold text-foreground">{order.customerName}</p>
                </div>

                {/* Phone — tappable tel link + inline edit */}
                <EditableField
                  icon={<Phone className="w-4 h-4 text-muted-foreground shrink-0" />}
                  value={order.customerPhone}
                  href={`tel:${order.customerPhone}`}
                  onSave={async (val) => {
                    await updateOrder.mutateAsync({ id: id!, data: { customerPhone: val } as any });
                    refetch();
                  }}
                />

                {/* Address — inline edit */}
                <EditableField
                  icon={<MapPin className="w-4 h-4 text-muted-foreground shrink-0" />}
                  value={order.wilaya + (order.address ? `, ${order.address}` : '')}
                  onSave={async (val) => {
                    await updateOrder.mutateAsync({ id: id!, data: { address: val } as any });
                    refetch();
                  }}
                />

                {order.conversationId && (
                  <Link href="/inbox" className="flex items-center gap-2 text-sm text-primary hover:underline pt-2 border-t border-border">
                    <MessageSquare className="w-4 h-4" /> View conversation
                  </Link>
                )}
              </div>

              {/* ── Right Column ──────────────────────────────────────────────── */}
              <div className="lg:col-span-2 space-y-4 lg:space-y-6">

                {/* Order Items */}
                <div className="bg-card border border-border rounded-2xl shadow-sm">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary" />
                    <h3 className="font-bold text-foreground">Order Items</h3>
                  </div>
                  <div className="divide-y divide-border/50">
                    {order.items?.map((item: any) => (
                      <div key={item.id} className="px-5 py-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{item.productName}</p>
                          {item.variant && <p className="text-xs text-muted-foreground mt-0.5">Variant: {item.variant}</p>}
                          <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                        </div>
                        <p className="font-bold text-foreground shrink-0">DZD {(Number(item.price) * item.quantity).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>

                  {/* Subtotal */}
                  <div className="px-5 py-3 border-t border-border flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium text-foreground">
                      DZD {order.items?.reduce((sum: number, i: any) => sum + Number(i.price) * i.quantity, 0).toLocaleString()}
                    </span>
                  </div>

                  {/* Shipping */}
                  {Number((order as any).shippingFee) > 0 && (
                    <div className="px-5 py-3 border-t border-border flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        Shipping
                        {(order as any).shippingOption && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-medium">
                            {(order as any).shippingOption === "home_delivery" ? "الى البيت" : "من الفرع"}
                          </span>
                        )}
                      </span>
                      <span className="font-medium text-foreground">DZD {Number((order as any).shippingFee).toLocaleString()}</span>
                    </div>
                  )}

                  {/* Total */}
                  <div className="px-5 py-4 border-t border-border flex justify-between items-center bg-secondary/20 rounded-b-2xl">
                    <span className="font-bold text-foreground">Total</span>
                    <span className="font-bold text-xl text-foreground">DZD {Number(order.total).toLocaleString()}</span>
                  </div>
                </div>

                {/* Seller Notes — collapsible on mobile, always open on desktop */}
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  {/* Header — tappable on mobile to expand */}
                  <button
                    className="w-full flex items-center gap-2 px-5 py-4 text-left lg:cursor-default"
                    onClick={() => setNotesOpen(o => !o)}
                  >
                    <StickyNote className="w-5 h-5 text-primary shrink-0" />
                    <h3 className="font-bold text-foreground flex-1">Seller Notes</h3>
                    <span className="lg:hidden text-muted-foreground text-xs">{notesOpen ? '▲' : '▼'}</span>
                  </button>

                  {/* Content — hidden on mobile until tapped, always visible on desktop */}
                  <div className={`px-5 pb-5 ${notesOpen ? 'block' : 'hidden'} lg:block`}>
                    <textarea
                      defaultValue={order.sellerNote || ""}
                      onChange={e => setNote(e.target.value)}
                      rows={4}
                      placeholder="Add internal notes about this order..."
                      className="w-full border border-border rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-primary/20 outline-none bg-background"
                    />
                    <button
                      onClick={handleSaveNote}
                      disabled={savingNote}
                      className="mt-3 w-full lg:w-auto px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
                    >
                      {savingNote ? "Saving..." : t("common.save")}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}