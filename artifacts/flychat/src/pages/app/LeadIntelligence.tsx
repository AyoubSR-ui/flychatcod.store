import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Link } from "wouter";
import {
  TrendingUp, Users, ShoppingBag, Zap, ChevronRight,
  MessageSquare, MapPin, Phone, Package,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string): Promise<T> {
  const token = localStorage.getItem("flychat_token") ?? "";
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

interface LeadStats {
  total_conversations: string;
  interested: string;
  engaged: string;
  qualified: string;
  confirmed: string;
  high_intent: string;
  qualification_rate: string | null;
  conversion_rate: string | null;
}

interface TopRef {
  ad_ref: string;
  total: string;
  qualified: string;
}

interface DropOff {
  lead_stage: string;
  count: string;
  avg_messages: string;
}

interface RecentQualified {
  id: string;
  customer_name: string;
  channel: string;
  lead_wilaya: string | null;
  lead_phone: string | null;
  lead_size: string | null;
  intent_level: string;
  qualified_at: string | null;
  updated_at: string;
}

interface LeadStatsResponse {
  stats: LeadStats | null;
  topRefs: TopRef[];
  dropOff: DropOff[];
  recentQualified: RecentQualified[];
}

const STAGE_ORDER = ["interested", "engaged", "qualified_lead", "order_confirmed"] as const;

const STAGE_CONFIG: Record<string, { label: string; color: string; bar: string; icon: React.ComponentType<any> }> = {
  interested:      { label: "Interested",  color: "text-gray-600",   bar: "bg-gray-400",    icon: Users },
  engaged:         { label: "Engaged",     color: "text-blue-600",   bar: "bg-blue-500",    icon: MessageSquare },
  qualified_lead:  { label: "Qualified",   color: "text-green-600",  bar: "bg-green-500",   icon: TrendingUp },
  order_confirmed: { label: "Confirmed",   color: "text-emerald-600",bar: "bg-emerald-500", icon: ShoppingBag },
};

const INTENT_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: "Low",    color: "text-gray-500"  },
  medium: { label: "Medium", color: "text-blue-600"  },
  high:   { label: "High",   color: "text-orange-600"},
};

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp:  "bg-green-100 text-green-700",
  instagram: "bg-pink-100 text-pink-700",
  messenger: "bg-blue-100 text-blue-700",
  widget:    "bg-violet-100 text-violet-700",
};

