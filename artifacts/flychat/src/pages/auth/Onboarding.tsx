import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Check } from "lucide-react";
import { useCompleteOnboarding, OnboardingRequestLanguage, OnboardingRequestWidgetLanguage } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const ALGERIA_WILAYAS = [
  "Adrar", "Chlef", "Laghouat", "Oum El Bouaghi", "Batna", "Béjaïa", "Biskra", "Béchar", "Blida", "Bouira", "Tamanrasset", "Tébessa", "Tlemcen", "Tiaret", "Tizi Ouzou", "Alger", "Djelfa", "Jijel", "Sétif", "Saïda", "Skikda", "Sidi Bel Abbès", "Annaba", "Guelma", "Constantine", "Médéa", "Mostaganem", "M'Sila", "Mascara", "Ouargla", "Oran", "El Bayadh", "Illizi", "Bordj Bou Arréridj", "Boumerdès", "El Tarf", "Tindouf", "Tissemsilt", "El Oued", "Khenchela", "Souk Ahras", "Tipaza", "Mila", "Aïn Defla", "Naâma", "Aïn Témouchent", "Ghardaïa", "Relizane"
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
      onSuccess: () => {
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Setup failed",
          description: err.message || "Failed to complete setup",
        });
      }
    }
  });

  const handleNext = () => {
    if (step < 3) setStep(s => s + 1);
    else submitForm();
  };

  const submitForm = () => {
    onboardingMutation.mutate({ data: formData });
  };

  const toggleWilaya = (w: string) => {
    setFormData(prev => ({
      ...prev,
      shippingWilayas: prev.shippingWilayas.includes(w)
        ? prev.shippingWilayas.filter(x => x !== w)
        : [...prev.shippingWilayas, w]
    }));
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-display font-bold text-foreground">Set up your store</h1>
          <p className="text-muted-foreground mt-2">Let's get FlyChat ready for your business</p>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>

        <div className="bg-card border border-border rounded-3xl p-8 shadow-xl">
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold mb-6">Basic Information</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Business Name (Legal)</label>
                <input 
                  type="text" 
                  value={formData.businessName}
                  onChange={e => setFormData({...formData, businessName: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none" 
                  placeholder="Acme Sarl" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Store Name (Public)</label>
                <input 
                  type="text" 
                  value={formData.storeName}
                  onChange={e => setFormData({...formData, storeName: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none" 
                  placeholder="Acme Store" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Support Phone Number</label>
                <input 
                  type="tel" 
                  value={formData.businessPhone}
                  onChange={e => setFormData({...formData, businessPhone: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none" 
                  placeholder="+213 555 000 000" 
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold mb-6">Language Preferences</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Your Dashboard Language</label>
                <div className="grid grid-cols-2 gap-4">
                  {(["en", "fr"] as const).map(l => (
                    <button 
                      key={l}
                      onClick={() => setFormData({...formData, language: l})}
                      className={`p-4 rounded-xl border-2 text-center font-bold uppercase transition-all ${formData.language === l ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                    >
                      {l === "en" ? "English" : "Français"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Default Chat Widget Language</label>
                <div className="grid grid-cols-2 gap-4">
                  {(["en", "fr"] as const).map(l => (
                    <button 
                      key={`w-${l}`}
                      onClick={() => setFormData({...formData, widgetLanguage: l})}
                      className={`p-4 rounded-xl border-2 text-center font-bold uppercase transition-all ${formData.widgetLanguage === l ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                    >
                      {l === "en" ? "English" : "Français"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold mb-2">Shipping Wilayas</h2>
              <p className="text-sm text-muted-foreground mb-6">Select the wilayas where you support Cash on Delivery. This will populate the fast-entry dropdown in your chat.</p>
              
              <div className="flex gap-2 mb-4">
                <button onClick={() => setFormData({...formData, shippingWilayas: ALGERIA_WILAYAS})} className="text-xs font-bold text-primary px-3 py-1.5 bg-primary/10 rounded-lg">Select All</button>
                <button onClick={() => setFormData({...formData, shippingWilayas: []})} className="text-xs font-bold text-muted-foreground px-3 py-1.5 bg-secondary rounded-lg">Clear All</button>
              </div>

              <div className="h-64 overflow-y-auto border border-border rounded-xl p-4 grid grid-cols-2 gap-2 bg-background">
                {ALGERIA_WILAYAS.map(w => (
                  <button 
                    key={w}
                    onClick={() => toggleWilaya(w)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition-colors ${formData.shippingWilayas.includes(w) ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary text-foreground"}`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center border ${formData.shippingWilayas.includes(w) ? "bg-primary border-primary" : "border-muted-foreground/50"}`}>
                      {formData.shippingWilayas.includes(w) && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-10 flex gap-4 pt-6 border-t border-border">
            {step > 1 && (
              <button 
                onClick={() => setStep(s => s - 1)}
                className="px-6 py-3 rounded-xl border border-border font-medium hover:bg-secondary transition-colors"
              >
                Back
              </button>
            )}
            <button 
              onClick={handleNext}
              disabled={
                (step === 1 && (!formData.businessName || !formData.storeName)) ||
                onboardingMutation.isPending
              }
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center"
            >
              {onboardingMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : step === 3 ? "Complete Setup" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
