import { AppLayout } from "@/components/AppLayout";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { MessageSquare, ShoppingBag, CheckCircle2, TrendingUp, AlertCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useI18n } from "@/hooks/use-i18n";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();
  const { t } = useI18n();

  const chartData = [
    { name: t("dashboard.day.mon"), chats: 40, orders: 24 },
    { name: t("dashboard.day.tue"), chats: 30, orders: 13 },
    { name: t("dashboard.day.wed"), chats: 20, orders: 48 },
    { name: t("dashboard.day.thu"), chats: 27, orders: 39 },
    { name: t("dashboard.day.fri"), chats: 18, orders: 48 },
    { name: t("dashboard.day.sat"), chats: 23, orders: 38 },
    { name: t("dashboard.day.sun"), chats: 34, orders: 43 },
  ];

  if (isLoading) return <AppLayout><div className="p-8 flex justify-center"><div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-6xl mx-auto space-y-8">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">{t("dashboard.title")}</h1>
              <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
            </div>
            <div className="bg-white px-4 py-2 rounded-lg border border-border shadow-sm text-sm font-medium">
              {t("dashboard.today").replace("{date}", new Date().toLocaleDateString())}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title={t("dashboard.stat.active_chats")} value={stats?.chatsToday || 0} icon={MessageSquare} color="text-blue-500" bg="bg-blue-500/10" />
            <StatCard title={t("dashboard.stat.new_orders")} value={stats?.newOrders || 0} icon={ShoppingBag} color="text-purple-500" bg="bg-purple-500/10" />
            <StatCard title={t("dashboard.stat.confirmed_cod")} value={stats?.confirmedOrders || 0} icon={CheckCircle2} color="text-green-500" bg="bg-green-500/10" />
            <StatCard title={t("dashboard.stat.conversion_rate")} value={`${stats?.conversionRate || 0}%`} icon={TrendingUp} color="text-orange-500" bg="bg-orange-500/10" />
          </div>

          {/* Charts & Lists Area */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-6">{t("dashboard.chart_title")}</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorChats" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))'}} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
                    <Area type="monotone" dataKey="chats" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorChats)" />
                    <Area type="monotone" dataKey="orders" stroke="hsl(var(--accent))" strokeWidth={3} fillOpacity={1} fill="url(#colorOrders)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">{t("dashboard.needs_attention")}</h3>
                <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">{stats?.pendingConfirmations || 0}</span>
              </div>
              <div className="flex-1">
                {stats?.pendingConfirmations === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-70">
                    <CheckCircle2 className="w-12 h-12 mb-2 text-green-500" />
                    <p>{t("dashboard.all_caught_up")}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Placeholder items */}
                    {[1,2,3].map(i => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-secondary/30">
                        <AlertCircle className="w-5 h-5 text-orange-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{t("dashboard.unconfirmed_order").replace("{n}", String(1024 + i))}</p>
                          <p className="text-xs text-muted-foreground truncate">{t("dashboard.awaiting_verification")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-border">
              <h3 className="text-lg font-bold">{t("dashboard.recent_orders")}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4 font-medium">{t("orders.table.order")}</th>
                    <th className="px-6 py-4 font-medium">{t("orders.table.customer")}</th>
                    <th className="px-6 py-4 font-medium">{t("orders.table.status")}</th>
                    <th className="px-6 py-4 font-medium">{t("orders.table.total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {stats?.recentOrders?.length ? stats.recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{order.orderNumber}</td>
                      <td className="px-6 py-4">{order.customerName}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          order.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                          order.status === 'new' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {t(`status.${order.status}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium">DZD {order.total}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">{t("dashboard.no_recent_orders")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, icon: Icon, color, bg }: any) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg} ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h4 className="text-2xl font-bold text-foreground mt-0.5">{value}</h4>
        </div>
      </div>
    </div>
  );
}
