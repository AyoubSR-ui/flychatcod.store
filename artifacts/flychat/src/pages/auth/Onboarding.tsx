import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Check, MessageSquare, Zap, Building2, Globe, MapPin, Plug, ChevronRight, X } from "lucide-react";
import { useCompleteOnboarding, OnboardingRequestLanguage, OnboardingRequestWidgetLanguage } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const ALGERIA_WILAYAS = [
  "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar","Blida","Bouira",
  "Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger","Djelfa","Jijel","Sétif","Saïda",
  "Skikda","Sidi Bel Abbès","Annaba","Guelma","Constantine","Médéa","Mostaganem","M'Sila","Mascara",
  "Ouargla","Oran","El Bayadh","Illizi","Bordj Bou Arréridj","Boumerdès","El Tarf","Tindouf",
  "Tissemsilt","El Oued","Khenchela","Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma",
  "Aïn Témouchent","Ghardaïa","Relizane",
];

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Test FlyChat with your store",
    color: "from-gray-400 to-gray-500",
    highlight: false,
    features: ["1 channel of your choice", "50 AI messages/month", "Up to 50 orders/month", "1 team member"],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$19",
    period: "/mo",
    description: "For growing sellers",
    color: "from-blue-500 to-cyan-500",
    highlight: false,
    trial: "14-day free trial",
    features: ["3 channels", "2,000 AI messages/month", "Unlimited orders", "3 team members"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "Full power for COD sellers",
    color: "from-primary to-blue-600",
    highlight: true,
    trial: "14-day free trial",
    badge: "Most Popular",
    features: ["All 4 channels", "10,000 AI messages/month", "Unlimited orders", "10 team members"],
  },
  {
    id: "agency",
    name: "Agency",
    price: "$99",
    period: "/mo",
    description: "For agencies & multi-store",
    color: "from-violet-500 to-purple-600",
    highlight: false,
    trial: "14-day free trial",
    features: ["5 stores", "30,000 AI messages/month", "Unlimited team members", "White-label"],
  },
];

