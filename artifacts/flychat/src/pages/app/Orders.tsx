import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Link } from "wouter";
import {
  Search, Plus, Trash2, Loader2, Package, PhoneCall, AlertTriangle, Truck,
  ShoppingBag, CheckCircle2, XCircle, TrendingUp, CalendarClock, Send,
} from "lucide-react";
import { DocButton } from "@/components/DocButton";
import { useCreateOrder, useGetProducts, useGetTeamMembers, getGetOrdersQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";

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
  new: "bg-blue-100 text-blue-800 border-blue-200",
  awaiting_confirmation: "bg-yellow-100 text-yellow-800 border-yellow-200",
  self_confirmation: "bg-amber-100 text-amber-800 border-amber-200",
  self_confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  no_answer: "bg-gray-100 text-gray-700 border-gray-200",
  callback: "bg-indigo-100 text-indigo-800 border-indigo-200",
  shipped: "bg-purple-100 text-purple-800 border-purple-200",
  delivered: "bg-teal-100 text-teal-800 border-teal-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  suspicious: "bg-orange-100 text-orange-800 border-orange-200",
};

const DELIVERY_OPTIONS = [
  { value: "not_shipped", label: "Non expédiée" },
  { value: "label_created", label: "Étiquette créée" },
  { value: "label_purchased", label: "Étiquette achetée" },
  { value: "label_printed", label: "Étiquette imprimée" },
  { value: "confirmed", label: "Confirmé" },
  { value: "in_transit", label: "En transit" },
  { value: "out_for_delivery", label: "En cours de livraison" },
  { value: "delivered", label: "Livré" },
  { value: "failed", label: "Échec" },
  { value: "cancelled", label: "Annulé" },
];

const DELIVERY_COLORS: Record<string, string> = {
  not_shipped: "bg-gray-100 text-gray-500",
  label_created: "bg-slate-100 text-slate-700",
  label_purchased: "bg-blue-100 text-blue-700",
  label_printed: "bg-cyan-100 text-cyan-700",
  confirmed: "bg-green-100 text-green-700",
  in_transit: "bg-indigo-100 text-indigo-700",
  out_for_delivery: "bg-orange-100 text-orange-700",
  delivered: "bg-teal-100 text-teal-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
};

// Real, currently-integrated order sources only — no placeholder entries for
// channels FlyChat COD doesn't actually connect to yet (e.g. TikTok, Snapchat,
// Google Sheets aren't wired anywhere in this codebase).
const SOURCE_OPTIONS = [
  { value: "shopify", label: "Shopify" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "messenger", label: "Facebook" },
  { value: "widget", label: "Widget" },
  { value: "manual", label: "Manuel" },
];

function SourceIcon({ source, className = "w-3.5 h-3.5" }: { source?: string; className?: string }) {
  const map: Record<string, { emoji: string; color: string }> = {
    shopify: { emoji: "🛍️", color: "text-green-600" },
    whatsapp: { emoji: "💬", color: "text-green-500" },
    instagram: { emoji: "📷", color: "text-pink-500" },
    messenger: { emoji: "💠", color: "text-blue-500" },
    widget: { emoji: "🌐", color: "text-blue-400" },
    manual: { emoji: "✍️", color: "text-gray-400" },
  };
  const s = map[source || ""] || map.manual;
  return <span className={`${className} ${s.color} inline-flex items-center justify-center leading-none`} title={source}>{s.emoji}</span>;
}

interface OrderItem { productName: string; variant: string; quantity: number; price: number; }
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
    createMutation.mutate({ data: { customerName: form.customerName, customerPhone: form.customerPhone, customerEmail: form.customerEmail || undefined, wilaya: form.wilaya, address: form.address || undefined, sellerNote: form.sellerNote || undefined, items: items.map(i => ({ productName: i.productName, variant: i.variant || undefined, quantity: i.quantity, price: i.price })) } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() }); queryClient.invalidateQueries({ queryKey: ["orders-list"] }); queryClient.invalidateQueries({ queryKey: ["orders-stats"] }); onClose(); } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center"><Package className="w-5 h-5 text-primary" /></div>
            <div><h2 className="text-lg font-bold text-foreground">Create New Order</h2><p className="text-xs text-muted-foreground">Cash on Delivery</p></div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">✕</button>
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

