import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Link } from "wouter";
import {
  Search, Plus, Loader2, Package, PhoneCall, AlertTriangle, Truck,
  ShoppingBag, CheckCircle2, XCircle, TrendingUp, Send, RotateCw,
} from "lucide-react";
import { DocButton } from "@/components/DocButton";
import { DispatchModal } from "@/components/DispatchModal";
import { Pagination } from "@/components/Pagination";
import { useCreateOrder, useGetProducts, useGetTeamMembers, useGetWilayas, getGetOrdersQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/hooks/use-auth";
import { useCarrierCommunes, getCommunesForWilaya, getCommuneDropdownOptions, communeHasStopDesk } from "@/hooks/use-carrier-communes";
import { useShippingFeeAutofill, type ShippingDeliveryType } from "@/hooks/use-shipping-fee";
import { ProductPicker, ProductPickerItem } from "@/components/ProductPicker";
import { authFetch } from "@/lib/auth-fetch";

const STATUS_OPTIONS = [
  "new", "awaiting_confirmation", "self_confirmation", "self_confirmed", "confirmed",
  "no_answer", "callback", "scheduled", "shipped", "delivered", "cancelled", "suspicious",
] as const;

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 border-blue-200",
  awaiting_confirmation: "bg-yellow-100 text-yellow-800 border-yellow-200",
  self_confirmation: "bg-amber-100 text-amber-800 border-amber-200",
  self_confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  no_answer: "bg-gray-100 text-gray-700 border-gray-200",
  callback: "bg-indigo-100 text-indigo-800 border-indigo-200",
  scheduled: "bg-sky-100 text-sky-800 border-sky-200",
  shipped: "bg-purple-100 text-purple-800 border-purple-200",
  delivered: "bg-teal-100 text-teal-800 border-teal-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  suspicious: "bg-orange-100 text-orange-800 border-orange-200",
};

