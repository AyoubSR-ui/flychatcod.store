import { AppLayout } from "@/components/AppLayout";
import { Link, useParams } from "wouter";
import { ArrowLeft, Phone, MapPin, MessageSquare, Package, StickyNote } from "lucide-react";
import { useState } from "react";
import { useGetOrder, useUpdateOrder } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";

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

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, refetch } = useGetOrder(id!);
  const updateOrder = useUpdateOrder();
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
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

  if (isLoading) return <AppLayout><div className="p-10 flex justify-center"><div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full"/></div></AppLayout>;
  if (!order) return <AppLayout><div className="p-10 text-center text-muted-foreground">Order not found.</div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Link href="/orders" className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-display font-bold text-foreground">{order.orderNumber}</h1>
              <p className="text-sm text-muted-foreground">{format(new Date(order.createdAt), 'MMMM dd, yyyy · HH:mm')}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-green-100 text-green-800 border-green-200">COD</span>
              <select
                value={order.status}
                onChange={e => handleStatusChange(e.target.value)}
                className={`px-3 py-1.5 rounded-xl border font-bold text-sm outline-none cursor-pointer ${STATUS_COLORS[order.status] || ''}`}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Customer Info */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-foreground border-b border-border pb-3">Customer Info</h3>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Name</p>
                <p className="font-semibold text-foreground">{order.customerName}</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <a href={`tel:${order.customerPhone}`} className="font-medium hover:text-primary">{order.customerPhone}</a>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span>{order.wilaya}{order.address ? `, ${order.address}` : ''}</span>
              </div>
              {order.conversationId && (
                <Link href="/inbox" className="flex items-center gap-2 text-sm text-primary hover:underline pt-2 border-t border-border">
                  <MessageSquare className="w-4 h-4" /> View conversation
                </Link>
              )}
            </div>

            {/* Order Items */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-foreground">Order Items</h3>
                </div>
                <div className="divide-y divide-border/50">
                  {order.items?.map((item: any) => (
                    <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{item.productName}</p>
                        {item.variant && <p className="text-xs text-muted-foreground mt-0.5">Variant: {item.variant}</p>}
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-bold text-foreground">DZD {Number(item.price) * item.quantity}</p>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 border-t border-border flex justify-between items-center">
                  <span className="font-bold text-foreground">Total</span>
                  <span className="font-bold text-xl text-foreground">DZD {Number(order.total)}</span>
                </div>
              </div>

              {/* Seller Notes */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <StickyNote className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-foreground">Seller Notes</h3>
                </div>
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
                  className="mt-3 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingNote ? "Saving..." : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