function StatCard({
  title, value, sub, icon: Icon, iconColor,
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ComponentType<any>; iconColor: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColor}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function LeadIntelligence() {
  const [data, setData] = useState<LeadStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<LeadStatsResponse>("/api/analytics/lead-stats")
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load lead stats"); setLoading(false); });
  }, []);

  const stats = data?.stats;
  const total = Number(stats?.total_conversations ?? 0);
  const qualified = Number(stats?.qualified ?? 0);
  const confirmed = Number(stats?.confirmed ?? 0);

  // Build funnel percentages
  const funnelData = STAGE_ORDER.map((stage) => {
    const dropRow = data?.dropOff.find((d) => d.lead_stage === stage);
    const count = Number(dropRow?.count ?? 0);
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return { stage, count, pct, avgMessages: dropRow?.avg_messages ?? "—" };
  });

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Lead Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Not all messages are equal. This shows you who is a real buyer.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive rounded-xl p-4 text-sm">{error}</div>
        )}

        {!loading && !error && stats && (
          <>
            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Conversations"
                value={total}
                sub="last 30 days"
                icon={MessageSquare}
                iconColor="bg-violet-100 text-violet-600"
              />
              <StatCard
                title="Qualified Leads"
                value={qualified}
                sub={stats.qualification_rate ? `${stats.qualification_rate}% of total` : undefined}
                icon={TrendingUp}
                iconColor="bg-green-100 text-green-600"
              />
              <StatCard
                title="Confirmed Orders"
                value={confirmed}
                sub={stats.conversion_rate ? `${stats.conversion_rate}% conversion` : undefined}
                icon={ShoppingBag}
                iconColor="bg-emerald-100 text-emerald-600"
              />
              <StatCard
                title="High Intent"
                value={Number(stats.high_intent)}
                sub="serious buyers"
                icon={Zap}
                iconColor="bg-orange-100 text-orange-600"
              />
            </div>

            {/* ── Lead Funnel ── */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h2 className="text-base font-semibold text-foreground mb-4">Lead Funnel</h2>
              <div className="space-y-3">
                {funnelData.map(({ stage, count, pct, avgMessages }) => {
                  const cfg = STAGE_CONFIG[stage];
                  const Icon = cfg.icon;
                  return (
                    <div key={stage} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className={`flex items-center gap-1.5 font-medium ${cfg.color}`}>
                          <Icon className="w-4 h-4" />
                          {cfg.label}
                        </span>
                        <span className="text-muted-foreground">
                          {count} <span className="text-xs">({pct}%)</span>
                          <span className="ml-3 text-xs">avg {avgMessages} msgs</span>
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
                          style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Drop-off Analysis ── */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h2 className="text-base font-semibold text-foreground mb-1">Drop-off Analysis</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Where do customers stop? Low avg messages at "Interested" = AI needs to qualify faster.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Stage</th>
                      <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Count</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Avg messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.dropOff.map((row) => {
                      const cfg = STAGE_CONFIG[row.lead_stage];
                      return (
                        <tr key={row.lead_stage} className="border-b border-border/50 last:border-0">
                          <td className={`py-2.5 pr-4 font-medium ${cfg?.color ?? "text-foreground"}`}>
                            {cfg?.label ?? row.lead_stage}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-foreground">{row.count}</td>
                          <td className="py-2.5 text-right text-muted-foreground">{row.avg_messages}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Top Performing Ads ── */}
            {data && data.topRefs.length > 0 && (
              <div className="bg-card rounded-2xl border border-border p-6">
                <h2 className="text-base font-semibold text-foreground mb-4">Top Performing Ads</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Ad Ref</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Total convs</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Qualified</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Conversion %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topRefs.map((ref) => {
                        const convRate = Number(ref.total) > 0
                          ? Math.round((Number(ref.qualified) / Number(ref.total)) * 100)
                          : 0;
                        return (
                          <tr key={ref.ad_ref} className="border-b border-border/50 last:border-0">
                            <td className="py-2.5 pr-4 font-medium text-foreground">{ref.ad_ref}</td>
                            <td className="py-2.5 pr-4 text-right text-muted-foreground">{ref.total}</td>
                            <td className="py-2.5 pr-4 text-right text-green-600 font-medium">{ref.qualified}</td>
                            <td className="py-2.5 text-right">
                              <span className={`font-bold ${convRate >= 20 ? "text-green-600" : convRate >= 10 ? "text-blue-600" : "text-muted-foreground"}`}>
                                {convRate}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Recent Qualified Leads ── */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h2 className="text-base font-semibold text-foreground mb-4">Recent Qualified Leads</h2>
              {data?.recentQualified.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No qualified leads yet. The AI will qualify leads automatically as conversations progress.
                </p>
              ) : (
                <div className="space-y-2">
                  {data?.recentQualified.map((conv) => {
                    const intentCfg = INTENT_CONFIG[conv.intent_level] ?? INTENT_CONFIG.low;
                    const channelCls = CHANNEL_COLORS[conv.channel] ?? CHANNEL_COLORS.widget;
                    return (
                      <Link
                        key={conv.id}
                        href={`/inbox?conv=${conv.id}`}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary/50 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                          {conv.customer_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold text-sm text-foreground truncate">{conv.customer_name}</span>
                            <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold ${channelCls}`}>
                              {conv.channel}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {conv.lead_wilaya && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {conv.lead_wilaya}
                              </span>
                            )}
                            {conv.lead_phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {conv.lead_phone}
                              </span>
                            )}
                            {conv.lead_size && (
                              <span className="flex items-center gap-1">
                                <Package className="w-3 h-3" /> {conv.lead_size}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`text-xs font-semibold ${intentCfg.color}`}>
                            {intentCfg.label} intent
                          </span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto mt-1" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