const DELIVERY_VALUES = [
  "not_shipped", "label_created", "label_purchased", "label_printed", "confirmed",
  "in_transit", "out_for_delivery", "delivered", "failed", "cancelled",
] as const;
const getDeliveryOptions = (t: (key: string) => string) =>
  DELIVERY_VALUES.map(value => ({ value, label: t(`delivery.${value}`) }));

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
const getSourceOptions = (t: (key: string) => string) => [
  { value: "shopify", label: t("source.shopify") },
  { value: "whatsapp", label: t("source.whatsapp") },
  { value: "instagram", label: t("source.instagram") },
  { value: "messenger", label: t("source.facebook") },
  { value: "widget", label: t("source.widget") },
  { value: "manual", label: t("source.manual") },
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

function CreateOrderModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const createMutation = useCreateOrder();
  const { data: wilayasData } = useGetWilayas();
  const wilayas = wilayasData?.wilayas || [];
  const { data: communesData } = useCarrierCommunes();
  const [form, setForm] = useState({
    customerName: "", customerPhone: "", customerEmail: "",
    wilaya: "", commune: "", address: "", sellerNote: "",
    shippingOption: "home_delivery" as ShippingDeliveryType,
    shippingFee: 0,
  });
  const [items, setItems] = useState<ProductPickerItem[]>([]);
  const [shippingFeeManuallyEdited, setShippingFeeManuallyEdited] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const total = subtotal + form.shippingFee;
  const deliveryType: "home" | "stopdesk" = form.shippingOption === "stopdesk" ? "stopdesk" : "home";
  const allCommunesForWilaya = getCommunesForWilaya(communesData, form.wilaya);
  const isStaticCommuneSource = communesData?.source === "static";
  const communesForWilaya = getCommuneDropdownOptions(allCommunesForWilaya, deliveryType, isStaticCommuneSource, t("common.stop_desk_suffix"));

  // Same source and rules as OrderDetail/Inbox — see use-shipping-fee.ts.
  // Stops entirely once the agent types into the fee field directly.
  const fetchingShippingFee = useShippingFeeAutofill(
    form.wilaya, form.shippingOption, shippingFeeManuallyEdited,
    fee => setForm(f => ({ ...f, shippingFee: fee }))
  );

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.customerName.trim()) errs.customerName = t("orders.modal.err.name_required");
    if (!form.customerPhone.trim()) errs.customerPhone = t("orders.modal.err.phone_required");
    if (!form.wilaya) errs.wilaya = t("orders.modal.err.wilaya_required");
    if (communesForWilaya.length > 0 && !form.commune) errs.commune = t("orders.modal.err.commune_required");
    if (items.length === 0) errs.items = t("order.items_required");
    items.forEach((item, idx) => {
      if (!item.productName.trim()) errs[`item_${idx}`] = t("orders.modal.err.product_name_required");
      if (item.price <= 0) errs[`item_${idx}_price`] = t("order.price_required");
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createMutation.mutate({
      data: {
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail || undefined,
        wilaya: form.wilaya,
        commune: form.commune || undefined,
        address: form.address || undefined,
        sellerNote: form.sellerNote || undefined,
        shippingOption: form.shippingOption,
        shippingFee: form.shippingFee,
        items: items.map(i => ({ productId: i.productId, productName: i.productName, variant: i.variant || undefined, quantity: i.quantity, price: i.price })),
      } as any,
    }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() }); queryClient.invalidateQueries({ queryKey: ["orders-list"] }); queryClient.invalidateQueries({ queryKey: ["orders-stats"] }); onClose(); } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center"><Package className="w-5 h-5 text-primary" /></div>
            <div><h2 className="text-lg font-bold text-foreground">{t("orders.modal.title")}</h2><p className="text-xs text-muted-foreground">{t("orders.modal.subtitle")}</p></div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">{t("order.customer_info")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t("order.name")} <span className="text-red-500">*</span></label>
                <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 ${errors.customerName ? "border-red-400" : "border-border"}`} placeholder="Ahmed Benali" />
                {errors.customerName && <p className="text-red-500 text-xs mt-1">{errors.customerName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("order.phone")} <span className="text-red-500">*</span></label>
                <input value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 ${errors.customerPhone ? "border-red-400" : "border-border"}`} placeholder="0550 123 456" />
                {errors.customerPhone && <p className="text-red-500 text-xs mt-1">{errors.customerPhone}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">{t("order.email")}</label>
                <input type="email" value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20" placeholder="customer@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("order.wilaya")} <span className="text-red-500">*</span></label>
                <select value={form.wilaya} onChange={e => setForm(f => ({ ...f, wilaya: e.target.value, commune: "" }))} className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white ${errors.wilaya ? "border-red-400" : "border-border"}`}>
                  <option value="">{t("orders.modal.select_wilaya")}</option>
                  {wilayas.map(w => <option key={w.code} value={w.name}>{w.name}</option>)}
                </select>
                {errors.wilaya && <p className="text-red-500 text-xs mt-1">{errors.wilaya}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("orderDetail.commune")} {communesForWilaya.length > 0 && <span className="text-red-500">*</span>}</label>
                <select
                  value={form.commune}
                  onChange={e => setForm(f => ({ ...f, commune: e.target.value }))}
                  disabled={!form.wilaya || communesForWilaya.length === 0}
                  className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white disabled:opacity-50 disabled:cursor-not-allowed ${errors.commune ? "border-red-400" : "border-border"}`}
                >
                  <option value="">{form.wilaya ? t("orders.modal.select_commune") : t("orders.modal.select_wilaya_first")}</option>
                  {communesForWilaya.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                {errors.commune && <p className="text-red-500 text-xs mt-1">{errors.commune}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("orderDetail.delivery_type")}</label>
                <div className="flex rounded-xl border border-border overflow-hidden text-sm font-bold">
                  {(["home_delivery", "stopdesk"] as const).map(opt => (
                    <button key={opt} type="button"
                      onClick={() => {
                        // Same rule as OrderDetail/Inbox: switching to Stop Desk
                        // clears the commune if this store's carrier data says
                        // it has no desk there. Static-source data never clears.
                        const shouldClearCommune = opt === "stopdesk" && !isStaticCommuneSource
                          && !!form.commune && !communeHasStopDesk(allCommunesForWilaya, form.commune);
                        setForm(f => ({ ...f, shippingOption: opt, ...(shouldClearCommune ? { commune: "" } : {}) }));
                      }}
                      className={`flex-1 py-2 transition-colors ${form.shippingOption === opt ? "bg-primary text-white" : "bg-white text-muted-foreground hover:bg-secondary"}`}
                    >
                      {opt === "home_delivery" ? t("orderDetail.home") : t("orderDetail.stopdesk")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("orderDetail.shipping_fee")}</label>
                <div className="flex items-center gap-1.5">
                  {fetchingShippingFee && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
                  <span className="text-xs text-muted-foreground shrink-0">DZD</span>
                  <input type="number" min={0} value={form.shippingFee}
                    onChange={e => { setShippingFeeManuallyEdited(true); setForm(f => ({ ...f, shippingFee: Number(e.target.value) || 0 })); }}
                    className="w-full px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">{t("orders.modal.street_address")}</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20" placeholder="Rue Larbi Ben M'hidi..." />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">{t("order.note")}</label>
              <textarea value={form.sellerNote} onChange={e => setForm(f => ({ ...f, sellerNote: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder={t("orders.modal.note_placeholder")} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">{t("orders.modal.order_items")}</h3>
            <ProductPicker items={items} errors={errors} onChange={setItems} />
            <div className="mt-4 bg-primary/5 border border-primary/20 rounded-xl px-5 py-3 space-y-1">
              {form.shippingFee > 0 && (
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>{t("inbox.subtotal_line").replace("{subtotal}", subtotal.toLocaleString()).replace("{shipping}", form.shippingFee.toLocaleString())}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="font-bold text-foreground">{t("orders.modal.total_cod")}</span>
                <span className="text-xl font-bold text-primary">DZD {total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-border shrink-0 flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors">{t("common.cancel")}</button>
          <button onClick={handleSubmit} disabled={createMutation.isPending} className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition-colors">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("orders.modal.creating")}</> : t("order.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dispatch modal — pick a connected carrier account to create a colis ──────
// ─── KPI summary bar ────────────────────────────────────────────────────────────
function KpiCard({ icon, iconBg, label, value, sub }: { icon: React.ReactNode; iconBg: string; label: string; value: React.ReactNode; sub?: string }) {
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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const { t } = useI18n();
  const DELIVERY_OPTIONS = getDeliveryOptions(t);
  const SOURCE_OPTIONS = getSourceOptions(t);
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const { data: productsData } = useGetProducts({ limit: 200 });
  // GET /api/team/members is requireOwner-gated server-side (team.ts) — even
  // admins 403 there, not just agents. Already degraded gracefully (teamData
  // stays undefined, teamMembers falls back to []), but there's no reason to
  // fire a request every non-owner is guaranteed to get a 403 on.
  const { data: teamData } = useGetTeamMembers({ query: { enabled: user?.role === "owner" } });

  useEffect(() => { setPage(1); }, [filters, sort]);

  const queryParams = useMemo(() => {
    const p: Record<string, string> = { limit: String(limit), page: String(page), sort };
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
  }, [filters, sort, page, limit]);

  const { data: ordersData, isLoading, isError: ordersIsError, refetch: refetchOrders } = useQuery({
    queryKey: ["orders-list", queryParams],
    queryFn: () => authFetch<any>(`/api/orders?${new URLSearchParams(queryParams)}`),
  });

  const { data: statsData, isLoading: statsIsLoading, isError: statsIsError, refetch: refetchStats } = useQuery({
    queryKey: ["orders-stats", queryParams],
    queryFn: () => {
      const qp = { ...queryParams }; delete (qp as any).limit; delete (qp as any).sort; delete (qp as any).page;
      return authFetch<any>(`/api/orders/stats?${new URLSearchParams(qp)}`);
    },
  });

  const { data: carriersData } = useQuery({
    queryKey: ["carriers"],
    queryFn: () => authFetch<any>("/api/carriers"),
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
    try {
      await authFetch(`/api/orders/${orderId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      invalidateOrders();
    } catch (err: any) { alert(err.message || t("orders.network_error")); }
  };

  const handleAssignAgent = async (orderId: string, agentId: string) => {
    try {
      await authFetch(`/api/orders/${orderId}`, { method: "PATCH", body: JSON.stringify({ assignedAgentId: agentId || null }) });
      invalidateOrders();
    } catch (err: any) { alert(err.message || t("orders.network_error")); }
  };

  const handleVoiceCall = async (orderId: string) => {
    setCallingOrderId(orderId);
    try {
      const data = await authFetch<{ success: boolean; message?: string }>(`/api/voice/call-order/${orderId}`, { method: "POST" });
      if (data.success) { alert(t("orders.voice_call_success")); invalidateOrders(); }
      else alert(data.message ? "❌ " + data.message : t("orders.voice_call_failed"));
    } catch (err: any) { alert(err.message || t("orders.network_error")); }
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
                <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.orders")}</h1>
                <DocButton docId="orders" />
              </div>
              <p className="text-muted-foreground mt-1">{t("orders.subtitle")}</p>
            </div>
            <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2 transition-colors">
              <Plus className="w-4 h-4" /> {t("order.create")}
            </button>
          </div>

          {/* ── KPI summary bar — loading / failed / loaded are visibly different states, */}
          {/* never a silent "—" for a request that actually failed. ── */}
          {statsIsError ? (
            <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
              <span className="text-sm font-medium text-red-800">{t("orders.stats_load_failed")}</span>
              <button onClick={() => refetchStats()} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors">
                <RotateCw className="w-3.5 h-3.5" /> {t("common.retry")}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard icon={<ShoppingBag className="w-4 h-4 text-blue-600" />} iconBg="bg-blue-100" label={t("orders.kpi.total")} value={statsIsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : statsData.total} sub={!statsIsLoading ? t("orders.kpi.total_today").replace("{n}", String(statsData.today)) : undefined} />
              <KpiCard icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} iconBg="bg-green-100" label={t("orders.kpi.confirmed")} value={statsIsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : statsData.confirmed} sub={!statsIsLoading ? `${statsData.confirmedRate}%` : undefined} />
              <KpiCard icon={<XCircle className="w-4 h-4 text-red-600" />} iconBg="bg-red-100" label={t("orders.kpi.cancelled")} value={statsIsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : statsData.cancelled} sub={!statsIsLoading ? `${statsData.cancelledRate}%` : undefined} />
              <KpiCard icon={<AlertTriangle className="w-4 h-4 text-orange-600" />} iconBg="bg-orange-100" label={t("orders.kpi.delivery_failed")} value={statsIsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : statsData.deliveryFailed} sub={!statsIsLoading ? `${statsData.deliveryFailedRate}%` : undefined} />
              <KpiCard icon={<TrendingUp className="w-4 h-4 text-teal-600" />} iconBg="bg-teal-100" label={t("orders.kpi.delivery_rate")} value={statsIsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `${statsData.deliveryRate}%`} />
              <KpiCard icon={<Truck className="w-4 h-4 text-purple-600" />} iconBg="bg-purple-100" label={t("orders.kpi.delivered_period")} value={statsIsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : statsData.delivered} />
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl shadow-sm flex flex-col">
            {/* ── Date quick tabs ── */}
            <div className="p-4 border-b border-border flex flex-wrap items-center gap-2">
              {([["all", t("orders.tab.all")], ["today", t("orders.tab.today")], ["yesterday", t("orders.tab.yesterday")], ["week", t("orders.tab.week")]] as const).map(([key, label]) => (
                <button key={key} onClick={() => applyDateTab(key as any)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${dateTab === key ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/70"}`}>{label}</button>
              ))}
              <div className="flex items-center gap-1.5">
                <button onClick={() => setDateTab("custom")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${dateTab === "custom" ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/70"}`}>{t("orders.tab.more")}</button>
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
                <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} type="text" placeholder={t("orders.search_placeholder")} className="w-full pl-9 pr-4 py-2 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
              </div>

              <select value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">{t("orders.filter.all_sources")}</option>
                {SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">{t("orders.filter.all_statuses")}</option>
                <option value="duplicate">{t("orders.filter.duplicate")}</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>

              <select value={filters.delivery} onChange={e => setFilters(f => ({ ...f, delivery: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">{t("orders.filter.all_delivery")}</option>
                {DELIVERY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>

              <select value={filters.carrier} onChange={e => setFilters(f => ({ ...f, carrier: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">{t("orders.filter.all_companies")}</option>
                <option value="none">{t("orders.filter.no_carrier")}</option>
                {carrierConnections.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>

              <select value={filters.agent} onChange={e => setFilters(f => ({ ...f, agent: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">{t("orders.filter.all_agents")}</option>
                <option value="unassigned">{t("orders.filter.unassigned")}</option>
                {teamMembers.map((m: any) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>

              <select value={filters.product} onChange={e => setFilters(f => ({ ...f, product: e.target.value }))} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">{t("orders.filter.all_products")}</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("orders.table.order")}</th>
                    <th className="px-4 py-3 font-medium">{t("orders.table.agent")}</th>
                    <th className="px-4 py-3 font-medium">{t("orders.table.tracking")}</th>
                    <th className="px-4 py-3 font-medium">{t("orders.table.customer")}</th>
                    <th className="px-4 py-3 font-medium">{t("orders.table.city")}</th>
                    <th className="px-4 py-3 font-medium">{t("orders.table.status")}</th>
                    <th className="px-4 py-3 font-medium">{t("orders.table.execution")}</th>
                    <th className="px-4 py-3 font-medium text-right">{t("orders.table.total")}</th>
                    <th className="px-4 py-3 font-medium cursor-pointer select-none" onClick={() => setSort(s => s === "desc" ? "asc" : "desc")}>
                      {t("orders.table.date")} {sort === "desc" ? "↓" : "↑"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={9} className="px-6 py-8 text-center text-muted-foreground">{t("common.loading")}</td></tr>
                  ) : ordersIsError ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center"><AlertTriangle className="w-7 h-7 text-red-500" /></div>
                          <p className="font-medium text-red-700">{t("orders.load_failed")}</p>
                          <button onClick={() => refetchOrders()} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors">
                            <RotateCw className="w-3.5 h-3.5" /> {t("common.retry")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center"><Package className="w-7 h-7" /></div>
                          <p className="font-medium">{t("orders.no_orders")}</p>
                          <button onClick={() => setShowCreate(true)} className="text-primary text-sm font-semibold hover:underline">{t("orders.create_first")}</button>
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
                                  {t("orders.duplicate_of").replace("{list}", dup.join(", "))}
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
                            <option value="">{t("orders.filter.unassigned")}</option>
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
                          ) : order.status === "scheduled" && order.scheduledShipDate ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold w-fit bg-sky-100 text-sky-700" title={new Date(order.scheduledShipDate).toLocaleString("fr-DZ")}>
                              📅 {format(new Date(order.scheduledShipDate), "MMM dd")}
                            </span>
                          ) : order.status === "confirmed" || order.status === "self_confirmed" ? (
                            <button onClick={() => setDispatchOrderId(order.id)} className="inline-flex items-center gap-1 px-2 py-1 text-primary bg-primary/10 hover:bg-primary/20 rounded-lg text-[11px] font-bold transition-colors">
                              <Send className="w-3 h-3" /> {t("orders.create_parcel")}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("orders.no_parcel")}</span>
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
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-foreground">{order.wilaya || "—"}</div>
                          {order.commune && order.commune !== order.wilaya && (
                            <div className="text-[11px] text-muted-foreground">{order.commune}</div>
                          )}
                        </td>

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
                                title={t("orders.voice_call_title")}
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

            <Pagination
              page={ordersData?.page || page}
              total={ordersData?.total || 0}
              limit={ordersData?.limit || limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
              itemLabel={t("orders.item_label")}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
