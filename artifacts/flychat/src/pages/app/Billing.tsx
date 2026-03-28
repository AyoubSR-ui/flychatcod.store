import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { CreditCard, Check, Zap, ArrowUpRight, FileText, Bot, AlertTriangle, Sparkles, X } from "lucide-react";
import { useGetSubscription, useGetPlans, useGetBillingAiStatus } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";

const PLAN_COLORS: Record<string, string> = {
  free: "from-gray-400 to-gray-500",
  starter: "from-blue-500 to-cyan-500",
  pro: "from-primary to-blue-600",
  agency: "from-violet-500 to-purple-600",
};

const PLAN_ORDER = ["free", "starter", "pro", "agency"];
const DISCOUNT = 0.19;
function getPrice(price: number, annual: boolean) {
  if (price === 0) return 0;
  return annual ? Math.round(price * (1 - DISCOUNT)) : price;
}

export default function Billing() {
  const { data: sub } = useGetSubscription();
  const [annual, setAnnual] = useState(false);
  const { data: plansData } = useGetPlans();
  const { t } = useI18n();
  const { data: aiStatusData } = useGetBillingAiStatus();
  const aiStatus = aiStatusData ?? null;
  
  const plans = plansData?.plans ?? [];
  const topUps = (plansData as any)?.topUps ?? [];

  const currentPlanIndex = PLAN_ORDER.indexOf(sub?.plan ?? "free");

  const aiStatusColor = aiStatus?.statusLabel === "active" ? "text-green-700 bg-green-100"
    : aiStatus?.statusLabel === "low_credits" ? "text-amber-700 bg-amber-100"
    : aiStatus?.statusLabel === "paused" ? "text-red-700 bg-red-100"
    : "text-gray-600 bg-gray-100";

  const aiStatusIcon = aiStatus?.statusLabel === "active" ? <Sparkles className="w-4 h-4" />
    : aiStatus?.statusLabel === "low_credits" ? <AlertTriangle className="w-4 h-4" />
    : aiStatus?.statusLabel === "paused" ? <AlertTriangle className="w-4 h-4" />
    : <Bot className="w-4 h-4" />;

  const usagePercent = aiStatus && aiStatus.creditsIncluded + aiStatus.creditsExtra > 0
    ? Math.min(100, (aiStatus.creditsUsed / (aiStatus.creditsIncluded + aiStatus.creditsExtra)) * 100)
    : 0;

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
                    <p className="text-sm text-muted-foreground">{t("billing.current_plan")}</p>
                    <h3 className="text-xl font-display font-bold text-foreground capitalize">
                      {plans.find(p => p.id === sub.plan)?.name ?? sub.plan}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        sub.status === "active" ? "bg-green-100 text-green-800"
                        : sub.status === "trialing" ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-600"
                      }`}>
                        {sub.status === "trialing" ? "Trial" : sub.status}
                      </span>
                      {sub.currentPeriodEnd && (
                        <span className="text-xs text-muted-foreground">
                          {sub.status === "trialing" ? "Trial ends" : "Renews"} {format(new Date(sub.currentPeriodEnd), 'MMM dd, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button disabled className="px-4 py-2 border border-border rounded-xl text-sm font-medium opacity-50 cursor-not-allowed flex items-center gap-2">
                  {t("billing.manage_subscription")}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-secondary rounded-full text-muted-foreground">Soon</span>
                </button>
              </div>
            </div>
          )}

          {/* AI Credits & Usage */}
          {aiStatus && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <Bot className="w-5 h-5 text-violet-600" />
                <h2 className="text-xl font-display font-bold text-foreground">{t("billing.ai_section")}</h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{t("billing.ai_status")}</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${aiStatusColor}`}>
                    {aiStatusIcon}
                    {aiStatus.statusLabel === "active" ? "Active"
                     : aiStatus.statusLabel === "low_credits" ? "Low credits"
                     : aiStatus.statusLabel === "paused" ? "Paused"
                     : aiStatus.statusLabel === "disabled" ? "Disabled"
                     : "Not included"}
                  </span>
                </div>
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{t("billing.ai_used")}</p>
                  <p className="text-lg font-bold text-foreground">{aiStatus.creditsUsed.toLocaleString()}</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{t("billing.ai_included")}</p>
                  <p className="text-lg font-bold text-foreground">{(aiStatus.creditsIncluded + aiStatus.creditsExtra).toLocaleString()}</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{t("billing.ai_remaining")}</p>
                  <p className="text-lg font-bold text-foreground">{aiStatus.creditsRemaining.toLocaleString()}</p>
                </div>
              </div>

              {(aiStatus.creditsIncluded + aiStatus.creditsExtra) > 0 && (
                <div className="mb-6">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Usage this period</span>
                    <span>{usagePercent.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${usagePercent > 90 ? "bg-red-500" : usagePercent > 70 ? "bg-amber-500" : "bg-violet-500"}`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  {aiStatus.resetAt && (
                    <p className="text-xs text-muted-foreground mt-1">Resets on {format(new Date(aiStatus.resetAt), 'MMM dd, yyyy')}</p>
                  )}
                </div>
              )}

              {/* Top-up options */}
              <div>
                <p className="text-sm font-bold text-foreground mb-3">
                  <Zap className="w-4 h-4 inline mr-1 text-violet-600" />
                  Top Up Credits
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {topUps.map((opt: any) => (
                    <div key={opt.id} className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-4 text-center">
                      <p className="text-2xl font-display font-black text-violet-700">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mb-1">credits</p>
                      <p className="text-sm font-bold text-violet-600 mb-3">${opt.price} USD</p>
                      <button disabled className="w-full py-2 bg-violet-200 text-violet-700 rounded-xl text-xs font-bold cursor-not-allowed opacity-70">
                        Coming Soon
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">Contact support for custom credit packages.</p>
              </div>
            </div>
          )}

          {/* Available Plans */}
              <div>
            <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-display font-bold text-foreground">{t("billing.available_plans")}</h2>
         <div className="flex items-center gap-3">
         <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
         <button onClick={() => setAnnual(a => !a)}
        className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-primary" : "bg-border"}`}>
           <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${annual ? "translate-x-6" : "translate-x-0"}`} />
         </button>
         <div className="flex items-center gap-1.5">
        <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>Annually</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">-19%</span>
         </div>
       </div>
         </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((plan: any) => {
                const isCurrent = sub?.plan === plan.id;
                const planIndex = PLAN_ORDER.indexOf(plan.id);
                const isUpgrade = planIndex > currentPlanIndex;
                const isDowngrade = planIndex < currentPlanIndex;
                const gradient = PLAN_COLORS[plan.id] || "from-gray-500 to-gray-600";

                return (
                  <div key={plan.id} className={`bg-card border rounded-2xl shadow-sm overflow-hidden flex flex-col ${
                    isCurrent ? "border-primary ring-2 ring-primary/20" : "border-border"
                  }`}>
                    <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />
                    <div className="p-5 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-bold text-foreground">{plan.name}</h3>
                        {isCurrent && (
                          <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">Current</span>
                        )}
                        {plan.badge && !isCurrent && (
                          <span className="px-2 py-0.5 bg-accent text-accent-foreground text-[10px] font-bold rounded-full">{plan.badge}</span>
                        )}
                      </div>

                      <div className="mb-4">
                        {plan.price === 0 ? (
                          <p className="text-2xl font-extrabold text-foreground">Free</p>
                            ) : (
                             <div>
                              <div className="flex items-baseline gap-0.5">
                                 {annual && <span className="text-sm line-through text-muted-foreground/50 mr-1">${plan.price}</span>}
                                  <span className="text-2xl font-extrabold text-foreground">${getPrice(plan.price, annual)}</span>
                                   <span className="text-xs text-muted-foreground">/mo</span>
                                 </div>
                                      {annual && plan.price > 0 && (
                                  <p className="text-[10px] text-green-600 font-medium">
                               ${Math.round(getPrice(plan.price, annual) * 12)}/year
                                    </p>
                                      )}
                                        </div>
                                       )}
                                         {plan.trial && (
                                          <p className="text-[10px] text-muted-foreground">{plan.trial}-day free trial</p>
                                              )}
                                           </div>

                                       <ul className="space-y-2">
                                 {plan.features.slice(0, 5).map((f: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs">
                            <Check className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 pt-0">
                      <button
                        disabled={isCurrent}
                        className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all ${
                          isCurrent
                            ? "bg-secondary text-muted-foreground cursor-default"
                            : isDowngrade
                              ? "border border-border text-muted-foreground hover:bg-secondary"
                              : "bg-primary text-white hover:bg-primary/90"
                        }`}
                      >
                        {isCurrent ? "Current Plan"
                          : isUpgrade ? <><ArrowUpRight className="w-4 h-4" /> Upgrade</>
                          : "Downgrade"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invoice history */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-display font-bold text-foreground">{t("billing.invoice_history")}</h2>
            </div>
            <div className="text-center py-8 border border-dashed border-border rounded-xl">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="font-semibold text-muted-foreground">{t("billing.no_invoices")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("billing.no_invoices_desc")}</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}