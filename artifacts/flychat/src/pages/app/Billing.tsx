import { AppLayout } from "@/components/AppLayout";
import { CreditCard, Check, Zap, ArrowUpRight, FileText } from "lucide-react";
import { useGetSubscription, useGetPlans } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";

export default function Billing() {
  const { data: sub } = useGetSubscription();
  const { data: plansData } = useGetPlans();
  const { t } = useI18n();

  const planColors: Record<string, string> = { basic: "from-slate-500 to-slate-600", pro: "from-primary to-blue-600", ai_addon: "from-violet-500 to-purple-600" };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.billing")}</h1>
            <p className="text-muted-foreground mt-1">Manage your subscription and usage.</p>
          </div>

          {/* Current plan */}
          {sub && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Plan</p>
                    <h3 className="text-xl font-display font-bold text-foreground capitalize">{sub.plan === "ai_addon" ? "AI Add-on" : sub.plan}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${sub.status === "active" ? "bg-green-100 text-green-800" : sub.status === "trialing" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"}`}>
                        {sub.status}
                      </span>
                      {sub.currentPeriodEnd && (
                        <span className="text-xs text-muted-foreground">Renews {format(new Date(sub.currentPeriodEnd), 'MMM dd, yyyy')}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">Manage Subscription</button>
              </div>
            </div>
          )}

          {/* Plan cards */}
          <div>
            <h2 className="text-xl font-display font-bold text-foreground mb-5">Available Plans</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {plansData?.plans.map((plan) => {
                const isCurrent = sub?.plan === plan.id;
                const gradient = planColors[plan.id] || "from-gray-500 to-gray-600";
                return (
                  <div key={plan.id} className={`bg-card border rounded-2xl shadow-sm overflow-hidden flex flex-col ${isCurrent ? "border-primary ring-2 ring-primary/20" : "border-border"}`}>
                    <div className={`h-2 bg-gradient-to-r ${gradient}`} />
                    <div className="p-6 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-display font-bold text-foreground text-lg">{plan.name}</h3>
                        {isCurrent && <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-full">Current</span>}
                      </div>
                      <div className="mt-2 mb-5">
                        {plan.price === 0 ? (
                          <p className="text-3xl font-display font-black text-foreground">Free</p>
                        ) : (
                          <p className="text-3xl font-display font-black text-foreground">
                            DZD {plan.price.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                          </p>
                        )}
                      </div>
                      <ul className="space-y-2.5">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2.5 text-sm">
                            <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-4 border-t border-border">
                      <button disabled={isCurrent} className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${isCurrent ? "bg-secondary text-muted-foreground cursor-default" : "bg-primary text-white hover:bg-primary/90"}`}>
                        {isCurrent ? "Current Plan" : (<><ArrowUpRight className="w-4 h-4" /> Upgrade</>)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invoice placeholder */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-display font-bold text-foreground">Invoice History</h2>
            </div>
            <div className="text-center py-8 border border-dashed border-border rounded-xl">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="font-semibold text-muted-foreground">No invoices yet</p>
              <p className="text-sm text-muted-foreground mt-1">Your billing history will appear here once you upgrade to a paid plan.</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
