import { AppLayout } from "@/components/AppLayout";
import { Store, Users, MessageSquare, ShoppingBag, ShieldAlert } from "lucide-react";
import { useGetAdminStats } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Admin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: stats, isLoading } = useGetAdminStats();

  useEffect(() => {
    if (user && user.role !== "superadmin") setLocation("/dashboard");
  }, [user]);

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Super Admin</h1>
              <p className="text-muted-foreground mt-0.5">Platform-wide management — restricted access</p>
            </div>
            <span className="ml-auto px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full border border-red-200">ADMIN ONLY</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10"><div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                {[
                  { label: "Total Stores", value: stats?.totalStores || 0, icon: Store, color: "text-blue-500", bg: "bg-blue-100" },
                  { label: "Total Users", value: stats?.totalUsers || 0, icon: Users, color: "text-violet-500", bg: "bg-violet-100" },
                  { label: "Total Conversations", value: stats?.totalConversations || 0, icon: MessageSquare, color: "text-teal-500", bg: "bg-teal-100" },
                  { label: "Total Orders", value: stats?.totalOrders || 0, icon: ShoppingBag, color: "text-orange-500", bg: "bg-orange-100" },
                ].map(s => (
                  <div key={s.label} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                    <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-4`}>
                      <s.icon className={`w-5 h-5 ${s.color}`} />
                    </div>
                    <p className="text-2xl font-display font-bold text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Plan Distribution */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <h2 className="font-bold text-foreground mb-4">Plan Distribution</h2>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(stats?.planDistribution || {}).map(([plan, count]) => (
                    <div key={plan} className="flex items-center gap-3 bg-secondary/50 border border-border rounded-xl px-4 py-3">
                      <span className="font-semibold text-foreground capitalize">{plan === "ai_addon" ? "AI Add-on" : plan}</span>
                      <span className="text-2xl font-display font-bold text-primary">{count as number}</span>
                    </div>
                  ))}
                  {!Object.keys(stats?.planDistribution || {}).length && <p className="text-muted-foreground text-sm">No subscriptions yet</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Recent signups */}
                <div className="bg-card border border-border rounded-2xl shadow-sm">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="font-bold text-foreground">Recent Signups</h2>
                  </div>
                  <div className="divide-y divide-border/50">
                    {!stats?.recentSignups?.length ? (
                      <p className="px-6 py-8 text-center text-muted-foreground text-sm">No recent signups</p>
                    ) : stats.recentSignups.map(u => (
                      <div key={u.id} className="px-6 py-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{format(new Date(u.createdAt), 'MMM dd')}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent activity */}
                <div className="bg-card border border-border rounded-2xl shadow-sm">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="font-bold text-foreground">Recent Activity</h2>
                  </div>
                  <div className="divide-y divide-border/50">
                    {!stats?.recentActivity?.length ? (
                      <p className="px-6 py-8 text-center text-muted-foreground text-sm">No recent activity</p>
                    ) : stats.recentActivity.map((a, i) => (
                      <div key={i} className="px-6 py-4">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{a.event}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{format(new Date(a.timestamp), 'MMM dd, HH:mm')}</span>
                        </div>
                        <p className="text-sm text-foreground">{a.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
