import { useState } from "react";
import { PublicLayout } from "@/components/PublicLayout";
import { Link } from "wouter";
import { Check, Zap, X } from "lucide-react";

const DISCOUNT = 0.19;

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "Perfect for testing FlyChat with your store.",
    badge: null,
    highlight: false,
    trial: null,
    features: [
      { text: "1 channel (Widget only)", included: true },
      { text: "50 AI messages/month", included: true },
      { text: "Up to 50 orders/month", included: true },
      { text: "1 team member", included: true },
      { text: "Basic inbox", included: true },
      { text: "WhatsApp / Instagram / Messenger", included: false },
      { text: "Automation rules", included: false },
    ],
    cta: "Start Free",
    ctaLink: "/signup",
  },
  {
    id: "starter",
    name: "Starter",
    price: 19,
    description: "For growing sellers ready to scale.",
    badge: null,
    highlight: false,
    trial: 14,
    features: [
      { text: "3 channels (Widget + WhatsApp + 1 other)", included: true },
      { text: "2,000 AI messages/month", included: true },
      { text: "Unlimited orders", included: true },
      { text: "3 team members", included: true },
      { text: "Full inbox — all channels", included: true },
      { text: "Basic automation (3 rules)", included: true },
      { text: "No FlyChat branding", included: true },
    ],
    cta: "Start 14-Day Trial",
    ctaLink: "/signup",
  },
  {
    id: "pro",
    name: "Pro",
    price: 49,
    description: "Full power for serious COD sellers.",
    badge: "Most Popular",
    highlight: true,
    trial: 14,
    features: [
      { text: "All 4 channels", included: true },
      { text: "10,000 AI messages/month", included: true },
      { text: "Unlimited orders", included: true },
      { text: "10 team members", included: true },
      { text: "Unlimited automation rules", included: true },
      { text: "AI autopilot per channel", included: true },
      { text: "Priority support", included: true },
    ],
    cta: "Start 14-Day Trial",
    ctaLink: "/signup",
  },
  {
    id: "agency",
    name: "Agency",
    price: 99,
    description: "For agencies managing multiple stores.",
    badge: null,
    highlight: false,
    trial: 14,
    features: [
      { text: "Everything in Pro", included: true },
      { text: "Up to 5 stores", included: true },
      { text: "30,000 AI messages/month", included: true },
      { text: "Unlimited team members", included: true },
      { text: "White-label (custom branding)", included: true },
      { text: "Dedicated support", included: true },
      { text: "Custom integrations", included: true },
    ],
    cta: "Start 14-Day Trial",
    ctaLink: "/signup",
  },
];

const TOP_UPS = [
  { label: "5K", credits: "5,000", price: "$9" },
  { label: "15K", credits: "15,000", price: "$24" },
  { label: "50K", credits: "50,000", price: "$69" },
];

function getPrice(price: number, annual: boolean) {
  if (price === 0) return 0;
  return annual ? Math.round(price * (1 - DISCOUNT)) : price;
}

function getAnnualTotal(price: number) {
  return Math.round(price * (1 - DISCOUNT) * 12);
}

