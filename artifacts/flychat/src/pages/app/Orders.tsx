import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Link } from "wouter";
import { Search, Filter, Eye, X, Plus, Trash2, Loader2, Package, PhoneCall } from "lucide-react";
import { DocButton } from "@/components/DocButton";
import { useGetOrders, useCreateOrder, getGetOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { Badge } from "@/components/ui/badge";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

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

interface OrderItem {
  productName: string;
  variant: string;
  quantity: number;
  price: number;
}

const defaultItem = (): OrderItem => ({ productName: "", variant: "", quantity: 1, price: 0 });

function CreateOrderModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const createMutation = useCreateOrder();
  const [form, setForm] = useState({ customerName: "", customerPhone: "", customerEmail: "", wilaya: "", address: "", sellerNote: "" });
  const [items, setItems] = useState<OrderItem[]>([defaultItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const updateItem = (idx: number, field: keyof OrderItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.customerName.trim()) errs.customerName = "Customer name is required";
    if (!form.customerPhone.trim()) errs.customerPhone = "Phone number is required";
    if (!form.wilaya) errs.wilaya = "Wilaya is required";
    if (items.length === 0) errs.items = "At least one item is required";
    items.forEach((item, idx) => {
      if (!item.productName.trim()) errs[`item_${idx}_name`] = "Product name required";
      if (item.price <= 0) errs[`item_${idx}_price`] = "Price must be > 0";
      if (item.quantity < 1) errs[`item_${idx}_qty`] = "Quantity must be at least 1";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createMutation.mutate({ data: { customerName: form.customerName, customerPhone: form.customerPhone, customerEmail: form.customerEmail || undefined, wilaya: form.wilaya, address: form.address || undefined, sellerNote: form.sellerNote || undefined, items: items.map(i => ({ productName: i.productName, variant: i.variant || undefined, quantity: i.quantity, price: i.price })) } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() }); onClose(); } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center"><Package className="w-5 h-5 text-primary" /></div>
            <div><h2 className="text-lg font-bold text-foreground">Create New Order</h2><p className="text-xs text-muted-foreground">Cash on Delivery</p></div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Customer Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name <span className="text-red-500">*</span></label>
                <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 ${errors.customerName ? "border-red-400" : "border-border"}`} placeholder="Ahmed Benali" />
                {errors.customerName && <p className="text-red-500 text-xs mt-1">{errors.customerName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone <span className="text-red-500">*</span></label>
                <input value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 ${errors.customerPhone ? "border-red-400" : "border-border"}`} placeholder="0550 123 456" />
                {errors.customerPhone && <p className="text-red-500 text-xs mt-1">{errors.customerPhone}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Email <span className="text-muted-foreground text-xs font-normal">(optional)</span></label>
                <input type="email" value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20" placeholder="customer@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Wilaya <span className="text-red-500">*</span></label>
                <select value={form.wilaya} onChange={e => setForm(f => ({ ...f, wilaya: e.target.value }))} className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white ${errors.wilaya ? "border-red-400" : "border-border"}`}>
                  <option value="">Select wilaya...</option>
                  {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                {errors.wilaya && <p className="text-red-500 text-xs mt-1">{errors.wilaya}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Address / Commune</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20" placeholder="Rue, commune..." />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Seller Note</label>
              <textarea value={form.sellerNote} onChange={e => setForm(f => ({ ...f, sellerNote: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder="Internal note about this order..." />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Order Items</h3>
              <button onClick={() => setItems(prev => [...prev, defaultItem()])} className="flex items-center gap-1 text-xs text-primary font-semibold hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"><Plus className="w-3 h-3" /> Add Item</button>
            </div>
            {errors.items && <p className="text-red-500 text-xs mb-2">{errors.items}</p>}
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="bg-secondary/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">Item {idx + 1}</span>
                    {items.length > 1 && <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input value={item.productName} onChange={e => updateItem(idx, "productName", e.target.value)} className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white ${errors[`item_${idx}_name`] ? "border-red-400" : "border-border"}`} placeholder="Product name *" />
                      {errors[`item_${idx}_name`] && <p className="text-red-500 text-xs mt-1">{errors[`item_${idx}_name`]}</p>}
                    </div>
                    <input value={item.variant} onChange={e => updateItem(idx, "variant", e.target.value)} className="px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white" placeholder="Variant (color, size...)" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white ${errors[`item_${idx}_qty`] ? "border-red-400" : "border-border"}`} placeholder="Qty" />
                      <input type="number" min={0} value={item.price || ""} onChange={e => updateItem(idx, "price", Number(e.target.value))} className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white ${errors[`item_${idx}_price`] ? "border-red-400" : "border-border"}`} placeholder="Price DZD" />
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">Subtotal: <span className="font-bold text-foreground">DZD {(item.price * item.quantity).toLocaleString()}</span></div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between items-center bg-primary/5 border border-primary/20 rounded-xl px-5 py-3">
              <span className="font-bold text-foreground">Total (COD)</span>
              <span className="text-xl font-bold text-primary">DZD {total.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-border shrink-0 flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={createMutation.isPending} className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition-colors">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : "Create Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
function PaymentBadge({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, string> = {
    paid: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    refunded: "bg-red-100 text-red-700 border-red-200",
    voided: "bg-gray-100 text-gray-600 border-gray-200",
    partially_paid: "bg-orange-100 text-orange-700 border-orange-200",
    partially_refunded: "bg-pink-100 text-pink-700 border-pink-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${map[status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function FulfillmentBadge({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, string> = {
    fulfilled: "bg-green-100 text-green-700 border-green-200",
    unfulfilled: "bg-gray-100 text-gray-500 border-gray-200",
    partial: "bg-yellow-100 text-yellow-700 border-yellow-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${map[status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function DeliveryBadge({ status }: { status?: string }) {
  if (!status || status === "pending") return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    delivered: "bg-teal-100 text-teal-700",
    in_transit: "bg-blue-100 text-blue-700",
    out_for_delivery: "bg-orange-100 text-orange-700",
    attempted_delivery: "bg-red-100 text-red-700",
    failure: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ChannelBadge({ channel }: { channel?: string }) {
  if (!channel) return null;
  const map: Record<string, string> = {
    online_store: "bg-blue-50 text-blue-700",
    messenger: "bg-blue-50 text-blue-600",
    instagram: "bg-pink-50 text-pink-700",
    web: "bg-green-50 text-green-700",
    draft_orders: "bg-gray-100 text-gray-600",
    pos: "bg-orange-50 text-orange-700",
  };
  const label = channel === "online_store" ? "Online Store"
    : channel === "draft_orders" ? "Draft"
    : channel.charAt(0).toUpperCase() + channel.slice(1);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[channel] || "bg-gray-100 text-gray-600"}`}>
      {label}
    </span>
  );
}

export default function Orders() {
  const [showCreate, setShowCreate] = useState(false);
  const [callingOrderId, setCallingOrderId] = useState<string | null>(null);
  const { data: ordersData, isLoading } = useGetOrders({ limit: 50 });
  const { t } = useI18n();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'awaiting_confirmation': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'confirmed': return 'bg-green-100 text-green-800 border-green-200';
      case 'shipped': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'delivered': return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleVoiceCall = async (orderId: string) => {
    setCallingOrderId(orderId);
    try {
      const token = localStorage.getItem("flychat_token") || "";
      const res = await fetch(`${API_BASE}/api/voice/call-order/${orderId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) alert("✅ AI call initiated! Customer will receive a call shortly.");
      else alert("❌ " + (data.message || "Failed to initiate call. Check voice configuration."));
    } catch {
      alert("❌ Network error. Please try again.");
    } finally {
      setCallingOrderId(null);
    }
  };

  return (
    <AppLayout>
      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} />}
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-full mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-display font-bold text-foreground">Orders</h1>
                <DocButton docId="orders" />
              </div>
              <p className="text-muted-foreground mt-1">Manage and confirm your Cash on Delivery orders.</p>
            </div>
            <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2 transition-colors">
              <Plus className="w-4 h-4" /> Create Order
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm flex flex-col">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="text" placeholder="Search order #, customer, phone..." className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
                </div>
                <button className="px-4 py-2.5 border border-border rounded-xl flex items-center gap-2 text-sm font-medium hover:bg-secondary">
                  <Filter className="w-4 h-4" /> Filter
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Channel</th>
                    <th className="px-4 py-3 font-medium">Items</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium">Fulfillment</th>
                    <th className="px-4 py-3 font-medium">Delivery</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">Tags</th>
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={13} className="px-6 py-8 text-center">{t("common.loading")}</td></tr>
                  ) : ordersData?.orders.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center"><Package className="w-7 h-7" /></div>
                          <p className="font-medium">No orders yet</p>
                          <button onClick={() => setShowCreate(true)} className="text-primary text-sm font-semibold hover:underline">Create your first order →</button>
                        </div>
                      </td>
                    </tr>
                  ) : ordersData?.orders.map((order) => {
                    const o = order as any;
                    const flags: string[] = o.flags || [];
                    const items: any[] = o.items || [];
                    const firstItem = items[0];
                    const displayOrderNum = o.shopifyOrderNumber || order.orderNumber;
                    return (
                      <tr key={order.id} className="hover:bg-secondary/30 transition-colors">
                        {/* Order # + flags */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <Link href={`/orders/${order.id}`} className="font-bold text-foreground hover:text-primary hover:underline">
                              {displayOrderNum}
                            </Link>
                            {flags.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold w-fit">
                                ⚠ {flags.length} flag{flags.length > 1 ? "s" : ""}
                              </span>
                            )}
                            {/* Source badges */}
                            {order.createdBySource === 'ai' && order.cancelledBySource !== 'ai' && (
                              <Badge className="bg-violet-100 text-violet-700 border-violet-200 gap-1 w-fit text-[10px]">
                                ✦ AI
                              </Badge>
                            )}
                            {order.cancelledBySource === 'ai' && (
                              <Badge className="bg-orange-100 text-orange-700 border-orange-200 gap-1 w-fit text-[10px]">
                                ✦ AI Cancelled
                              </Badge>
                            )}
                          </div>
                        </td>
                        {/* Date */}
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {format(new Date(order.createdAt), 'MMM dd, yyyy')}
                          <div className="text-[10px]">{format(new Date(order.createdAt), 'HH:mm')}</div>
                        </td>
                        {/* Customer */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{order.customerName}</div>
                          {o.customerEmail && <div className="text-[11px] text-muted-foreground">{o.customerEmail}</div>}
                          <div className="text-[11px] text-muted-foreground">{order.customerPhone}</div>
                        </td>
                        {/* Channel */}
                        <td className="px-4 py-3">
                          <ChannelBadge channel={o.salesChannel} />
                        </td>
                        {/* Items */}
                        <td className="px-4 py-3">
                          {items.length > 0 ? (
                            <div>
                              <div className="text-xs font-medium text-foreground max-w-[140px] truncate">
                                {firstItem?.title || firstItem?.productName || "—"}
                              </div>
                              {firstItem?.variant_title && (
                                <div className="text-[10px] text-muted-foreground">{firstItem.variant_title}</div>
                              )}
                              <div className="text-[10px] text-muted-foreground">
                                {items.length > 1 ? `+${items.length - 1} more · ` : ""}
                                qty {items.reduce((s: number, i: any) => s + (i.quantity || 1), 0)}
                              </div>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        {/* Total */}
                        <td className="px-4 py-3 font-bold text-foreground">
                          DZD {Number(order.total).toLocaleString()}
                        </td>
                        {/* Payment status */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <PaymentBadge status={o.financialStatus} />
                            {/* FlyChat internal status if no Shopify financial status */}
                            {!o.financialStatus && (
                              <span className={`inline-flex border items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${getStatusColor(order.status)}`}>
                                {t(`status.${order.status}`)}
                              </span>
                            )}
                            {o.confirmedBySource === 'ai_call' && order.status === 'confirmed' && (
                              <Badge className="bg-green-100 text-green-700 border-green-200 w-fit text-[10px]">🤖 AI Call</Badge>
                            )}
                          </div>
                        </td>
                        {/* Fulfillment */}
                        <td className="px-4 py-3">
                          <FulfillmentBadge status={o.fulfillmentStatus} />
                        </td>
                        {/* Delivery status */}
                        <td className="px-4 py-3">
                          <DeliveryBadge status={o.deliveryStatus} />
                        </td>
                        {/* Delivery method */}
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[100px] truncate">
                          {order.shippingOption || o.shippingOption || "—"}
                        </td>
                        {/* Tags */}
                        <td className="px-4 py-3">
                          {o.tags ? (
                            <div className="flex flex-wrap gap-1 max-w-[120px]">
                              {String(o.tags).split(",").slice(0, 3).map((tag: string) => (
                                <span key={tag} className="px-1.5 py-0.5 bg-secondary text-muted-foreground rounded text-[10px]">
                                  {tag.trim()}
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        {/* Destination */}
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-foreground">{order.wilaya || "—"}</div>
                          {o.shippingAddress?.city && o.shippingAddress.city !== order.wilaya && (
                            <div className="text-[10px] text-muted-foreground">{o.shippingAddress.city}</div>
                          )}
                          {o.shippingAddress?.province && (
                            <div className="text-[10px] text-muted-foreground">{o.shippingAddress.province}</div>
                          )}
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(order.status === "awaiting_confirmation" || order.status === "new") && (
                              <button
                                onClick={() => handleVoiceCall(order.id)}
                                disabled={callingOrderId === order.id}
                                title="Trigger AI confirmation call"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-orange-500 hover:text-white hover:bg-orange-500 bg-orange-50 border border-orange-200 rounded-lg transition-colors disabled:opacity-50 text-xs font-bold"
                              >
                                {callingOrderId === order.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <PhoneCall className="w-3.5 h-3.5" />
                                }
                                {callingOrderId === order.id ? "Calling..." : "AI Call"}
                              </button>
                            )}
                            <Link href={`/orders/${order.id}`} className="inline-flex p-2 text-muted-foreground hover:text-primary bg-secondary hover:bg-primary/10 rounded-lg transition-colors">
                              <Eye className="w-4 h-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-border flex justify-between items-center text-sm text-muted-foreground">
              <span>Showing {ordersData?.orders.length || 0} orders</span>
              <div className="flex gap-2">
                <button className="px-3 py-1 border border-border rounded hover:bg-secondary disabled:opacity-50">Prev</button>
                <button className="px-3 py-1 border border-border rounded hover:bg-secondary disabled:opacity-50">Next</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}