// ─── Dispatch modal — pick a connected carrier account to create a colis ──────
function DispatchModal({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
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

// ─── KPI summary bar ────────────────────────────────────────────────────────────
function KpiCard({ icon, iconBg, label, value, sub }: { icon: React.ReactNode; iconBg: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

interface Filters {
  search: string; status: string; source: string; delivery: string;
  carrier: string; agent: string; product: string; dateFrom: string; dateTo: string;
}
const EMPTY_FILTERS: Filters = { search: "", status: "all", source: "all", delivery: "all", carrier: "all", agent: "all", product: "all", dateFrom: "", dateTo: "" };

export default function Orders() {
  const [showCreate, setShowCreate] = useState(false);
  const [callingOrderId, setCallingOrderId] = useState<string | null>(null);
  const [dispatchOrderId, setDispatchOrderId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [dateTab, setDateTab] = useState<"all" | "today" | "yesterday" | "week" | "custom">("all");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data: productsData } = useGetProducts({ limit: 200 });
  const { data: teamData } = useGetTeamMembers();

  const queryParams = useMemo(() => {
    const p: Record<string, string> = { limit: "50", sort };
    if (filters.search) p.search = filters.search;
    if (filters.status !== "all") p.status = filters.status;
    if (filters.source !== "all") p.source = filters.source;
    if (filters.delivery !== "all") p.delivery = filters.delivery;
    if (filters.carrier !== "all") p.carrier = filters.carrier;
    if (filters.agent !== "all") p.agent = filters.agent;
    if (filters.product !== "all") p.product = filters.product;
    if (filters.dateFrom) p.dateFrom = filters.dateFrom;
    if (filters.dateTo) p.dateTo = filters.dateTo;
    return p;
  }, [filters, sort]);

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["orders-list", queryParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/orders?${new URLSearchParams(queryParams)}`, { headers: authHeaders() });
      return res.json();
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ["orders-stats", queryParams],
    queryFn: async () => {
      const qp = { ...queryParams }; delete (qp as any).limit; delete (qp as any).sort;
      const res = await fetch(`${API_BASE}/api/orders/stats?${new URLSearchParams(qp)}`, { headers: authHeaders() });
      return res.json();
    },
  });

  const { data: carriersData } = useQuery({
    queryKey: ["carriers"],
    queryFn: async () => { const res = await fetch(`${API_BASE}/api/carriers`, { headers: authHeaders() }); return res.json(); },
  });

  const invalidateOrders = () => {
    queryClient.invalidateQueries({ queryKey: ["orders-list"] });
    queryClient.invalidateQueries({ queryKey: ["orders-stats"] });
  };

  const applyDateTab = (tab: typeof dateTab) => {
    setDateTab(tab);
    const now = new Date();
    const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOf = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    if (tab === "all") { setFilters(f => ({ ...f, dateFrom: "", dateTo: "" })); }
    else if (tab === "today") { setFilters(f => ({ ...f, dateFrom: startOf(now).toISOString(), dateTo: endOf(now).toISOString() })); }
    else if (tab === "yesterday") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      setFilters(f => ({ ...f, dateFrom: startOf(y).toISOString(), dateTo: endOf(y).toISOString() }));
    } else if (tab === "week") {
      const start = new Date(now); start.setDate(start.getDate() - start.getDay());
      setFilters(f => ({ ...f, dateFrom: startOf(start).toISOString(), dateTo: endOf(now).toISOString() }));
    }
  };

  const handleStatusChange = async (orderId: string, status: string) => {
    await fetch(`${API_BASE}/api/orders/${orderId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    invalidateOrders();
  };

  const handleAssignAgent = async (orderId: string, agentId: string) => {
    await fetch(`${API_BASE}/api/orders/${orderId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ assignedAgentId: agentId || null }),
    });
    invalidateOrders();
  };

  const handleVoiceCall = async (orderId: string) => {
    setCallingOrderId(orderId);
    try {
      const res = await fetch(`${API_BASE}/api/voice/call-order/${orderId}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) { alert("✅ AI call initiated! Customer will receive a call shortly."); invalidateOrders(); }
      else alert("❌ " + (data.message || "Failed to initiate call. Check voice configuration."));
    } catch { alert("❌ Network error. Please try again."); }
    finally { setCallingOrderId(null); }
  };

  const orders = ordersData?.orders || [];
  const products = productsData?.products || [];
  const teamMembers = teamData?.members || [];
  const carrierConnections = carriersData?.connections || [];

  return (
    <AppLayout>
      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} />}
      {dispatchOrderId && <DispatchModal orderId={dispatchOrderId} onClose={() => setDispatchOrderId(null)} onDone={invalidateOrders} />}
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

          {/* ── KPI summary bar ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={<ShoppingBag className="w-4 h-4 text-blue-600" />} iconBg="bg-blue-100" label="Total commandes" value={statsData?.total ?? "—"} sub={statsData ? `${statsData.today} aujourd'hui` : undefined} />
            <KpiCard icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} iconBg="bg-green-100" label="Confirmées" value={statsData?.confirmed ?? "—"} sub={statsData ? `${statsData.confirmedRate}%` : undefined} />
            <KpiCard icon={<XCircle className="w-4 h-4 text-red-600" />} iconBg="bg-red-100" label="Annulées" value={statsData?.cancelled ?? "—"} sub={statsData ? `${statsData.cancelledRate}%` : undefined} />
            <KpiCard icon={<AlertTriangle className="w-4 h-4 text-orange-600" />} iconBg="bg-orange-100" label="Échec livraison" value={statsData?.deliveryFailed ?? "—"} sub={statsData ? `${statsData.deliveryFailedRate}%` : undefined} />
            <KpiCard icon={<TrendingUp className="w-4 h-4 text-teal-600" />} iconBg="bg-teal-100" label="Taux de livraison" value={statsData ? `${statsData.deliveryRate}%` : "—"} />
            <KpiCard icon={<Truck className="w-4 h-4 text-purple-600" />} iconBg="bg-purple-100" label="Livrées / période" value={statsData?.delivered ?? "—"} />
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm flex flex-col">
            {/* ── Date quick tabs ── */}
            <div className="p-4 border-b border-border flex flex-wrap items-center gap-2">
              {[["all", "Tout"], ["today", "Aujourd'hui"], ["yesterday", "Hier"], ["week", "Cette semaine"]].map(([key, label]) => (
                <button key={key} onClick={() => applyDateTab(key as any)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${dateTab === key ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/70"}`}>{label}</button>
              ))}
              <div className="flex items-center gap-1.5">
                <button onClick={() => setDateTab("custom")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${dateTab === "custom" ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/70"}`}>Plus</button>
                {dateTab === "custom" && (
                  <>
                    <input type="date" onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value ? new Date(e.target.value).toISOString() : "" }))} className="px-2 py-1 border border-border rounded-lg text-xs" />
                    <span className="text-xs text-muted-foreground">→</span>
                    <input type="date" onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : "" }))} className="px-2 py-1 border border-border rounded-lg text-xs" />
                  </>
                )}
              </div>
            </div>

            {/* ── Filter bar ── */}
            <div className="p-4 border-b border-border flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} type="text" placeholder="Order #, customer, phone..." className="w-full pl-9 pr-4 py-2 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
              </div>

              <select value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">All sources</option>
                {SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">All statuses</option>
                <option value="duplicate">⚠ Duplicate</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>

              <select value={filters.delivery} onChange={e => setFilters(f => ({ ...f, delivery: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">All delivery</option>
                {DELIVERY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>

              <select value={filters.carrier} onChange={e => setFilters(f => ({ ...f, carrier: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">All companies</option>
                <option value="none">Sans colis</option>
                {carrierConnections.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>

              <select value={filters.agent} onChange={e => setFilters(f => ({ ...f, agent: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">All agents</option>
                <option value="unassigned">Unassigned</option>
                {teamMembers.map((m: any) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>

              <select value={filters.product} onChange={e => setFilters(f => ({ ...f, product: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">All products</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-medium">Commande</th>
                    <th className="px-4 py-3 font-medium">Agent</th>
                    <th className="px-4 py-3 font-medium">Suivi</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Ville</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 font-medium">Exécution</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium cursor-pointer select-none" onClick={() => setSort(s => s === "desc" ? "asc" : "desc")}>
                      Date {sort === "desc" ? "↓" : "↑"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={9} className="px-6 py-8 text-center">{t("common.loading")}</td></tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center"><Package className="w-7 h-7" /></div>
                          <p className="font-medium">No orders found</p>
                          <button onClick={() => setShowCreate(true)} className="text-primary text-sm font-semibold hover:underline">Create your first order →</button>
                        </div>
                      </td>
                    </tr>
                  ) : orders.map((order: any) => {
                    const displayOrderNum = order.shopifyOrderNumber || order.orderNumber;
                    const dup: string[] = order.duplicateOf || [];
                    const shipment = order.shipment;
                    return (
                      <tr key={order.id} className="hover:bg-secondary/30 transition-colors">
                        {/* Commande */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <SourceIcon source={order.source} />
                            <Link href={`/orders/${order.id}`} className="font-bold text-foreground hover:text-primary hover:underline">
                              {displayOrderNum}
                            </Link>
                            {dup.length > 0 && (
                              <span className="relative group inline-flex">
                                <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 z-20 shadow-lg">
                                  Possible duplicate of: {dup.join(", ")}
                                </span>
                              </span>
                            )}
                          </div>
                          {order.createdBySource === 'ai' && order.cancelledBySource !== 'ai' && (
                            <span className="mt-0.5 inline-flex items-center px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-[10px] font-bold w-fit">✦ AI</span>
                          )}
                        </td>

                        {/* Agent */}
                        <td className="px-4 py-3">
                          <select
                            value={order.assignedAgentId || ""}
                            onChange={e => handleAssignAgent(order.id, e.target.value)}
                            className={`px-2 py-1 rounded-lg text-xs font-semibold border outline-none cursor-pointer ${order.assignedAgentId ? "bg-secondary text-foreground border-border" : "bg-gray-50 text-muted-foreground border-gray-200"}`}
                          >
                            <option value="">Unassigned</option>
                            {teamMembers.map((m: any) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                          </select>
                        </td>

                        {/* Suivi */}
                        <td className="px-4 py-3">
                          {shipment ? (
                            <div className="flex flex-col gap-0.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold w-fit ${DELIVERY_COLORS[shipment.status] || "bg-gray-100 text-gray-600"}`}>
                                {String(shipment.carrier).slice(0, 3).toUpperCase()}
                              </span>
                              {shipment.trackingNumber && <span className="text-[10px] text-muted-foreground">{shipment.trackingNumber}</span>}
                            </div>
                          ) : order.status === "confirmed" || order.status === "self_confirmed" ? (
                            <button onClick={() => setDispatchOrderId(order.id)} className="inline-flex items-center gap-1 px-2 py-1 text-primary bg-primary/10 hover:bg-primary/20 rounded-lg text-[11px] font-bold transition-colors">
                              <Send className="w-3 h-3" /> Créer colis
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sans colis</span>
                          )}
                        </td>

                        {/* Client */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <SourceIcon source={order.source} className="w-3 h-3" />
                            {order.customerName}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{order.customerPhone}</div>
                        </td>

                        {/* Ville */}
                        <td className="px-4 py-3 text-xs font-medium text-foreground">{order.wilaya || "—"}</td>

                        {/* Statut */}
                        <td className="px-4 py-3">
                          <select
                            value={order.status}
                            onChange={e => handleStatusChange(order.id, e.target.value)}
                            className={`px-2 py-1 rounded-lg border font-bold text-[11px] outline-none cursor-pointer ${STATUS_COLORS[order.status] || ""}`}
                          >
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                          </select>
                        </td>

                        {/* Exécution */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${DELIVERY_COLORS[shipment?.status || "not_shipped"]}`}>
                            {DELIVERY_OPTIONS.find(d => d.value === (shipment?.status || "not_shipped"))?.label}
                          </span>
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3 font-bold text-foreground text-right">DZD {Number(order.total).toLocaleString()}</td>

                        {/* Date */}
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          <div className="flex items-center gap-2">
                            <div>
                              {format(new Date(order.createdAt), 'MMM dd, yyyy')}
                              <div className="text-[10px]">{format(new Date(order.createdAt), 'HH:mm')}</div>
                            </div>
                            {(order.status === "new" || order.status === "awaiting_confirmation") && (
                              <button
                                onClick={() => handleVoiceCall(order.id)}
                                disabled={callingOrderId === order.id}
                                title="Trigger AI confirmation call"
                                className="inline-flex items-center p-1.5 text-orange-500 hover:text-white hover:bg-orange-500 bg-orange-50 border border-orange-200 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {callingOrderId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-border flex justify-between items-center text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> Showing {orders.length} of {ordersData?.total ?? 0} orders</span>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