export default function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <PublicLayout>
      <div className="bg-background py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-10">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6">
              Simple, transparent pricing
            </h1>
            <p className="text-xl text-muted-foreground">
              Start free. Upgrade when you need more power. All paid plans include a 14-day free trial.
            </p>
          </div>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-4 mb-14">
            <span className={`text-sm font-semibold ${!annual ? "text-foreground" : "text-muted-foreground"}`}>
              Monthly
            </span>
            <button
              onClick={() => setAnnual(a => !a)}
              className={`relative w-14 h-7 rounded-full transition-colors ${annual ? "bg-primary" : "bg-border"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${annual ? "translate-x-7" : "translate-x-0"}`} />
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${annual ? "text-foreground" : "text-muted-foreground"}`}>
                Annually
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                Save 19%
              </span>
            </div>
          </div>

          {/* Plans grid */}
          <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto mb-20">
            {PLANS.map((plan) => {
              const displayPrice = getPrice(plan.price, annual);
              return (
                <div key={plan.id} className={`rounded-3xl border flex flex-col relative ${
                  plan.highlight
                    ? "bg-primary border-primary shadow-2xl shadow-primary/20 md:-translate-y-4"
                    : "bg-card border-border shadow-sm"
                }`}>
                  {plan.badge && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide whitespace-nowrap shadow-md">
                        {plan.badge}
                      </span>
                    </div>
                  )}
                  <div className="p-7 flex-1">
                    <h3 className={`text-lg font-bold mb-1 ${plan.highlight ? "text-primary-foreground" : "text-foreground"}`}>
                      {plan.name}
                    </h3>
                    <p className={`text-xs mb-5 ${plan.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {plan.description}
                    </p>
                    <div className="mb-2">
                      {plan.price === 0 ? (
                        <span className={`text-4xl font-extrabold ${plan.highlight ? "text-primary-foreground" : "text-foreground"}`}>Free</span>
                      ) : (
                        <div>
                          <div className="flex items-baseline gap-1">
                            {annual && (
                              <span className={`text-lg line-through mr-1 ${plan.highlight ? "text-primary-foreground/40" : "text-muted-foreground/50"}`}>
                                ${plan.price}
                              </span>
                            )}
                            <span className={`text-4xl font-extrabold ${plan.highlight ? "text-primary-foreground" : "text-foreground"}`}>
                              ${displayPrice}
                            </span>
                            <span className={`text-sm ${plan.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>/mo</span>
                          </div>
                          {annual && (
                            <p className={`text-xs mt-1 font-medium ${plan.highlight ? "text-green-300" : "text-green-600"}`}>
                              ${getAnnualTotal(plan.price)}/year — save ${plan.price * 12 - getAnnualTotal(plan.price)}
                            </p>
                          )}
                        </div>
                      )}
                      {plan.trial && (
                        <p className={`text-xs mt-1 ${plan.highlight ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {plan.trial}-day free trial
                        </p>
                      )}
                    </div>

                    <div className={`my-5 border-t ${plan.highlight ? "border-primary-foreground/20" : "border-border"}`} />

                    <ul className="space-y-3">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          {f.included ? (
                            <Check className={`w-4 h-4 mt-0.5 shrink-0 ${plan.highlight ? "text-accent" : "text-green-500"}`} />
                          ) : (
                            <X className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground/40" />
                          )}
                          <span className={`text-sm ${f.included
                            ? plan.highlight ? "text-primary-foreground" : "text-foreground"
                            : "text-muted-foreground/50 line-through"
                          }`}>
                            {f.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-6 pt-0">
                    <Link href={plan.ctaLink}
                      className={`w-full block text-center py-3 rounded-xl font-bold text-sm transition-colors ${
                        plan.highlight
                          ? "bg-white text-primary hover:bg-gray-50 shadow-lg"
                          : plan.price === 0
                            ? "border-2 border-primary text-primary hover:bg-primary/5"
                            : "bg-primary text-white hover:bg-primary/90"
                      }`}>
                      {plan.cta}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pay-as-you-go top-ups */}
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-violet-50 border border-violet-200 text-violet-700 px-4 py-1.5 rounded-full text-sm font-bold mb-4">
                <Zap className="w-4 h-4" /> Pay-as-you-go AI Top-ups
              </div>
              <h2 className="text-2xl font-bold text-foreground">Need more AI messages?</h2>
              <p className="text-muted-foreground mt-2">Top up your AI credits anytime on any plan.</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {TOP_UPS.map((t) => (
                <div key={t.label} className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-6 text-center">
                  <p className="text-3xl font-extrabold text-violet-700 mb-1">{t.label}</p>
                  <p className="text-xs text-muted-foreground mb-2">{t.credits} AI messages</p>
                  <p className="text-xl font-bold text-violet-600 mb-4">{t.price}</p>
                  <button disabled className="w-full py-2 bg-violet-200 text-violet-700 rounded-xl text-xs font-bold opacity-70 cursor-not-allowed">
                    Coming Soon
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Feature comparison table */}
          <div className="max-w-5xl mx-auto mt-20">
            <h2 className="text-2xl font-bold text-foreground text-center mb-8">Full feature comparison</h2>
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 font-bold text-foreground">Feature</th>
                    {PLANS.map(p => (
                      <th key={p.id} className={`p-4 font-bold text-center ${p.highlight ? "text-primary" : "text-foreground"}`}>
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "Price", values: annual
                      ? ["Free", `$${getPrice(19, true)}/mo`, `$${getPrice(49, true)}/mo`, `$${getPrice(99, true)}/mo`]
                      : ["Free", "$19/mo", "$49/mo", "$99/mo"] },
                    { feature: "Channels", values: ["Widget only", "3 channels", "All 4", "All 4"] },
                    { feature: "AI messages/mo", values: ["50", "2,000", "10,000", "30,000"] },
                    { feature: "Orders/mo", values: ["50", "Unlimited", "Unlimited", "Unlimited"] },
                    { feature: "Team members", values: ["1", "3", "10", "Unlimited"] },
                    { feature: "WhatsApp", values: [false, true, true, true] },
                    { feature: "Instagram DMs", values: [false, true, true, true] },
                    { feature: "Messenger", values: [false, false, true, true] },
                    { feature: "Automation rules", values: [false, "3 rules", "Unlimited", "Unlimited"] },
                    { feature: "AI autopilot", values: [false, true, true, true] },
                    { feature: "Multi-store", values: [false, false, false, "5 stores"] },
                    { feature: "White-label", values: [false, true, true, true] },
                    { feature: "Support", values: ["Community", "Email", "Priority", "Dedicated"] },
                  ].map((row, i) => (
                    <tr key={i} className={`border-b border-border/50 ${i % 2 === 0 ? "bg-secondary/20" : ""}`}>
                      <td className="p-4 font-medium text-foreground">{row.feature}</td>
                      {row.values.map((v, j) => (
                        <td key={j} className="p-4 text-center">
                          {v === true ? (
                            <Check className="w-4 h-4 text-green-500 mx-auto" />
                          ) : v === false ? (
                            <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground text-xs">{v}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mt-16">
            <p className="text-muted-foreground mb-4">Questions? We're here to help.</p>
            <Link href="/contact" className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors">
              Contact Sales
            </Link>
          </div>

        </div>
      </div>
    </PublicLayout>
  );
}