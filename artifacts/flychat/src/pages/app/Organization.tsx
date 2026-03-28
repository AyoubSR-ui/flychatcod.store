import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { Building2, Store, Plus, CreditCard, Users, Check, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useGetSubscription } from "@workspace/api-client-react";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

const PLAN_STORE_LIMITS: Record<string, number> = {
  free: 1, starter: 1, pro: 1, agency: 5,
};

const PLAN_COLORS: Record<string, string> = {
  free: "from-gray-400 to-gray-500",
  starter: "from-blue-500 to-cyan-500",
  pro: "from-primary to-blue-600",
  agency: "from-violet-500 to-purple-600",
};

interface OrgData {
  id: string;
  name: string;
  ownerId: string;
  stores: {
    id: string;
    name: string;
    description: string | null;
    phone: string | null;
    isActive: boolean;
    createdAt: string;
  }[];
}

export default function Organization() {
  const { user } = useAuth();
  const { data: sub } = useGetSubscription();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const plan = (sub?.plan as string) ?? "free";
  const storeLimit = PLAN_STORE_LIMITS[plan] ?? 1;
  const currentStores = org?.stores.length ?? 0;
  const canAddStore = plan === "agency" && currentStores < storeLimit;

  useEffect(() => {
    const token = localStorage.getItem("flychat_token") || "";
    fetch(`${API_BASE}/api/organization`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setOrg(data);
        setEditName(data.name || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    const token = localStorage.getItem("flychat_token") || "";
    await fetch(`${API_BASE}/api/organization`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: editName }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return (
    <AppLayout>
      <div className="p-10 flex justify-center">
        <div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full" />
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Organization</h1>
            <p className="text-muted-foreground mt-1">Manage your organization, stores and subscription.</p>
          </div>

          {/* Organization info */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
              <Building2 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Organization Details</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Organization Name</label>
                <div className="flex gap-3">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background"
                    placeholder="Your Business Name"
                  />
                  <button onClick={handleSaveName} disabled={saving}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${saved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
                    {saved ? "✓ Saved" : saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Organization ID</p>
                  <p className="text-sm font-mono text-foreground truncate">{org?.id || "—"}</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Owner</p>
                  <p className="text-sm text-foreground">{user?.name} ({user?.email})</p>
                </div>
              </div>
            </div>
          </div>

          {/* Subscription */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Subscription</h2>
              </div>
              <a href="/billing" className="flex items-center gap-1.5 text-sm text-primary font-bold hover:underline">
                Manage <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${PLAN_COLORS[plan]} flex items-center justify-center`}>
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-foreground capitalize text-lg">{plan} Plan</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    sub?.status === "active" ? "bg-green-100 text-green-800"
                    : sub?.status === "trialing" ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-600"
                  }`}>{sub?.status === "trialing" ? "Trial" : sub?.status || "Free"}</span>
                  <span className="text-xs text-muted-foreground">
                    Up to {storeLimit === 5 ? "5 stores" : "1 store"} · {plan === "agency" ? "30,000" : plan === "pro" ? "10,000" : plan === "starter" ? "2,000" : "50"} AI messages/mo
                  </span>
                </div>
              </div>
              {plan !== "agency" && (
                <a href="/billing" className="ml-auto px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">
                  Upgrade
                </a>
              )}
            </div>
          </div>

          {/* Stores */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Store className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Stores</h2>
                <span className="text-sm text-muted-foreground">
                  <span className={`font-bold ${currentStores >= storeLimit ? "text-red-600" : "text-foreground"}`}>{currentStores}</span>/{storeLimit === 5 ? "5" : "1"}
                </span>
              </div>
              {canAddStore && (
                <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">
                  <Plus className="w-4 h-4" /> Add Store
                </button>
              )}
              {!canAddStore && plan !== "agency" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Multiple stores available on</span>
                  <a href="/billing" className="text-primary font-bold hover:underline">Agency plan</a>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {org?.stores.map(store => (
                <div key={store.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  store.id === user?.storeId
                    ? "border-primary/30 bg-primary/5"
                    : "border-border hover:bg-secondary/30"
                }`}>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-foreground">{store.name}</p>
                      {store.id === user?.storeId && (
                        <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">Current</span>
                      )}
                      {!store.isActive && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {store.description || "No description"} · Created {new Date(store.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {store.isActive && <span className="w-2 h-2 rounded-full bg-green-500" />}
                    {store.id === user?.storeId ? (
                      <a href="/settings" className="text-xs text-primary font-bold hover:underline">Settings</a>
                    ) : (
                      <button className="text-xs text-muted-foreground hover:text-primary font-medium">Switch</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {plan !== "agency" && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-sm text-amber-800">
                  <span className="font-bold">Need multiple stores?</span> Upgrade to the Agency plan to manage up to 5 stores under one organization and subscription.
                </p>
                <a href="/billing" className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-amber-700 hover:text-amber-900">
                  View Agency Plan <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

        </div>
      </div>
    </AppLayout>
  );
}