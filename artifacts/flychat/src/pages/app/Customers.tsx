import { AppLayout } from "@/components/AppLayout";
import { Link } from "wouter";
import { Search, UserPlus, Eye, Repeat, Trash2, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useGetCustomers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { Pagination } from "@/components/Pagination";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("flychat_token") || ""}` });

// Real values, matching conversations.lead_stage / lib/lead-intent.ts exactly.
const LEAD_STAGES = [
  { key: "real", label: "Real Leads" },
  { key: "engaged", label: "Engaged" },
  { key: "qualified_lead", label: "Qualified" },
  { key: "order_confirmed", label: "Confirmed" },
  { key: "all", label: "All" },
] as const;

const LEAD_BADGE: Record<string, { label: string; color: string }> = {
  interested: { label: "Interested", color: "bg-gray-100 text-gray-500" },
  engaged: { label: "Engaged", color: "bg-blue-100 text-blue-700" },
  qualified_lead: { label: "Qualified", color: "bg-green-100 text-green-700" },
  order_confirmed: { label: "Confirmed", color: "bg-purple-100 text-purple-700" },
};

const CHANNEL_DOT: Record<string, string> = {
  messenger: "bg-blue-500",
  instagram: "bg-pink-500",
  whatsapp: "bg-green-500",
  widget: "bg-gray-400",
};

export default function Customers() {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("real");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [cleaning, setCleaning] = useState(false);
  const { data, isLoading, refetch } = useGetCustomers({ search: search || undefined, page, limit, stage } as any);
  const { t } = useI18n();
  const queryClient = useQueryClient();

  useEffect(() => { setPage(1); }, [search, stage]);

  const handleCleanupGhosts = async () => {
    setCleaning(true);
    try {
      const previewRes = await fetch(`${API_BASE}/api/customers/ghosts/preview`, { headers: authHeaders() });
      const preview = await previewRes.json();
      const count = preview.count || 0;
      if (count === 0) { alert("No ghost customers found — nothing to clean up."); return; }
      if (!confirm(`This will permanently delete ${count} customer(s): generic-name records with no orders and no real engagement signal (wilaya, phone, or size mentioned in chat). This cannot be undone. Continue?`)) return;

      const res = await fetch(`${API_BASE}/api/customers/cleanup-ghosts`, { method: "POST", headers: authHeaders() });
      const result = await res.json();
      alert(`Cleaned up ${result.deleted} ghost customer(s). ${result.after} customers remain.`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (err: any) {
      alert(err.message || "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.customers")}</h1>
              <p className="text-muted-foreground mt-1">Manage your customer relationships and order history.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCleanupGhosts}
                disabled={cleaning}
                title="Remove generic-name records with no orders and no real engagement signal"
                className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> {cleaning ? "Cleaning..." : "Clean Ghosts"}
              </button>
              <button className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Add Customer
              </button>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {LEAD_STAGES.map(s => (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                  stage === s.key ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/70"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm">
            <div className="p-4 border-b border-border">
              <div className="relative max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t("common.search")}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4 font-medium">Customer</th>
                    <th className="px-6 py-4 font-medium">Meta ID</th>
                    <th className="px-6 py-4 font-medium">Phone</th>
                    <th className="px-6 py-4 font-medium">Wilaya</th>
                    <th className="px-6 py-4 font-medium">Orders</th>
                    <th className="px-6 py-4 font-medium">Lead</th>
                    <th className="px-6 py-4 font-medium">Since</th>
                    <th className="px-6 py-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">{t("common.loading")}</td></tr>
                  ) : data?.customers.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">No customers yet. They will appear here when they start chatting.</td></tr>
                  ) : data?.customers.map((c: any) => (
                    <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm ${CHANNEL_DOT[c.channel] || "bg-primary/40"}`}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{c.name}</div>
                            {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {c.metaId ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-muted-foreground truncate max-w-[100px]" title={c.metaId}>{c.metaId}</span>
                            <button onClick={() => navigator.clipboard.writeText(c.metaId)} className="text-muted-foreground hover:text-foreground" title="Copy Meta ID">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{c.phone || "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{c.wilaya || "—"}</td>
                      <td className="px-6 py-4 font-semibold text-foreground">{c.totalOrders}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${LEAD_BADGE[c.leadStage]?.color || "bg-gray-100 text-gray-500"}`}>
                          {LEAD_BADGE[c.leadStage]?.label || c.leadStage || "Interested"}
                        </span>
                        {c.isRepeat && (
                          <span className="ml-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800">
                            <Repeat className="w-3 h-3" />
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{format(new Date(c.createdAt), 'MMM dd, yyyy')}</td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/customers/${c.id}`} className="inline-flex p-2 text-muted-foreground hover:text-primary bg-secondary hover:bg-primary/10 rounded-lg transition-colors">
                          <Eye className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={data?.page || page}
              total={data?.total || 0}
              limit={data?.limit || limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
              itemLabel="customers"
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
