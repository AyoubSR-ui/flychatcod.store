import { AppLayout } from "@/components/AppLayout";
import { Link } from "wouter";
import { Search, UserPlus, Eye, Repeat } from "lucide-react";
import { useState } from "react";
import { useGetCustomers } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";

export default function Customers() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useGetCustomers({ search: search || undefined, limit: 50 });
  const { t } = useI18n();

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.customers")}</h1>
              <p className="text-muted-foreground mt-1">Manage your customer relationships and order history.</p>
            </div>
            <button className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Add Customer
            </button>
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
                    <th className="px-6 py-4 font-medium">Phone</th>
                    <th className="px-6 py-4 font-medium">Wilaya</th>
                    <th className="px-6 py-4 font-medium">Orders</th>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium">Since</th>
                    <th className="px-6 py-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">{t("common.loading")}</td></tr>
                  ) : data?.customers.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">No customers yet. They will appear here when they start chatting.</td></tr>
                  ) : data?.customers.map((c) => (
                    <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{c.name}</div>
                            {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{c.phone || "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{c.wilaya || "—"}</td>
                      <td className="px-6 py-4 font-semibold text-foreground">{c.totalOrders}</td>
                      <td className="px-6 py-4">
                        {c.isRepeat ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                            <Repeat className="w-3 h-3" /> Repeat
                          </span>
                        ) : (
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">New</span>
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

            <div className="p-4 border-t border-border flex justify-between items-center text-sm text-muted-foreground">
              <span>Showing {data?.customers.length || 0} of {data?.total || 0} customers</span>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
