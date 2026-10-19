import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useSearchParams } from "wouter";
import { Loader2, ShoppingBag, DollarSign, TrendingUp, Search, RotateCw, AlertTriangle, Inbox as InboxIcon, Plus, MessageCircle, Link2, Check } from "lucide-react";
import { DocButton } from "@/components/DocButton";
import { Pagination } from "@/components/Pagination";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { useGetWilayas } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { CreateOrderModal, CreateOrderInitialData } from "./Orders";
import { ProductPickerItem } from "@/components/ProductPicker";

interface Filters { search: string; wilaya: string; dateFrom: string; dateTo: string }
const EMPTY_FILTERS: Filters = { search: "", wilaya: "all", dateFrom: "", dateTo: "" };
const PARAM_DEFAULTS: Record<string, string> = { ...EMPTY_FILTERS, sort: "desc", page: "1", limit: "50" };

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

// Algerian numbers are stored as entered (e.g. "0550123456") — wa.me needs
// the international form with no leading zero. Left as-is if it already
// looks international (starts with a digit other than 0, or a +).
function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return "213" + digits.slice(1);
  return digits;
}

export default function AbandonedCheckouts() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: wilayasData } = useGetWilayas();
  const wilayas = wilayasData?.wilayas || [];
  const [createFrom, setCreateFrom] = useState<{ initial: CreateOrderInitialData } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filters: Filters = useMemo(() => ({
    search: searchParams.get("search") ?? EMPTY_FILTERS.search,
    wilaya: searchParams.get("wilaya") ?? EMPTY_FILTERS.wilaya,
    dateFrom: searchParams.get("dateFrom") ?? EMPTY_FILTERS.dateFrom,
    dateTo: searchParams.get("dateTo") ?? EMPTY_FILTERS.dateTo,
  }), [searchParams]);
  const sort: "asc" | "desc" = searchParams.get("sort") === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50);

  const updateParams = (patch: Record<string, string>, opts: { resetPage?: boolean } = {}) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === PARAM_DEFAULTS[key]) next.delete(key);
        else next.set(key, value);
      }
      if (opts.resetPage) next.delete("page");
      return next;
    }, { replace: true });
  };
  const clearFilters = () => setSearchParams(new URLSearchParams(), { replace: true });
  const activeFilterCount = (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).filter(k => filters[k] !== EMPTY_FILTERS[k]).length;

  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => { setSearchInput(filters.search); }, [filters.search]);
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== filters.search) updateParams({ search: searchInput }, { resetPage: true });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const p: Record<string, string> = { limit: String(limit), page: String(page), sort };
    if (filters.search) p.search = filters.search;
    if (filters.wilaya !== "all") p.wilaya = filters.wilaya;
    if (filters.dateFrom) p.dateFrom = filters.dateFrom;
    if (filters.dateTo) p.dateTo = filters.dateTo;
    return p;
  }, [filters, sort, page, limit]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["abandoned-checkouts-list", queryParams],
    queryFn: () => authFetch<any>(`/api/orders/abandoned?${new URLSearchParams(queryParams)}`),
  });

  const { data: statsData, isLoading: statsIsLoading, isError: statsIsError, refetch: refetchStats } = useQuery({
    queryKey: ["abandoned-checkouts-stats"],
    queryFn: () => authFetch<any>("/api/orders/abandoned/stats"),
  });

  const checkouts = data?.checkouts || [];

  return (
    <AppLayout>
      {createFrom && (
        <CreateOrderModal initialData={createFrom.initial} onClose={() => setCreateFrom(null)} />
      )}
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-full mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.orders_abandoned")}</h1>
                <DocButton docId="orders" />
              </div>
              <p className="text-muted-foreground mt-1">{t("abandoned.subtitle")}</p>
            </div>
          </div>

          {statsIsError ? (
            <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
              <span className="text-sm font-medium text-red-800">{t("orders.stats_load_failed")}</span>
              <button onClick={() => refetchStats()} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors">
                <RotateCw className="w-3.5 h-3.5" /> {t("common.retry")}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard icon={<ShoppingBag className="w-4 h-4 text-blue-600" />} iconBg="bg-blue-100" label={t("abandoned.kpi.count")} value={statsIsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : statsData.count} />
              <KpiCard icon={<DollarSign className="w-4 h-4 text-orange-600" />} iconBg="bg-orange-100" label={t("abandoned.kpi.value")} value={statsIsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `DZD ${Number(statsData.totalValue).toLocaleString()}`} />
              <KpiCard icon={<TrendingUp className="w-4 h-4 text-teal-600" />} iconBg="bg-teal-100" label={t("abandoned.kpi.recovery_rate")} value={statsIsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `${statsData.recoveryRate}%`} sub={!statsIsLoading ? t("abandoned.kpi.recovery_rate_sub").replace("{n}", String(statsData.convertedCount)) : undefined} />
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl shadow-sm flex flex-col">
            <div className="p-4 border-b border-border flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)} type="text" placeholder={t("abandoned.search_placeholder")} className="w-full pl-9 pr-4 py-2 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
              </div>
              <select value={filters.wilaya} onChange={e => updateParams({ wilaya: e.target.value }, { resetPage: true })} className="px-3 py-2 border border-border rounded-xl text-sm bg-white">
                <option value="all">{t("orders.filter.all_wilayas")}</option>
                {wilayas.map(w => <option key={w.code} value={w.name}>{w.name}</option>)}
              </select>
              <input type="date" value={filters.dateFrom ? filters.dateFrom.slice(0, 10) : ""} onChange={e => updateParams({ dateFrom: e.target.value ? new Date(e.target.value).toISOString() : "" }, { resetPage: true })} className="px-2 py-2 border border-border rounded-xl text-xs" />
              <span className="text-xs text-muted-foreground">→</span>
              <input type="date" value={filters.dateTo ? filters.dateTo.slice(0, 10) : ""} onChange={e => updateParams({ dateTo: e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : "" }, { resetPage: true })} className="px-2 py-2 border border-border rounded-xl text-xs" />
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="px-3 py-2 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 border border-red-200 transition-colors ml-auto">
                  {t("orders.filter.clear").replace("{n}", String(activeFilterCount))}
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("orders.table.customer")}</th>
                    <th className="px-4 py-3 font-medium">{t("orders.table.city")}</th>
                    <th className="px-4 py-3 font-medium">{t("abandoned.table.items")}</th>
                    <th className="px-4 py-3 font-medium text-right">{t("orders.table.total")}</th>
                    <th className="px-4 py-3 font-medium">{t("abandoned.table.abandoned_at")}</th>
                    <th className="px-4 py-3 font-medium">{t("abandoned.table.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t("common.loading")}</td></tr>
                  ) : isError ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center"><AlertTriangle className="w-7 h-7 text-red-500" /></div>
                          <p className="font-medium text-red-700">{t("orders.load_failed")}</p>
                          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors">
                            <RotateCw className="w-3.5 h-3.5" /> {t("common.retry")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : checkouts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center"><InboxIcon className="w-7 h-7" /></div>
                          <p className="font-medium">{t("abandoned.no_checkouts")}</p>
                        </div>
                      </td>
                    </tr>
                  ) : checkouts.map((c: any) => {
                    const items: any[] = c.items || [];
                    return (
                      <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{c.customerName || t("abandoned.unknown_customer")}</div>
                          <div className="text-[11px] text-muted-foreground">{c.customerPhone || c.customerEmail || "—"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-foreground">{c.wilaya || "—"}</div>
                          {c.commune && c.commune !== c.wilaya && <div className="text-[11px] text-muted-foreground">{c.commune}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px] truncate" title={items.map(i => `${i.quantity}× ${i.title}`).join(", ")}>
                          {items.length === 0 ? "—" : items.map(i => `${i.quantity}× ${i.title}`).join(", ")}
                        </td>
                        <td className="px-4 py-3 font-bold text-foreground text-right">DZD {Number(c.total).toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {format(new Date(c.abandonedAt), "MMM dd, yyyy")}
                          <div className="text-[10px]">{format(new Date(c.abandonedAt), "HH:mm")}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              title={t("abandoned.action.create_order")}
                              onClick={() => setCreateFrom({
                                initial: {
                                  customerName: c.customerName || undefined,
                                  customerPhone: c.customerPhone || undefined,
                                  customerEmail: c.customerEmail || undefined,
                                  wilaya: c.wilaya || undefined,
                                  commune: c.commune || undefined,
                                  items: items.map((i): ProductPickerItem => ({
                                    productId: i.product_id ? String(i.product_id) : undefined,
                                    productName: i.title,
                                    variant: i.variant_title || undefined,
                                    quantity: i.quantity,
                                    price: Number(i.price),
                                  })),
                                },
                              })}
                              className="inline-flex items-center p-1.5 text-primary hover:text-white hover:bg-primary bg-primary/10 border border-primary/20 rounded-lg transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            {c.customerPhone && (
                              <a
                                href={`https://wa.me/${toWhatsAppNumber(c.customerPhone)}`}
                                target="_blank" rel="noreferrer"
                                title={t("abandoned.action.whatsapp")}
                                className="inline-flex items-center p-1.5 text-green-600 hover:text-white hover:bg-green-600 bg-green-50 border border-green-200 rounded-lg transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {c.recoveryUrl && (
                              <button
                                title={t("abandoned.action.copy_link")}
                                onClick={() => { navigator.clipboard.writeText(c.recoveryUrl); setCopiedId(c.id); setTimeout(() => setCopiedId(id => id === c.id ? null : id), 1500); }}
                                className="inline-flex items-center p-1.5 text-muted-foreground hover:text-foreground bg-secondary border border-border rounded-lg transition-colors"
                              >
                                {copiedId === c.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Link2 className="w-3.5 h-3.5" />}
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
              page={data?.page || page}
              total={data?.total || 0}
              limit={data?.limit || limit}
              onPageChange={(n) => updateParams({ page: String(n) })}
              onLimitChange={(n) => updateParams({ limit: String(n) })}
              itemLabel={t("abandoned.item_label")}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