const CHANNELS = [
  {
    id: "widget",
    name: "Website Widget",
    description: "Embed a chat widget on your website",
    color: "bg-blue-500",
    always: true,
    icon: (
      <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
        <path d="M28 12H12C10.9 12 10 12.9 10 14V30L14 26H28C29.1 26 30 25.1 30 24V14C30 12.9 29.1 12 28 12Z" fill="white"/>
        <circle cx="16" cy="19" r="1.5" fill="#2563EB"/>
        <circle cx="20" cy="19" r="1.5" fill="#2563EB"/>
        <circle cx="24" cy="19" r="1.5" fill="#2563EB"/>
      </svg>
    ),
    bg: "bg-blue-500",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Connect WhatsApp Business",
    color: "bg-green-500",
    always: false,
    icon: (
      <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
        <path d="M20 8C13.373 8 8 13.373 8 20C8 22.286 8.674 24.42 9.84 26.222L8.292 31.708L13.908 30.19C15.636 31.232 17.748 31.838 20 31.838C26.627 31.838 32 26.627 32 20C32 13.373 26.627 8 20 8Z" fill="white"/>
        <path d="M15.6 13.4C15.34 12.8 15.06 12.78 14.82 12.76H14.22C13.96 12.76 13.54 12.86 13.18 13.26C12.82 13.66 11.8 14.62 11.8 16.58C11.8 18.54 13.22 20.44 13.42 20.7C13.62 20.96 16.22 25.18 20.34 26.78C23.74 28.1 24.46 27.82 25.18 27.74C25.9 27.66 27.5 26.82 27.82 25.94C28.14 25.06 28.14 24.3 28.06 24.16C27.98 24.02 27.72 23.94 27.34 23.74C26.96 23.54 25.02 22.6 24.68 22.48C24.34 22.36 24.08 22.3 23.82 22.68C23.56 23.06 22.82 23.94 22.58 24.18C22.34 24.44 22.12 24.46 21.74 24.28C21.36 24.08 20.06 23.66 18.54 22.3C17.36 21.26 16.56 19.96 16.32 19.58C16.08 19.2 16.3 18.98 16.48 18.8C16.64 18.64 16.86 18.36 17.04 18.12C17.22 17.88 17.28 17.7 17.4 17.44C17.52 17.18 17.46 16.94 17.36 16.74C17.26 16.54 16.5 14.56 15.6 13.4Z" fill="#25D366"/>
      </svg>
    ),
    bg: "bg-green-500",
  },
  {
    id: "instagram",
    name: "Instagram DMs",
    description: "Manage Instagram messages",
    color: "bg-pink-500",
    always: false,
    icon: (
      <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
        <rect x="10" y="10" width="20" height="20" rx="6" stroke="white" strokeWidth="2" fill="none"/>
        <circle cx="20" cy="20" r="5" stroke="white" strokeWidth="2" fill="none"/>
        <circle cx="26.5" cy="13.5" r="1.5" fill="white"/>
      </svg>
    ),
    bg: "bg-gradient-to-br from-pink-500 to-purple-600",
  },
  {
    id: "messenger",
    name: "Facebook Messenger",
    description: "Handle Messenger conversations",
    color: "bg-blue-600",
    always: false,
    icon: (
      <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
        <path d="M20 8C13.373 8 8 12.925 8 19C8 22.344 9.736 25.318 12.4 27.2V32L16.88 29.524C17.88 29.8 18.92 29.944 20 29.944C26.627 29.944 32 25.019 32 18.944C32 12.925 26.627 8 20 8Z" fill="white"/>
        <path d="M14 23L17.6 18.4L20.2 20.6L26 14.8" stroke="#006AFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
    bg: "bg-blue-600",
  },
];

const STEPS = [
  { id: 1, label: "Plan", icon: Zap },
  { id: 2, label: "Store", icon: Building2 },
  { id: 3, label: "Language", icon: Globe },
  { id: 4, label: "Shipping", icon: MapPin },
  { id: 5, label: "Channels", icon: Plug },
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [completed, setCompleted] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("free");
  const [selectedChannel, setSelectedChannel] = useState("widget"); // for free plan

  const [formData, setFormData] = useState({
    businessName: "",
    storeName: "",
    businessPhone: "",
    language: "en" as OnboardingRequestLanguage,
    widgetLanguage: "fr" as OnboardingRequestWidgetLanguage,
    shippingWilayas: [] as string[],
  });

  const onboardingMutation = useCompleteOnboarding({
    mutation: {
      onSuccess: () => setCompleted(true),
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Setup failed",
          description: err.message || "Failed to complete setup",
        });
      }
    }
  });

  const isFree = selectedPlan === "free";

  const canProceed = () => {
    if (step === 1) return true;
    if (step === 2) return !!formData.businessName && !!formData.storeName;
    return true;
  };

  const handleNext = () => {
    if (step < 5) setStep(s => s + 1);
    else onboardingMutation.mutate({ data: formData });
  };

  const toggleWilaya = (w: string) => {
    setFormData(prev => ({
      ...prev,
      shippingWilayas: prev.shippingWilayas.includes(w)
        ? prev.shippingWilayas.filter(x => x !== w)
        : [...prev.shippingWilayas, w],
    }));
  };

  // ─── Completion screen ────────────────────────────────────────────────────
  if (completed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-violet-50 flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-in zoom-in duration-500">
            <Check className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-3">Your store is ready! 🎉</h1>
          <p className="text-muted-foreground mb-8">
            FlyChat COD is set up and ready to receive your first customer message.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => setLocation("/inbox")}
              className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-lg hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-5 h-5" /> Go to Inbox
            </button>
            <button
              onClick={() => setLocation("/channels")}
              className="w-full py-3 rounded-2xl border border-border text-foreground font-medium hover:bg-secondary transition-colors"
            >
              Connect more channels
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-2xl">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-md">
            <MessageSquare className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-xl text-foreground">FlyChat COD</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  isDone ? "bg-green-100 text-green-700"
                  : isActive ? "bg-primary text-white shadow-md"
                  : "bg-secondary text-muted-foreground"
                }`}>
                  {isDone ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-0.5 rounded-full ${step > s.id ? "bg-green-400" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-card border border-border rounded-3xl shadow-xl overflow-hidden">

          {/* ── Step 1: Plan selection ── */}
          {step === 1 && (
            <div className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="mb-6">
                <h2 className="text-2xl font-display font-bold text-foreground">Choose your plan</h2>
                <p className="text-muted-foreground mt-1">All paid plans include a 14-day free trial. No credit card required.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {PLANS.map(plan => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`relative text-left p-4 rounded-2xl border-2 transition-all ${
                      selectedPlan === plan.id
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border hover:border-primary/30 hover:bg-secondary/50"
                    }`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-2.5 left-3 bg-accent text-accent-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {plan.badge}
                      </span>
                    )}
                    <div className={`inline-block h-1 w-8 rounded-full bg-gradient-to-r ${plan.color} mb-3`} />
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-xl font-extrabold text-foreground">{plan.price}</span>
                      <span className="text-xs text-muted-foreground">{plan.period}</span>
                    </div>
                    <p className="font-bold text-foreground text-sm">{plan.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                    {plan.trial && (
                      <p className="text-[10px] text-primary font-bold mt-1">{plan.trial}</p>
                    )}
                    <ul className="mt-3 space-y-1">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Check className="w-3 h-3 text-green-500 shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                    {selectedPlan === plan.id && (
                      <div className="absolute top-3 right-3 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {isFree && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
                  <span className="font-bold">Free plan:</span> You can connect 1 channel of your choice. You can upgrade anytime to connect more.
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Business info ── */}
          {step === 2 && (
            <div className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="mb-6">
                <h2 className="text-2xl font-display font-bold text-foreground">Your store info</h2>
                <p className="text-muted-foreground mt-1">This will be used across FlyChat for your store identity.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Business Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={e => setFormData({...formData, businessName: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="Acme SARL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Store Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.storeName}
                    onChange={e => setFormData({...formData, storeName: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="Acme Store"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Shown to customers in the chat widget.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Support Phone Number</label>
                  <input
                    type="tel"
                    value={formData.businessPhone}
                    onChange={e => setFormData({...formData, businessPhone: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="+213 555 000 000"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Language ── */}
          {step === 3 && (
            <div className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="mb-6">
                <h2 className="text-2xl font-display font-bold text-foreground">Language preferences</h2>
                <p className="text-muted-foreground mt-1">Set your dashboard and customer-facing language.</p>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">Dashboard Language</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["en", "fr"] as const).map(l => (
                      <button
                        key={l}
                        onClick={() => setFormData({...formData, language: l})}
                        className={`p-4 rounded-xl border-2 text-center font-bold transition-all ${
                          formData.language === l
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <div className="text-2xl mb-1">{l === "en" ? "🇬🇧" : "🇫🇷"}</div>
                        {l === "en" ? "English" : "Français"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">Chat Widget Language</label>
                  <p className="text-xs text-muted-foreground mb-3">Default language shown to your customers.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(["en", "fr"] as const).map(l => (
                      <button
                        key={`w-${l}`}
                        onClick={() => setFormData({...formData, widgetLanguage: l})}
                        className={`p-4 rounded-xl border-2 text-center font-bold transition-all ${
                          formData.widgetLanguage === l
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <div className="text-2xl mb-1">{l === "en" ? "🇬🇧" : "🇫🇷"}</div>
                        {l === "en" ? "English" : "Français"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Shipping Wilayas ── */}
          {step === 4 && (
            <div className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="mb-6">
                <h2 className="text-2xl font-display font-bold text-foreground">Shipping zones</h2>
                <p className="text-muted-foreground mt-1">Select the wilayas where you deliver COD orders.</p>
              </div>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setFormData({...formData, shippingWilayas: ALGERIA_WILAYAS})}
                  className="text-xs font-bold text-primary px-3 py-1.5 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors">
                  Select All
                </button>
                <button onClick={() => setFormData({...formData, shippingWilayas: []})}
                  className="text-xs font-bold text-muted-foreground px-3 py-1.5 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors">
                  Clear All
                </button>
                <span className="ml-auto text-xs text-muted-foreground self-center">
                  {formData.shippingWilayas.length} selected
                </span>
              </div>
              <div className="h-64 overflow-y-auto border border-border rounded-xl p-3 grid grid-cols-2 gap-1.5 bg-background">
                {ALGERIA_WILAYAS.map(w => (
                  <button key={w} onClick={() => toggleWilaya(w)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition-colors ${
                      formData.shippingWilayas.includes(w)
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-secondary text-foreground"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                      formData.shippingWilayas.includes(w) ? "bg-primary border-primary" : "border-muted-foreground/40"
                    }`}>
                      {formData.shippingWilayas.includes(w) && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {w}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">You can change this anytime in Settings → Shipping Zones.</p>
            </div>
          )}

          {/* ── Step 5: Channel selection ── */}
          {step === 5 && (
            <div className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="mb-6">
                <h2 className="text-2xl font-display font-bold text-foreground">Connect your first channel</h2>
                <p className="text-muted-foreground mt-1">
                  {isFree
                    ? "On the Free plan, you can connect 1 channel. Choose the one that matters most to your business."
                    : "All channels are included in your plan. Connect them now or later from the Channels page."}
                </p>
              </div>

              <div className="space-y-3">
                {CHANNELS.map(ch => {
                  const isSelected = isFree ? selectedChannel === ch.id : true;
                  const isDisabled = isFree && ch.id !== selectedChannel && !ch.always;

                  return (
                    <button
                      key={ch.id}
                      onClick={() => isFree && setSelectedChannel(ch.id)}
                      disabled={!isFree}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                        isFree
                          ? selectedChannel === ch.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/30 hover:bg-secondary/30"
                          : "border-green-200 bg-green-50 cursor-default"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl ${ch.bg} flex items-center justify-center shrink-0`}>
                        {ch.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground">{ch.name}</p>
                        <p className="text-xs text-muted-foreground">{ch.description}</p>
                      </div>
                      {isFree ? (
                        selectedChannel === ch.id ? (
                          <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 border-2 border-border rounded-full shrink-0" />
                        )
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-green-700 font-bold shrink-0">
                          <Check className="w-3.5 h-3.5" /> Included
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 p-3 bg-secondary/50 border border-border rounded-xl text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Note:</span> Channel connections require additional setup after onboarding. You'll be guided through it in the Channels page.
                {isFree && " Upgrade anytime to unlock all channels."}
              </div>
            </div>
          )}

          {/* Footer navigation */}
          <div className="px-8 pb-8 flex gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-6 py-3 rounded-xl border border-border font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canProceed() || onboardingMutation.isPending}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {onboardingMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : step === 5 ? (
                <><Check className="w-4 h-4" /> Complete Setup</>
              ) : (
                <>Continue <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>

        {/* Skip link */}
        {step === 5 && (
          <div className="text-center mt-4">
            <button onClick={() => onboardingMutation.mutate({ data: formData })}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Skip and go to dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}