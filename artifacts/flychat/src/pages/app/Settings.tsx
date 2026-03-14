import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { useGetStoreSettings, useUpdateStoreSettings } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";
import { Store, Globe, MapPin } from "lucide-react";

const TABS = ["profile", "language", "shipping"] as const;
const WILAYAS = ["Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar","Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger","Djelfa","Jijel","Sétif","Saïda","Skikda","Sidi Bel Abbès","Annaba","Guelma","Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla","Oran","El Bayadh","Illizi","Bordj Bou Arréridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued","Khenchela","Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent","Ghardaïa","Relizane"];

export default function Settings() {
  const [tab, setTab] = useState<typeof TABS[number]>("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data: store, isLoading, refetch } = useGetStoreSettings();
  const updateStore = useUpdateStoreSettings();
  const { t, language, setLanguage } = useI18n();

  const [form, setForm] = useState({ name: "", description: "", phone: "", logoUrl: "", websiteUrl: "", defaultLanguage: "fr", widgetLanguage: "fr", shippingWilayas: [] as string[] });

  useEffect(() => {
    if (store) setForm({ name: store.name || "", description: store.description || "", phone: store.phone || "", logoUrl: store.logoUrl || "", websiteUrl: store.websiteUrl || "", defaultLanguage: store.defaultLanguage || "fr", widgetLanguage: store.widgetLanguage || "fr", shippingWilayas: store.shippingWilayas || [] });
  }, [store]);

  const handleSave = async () => {
    setSaving(true);
    await updateStore.mutateAsync({ data: form as any });
    if (form.defaultLanguage !== language) setLanguage(form.defaultLanguage as "en" | "fr");
    setSaving(false); setSaved(true); refetch();
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleWilaya = (w: string) => {
    setForm(f => ({ ...f, shippingWilayas: f.shippingWilayas.includes(w) ? f.shippingWilayas.filter(x => x !== w) : [...f.shippingWilayas, w] }));
  };

  const TAB_LABELS = { profile: "Store Profile", language: "Language", shipping: "Shipping Zones" };

  if (isLoading) return <AppLayout><div className="p-10 flex justify-center"><div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.settings")}</h1>
            <p className="text-muted-foreground mt-1">Configure your store profile and preferences.</p>
          </div>

          <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl border border-border w-fit">
            {TABS.map(tb => (
              <button key={tb} onClick={() => setTab(tb)} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === tb ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {TAB_LABELS[tb]}
              </button>
            ))}
          </div>

          {tab === "profile" && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <Store className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">Store Profile</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Store Name *</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Business Phone</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Store Description</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background resize-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Website URL</label>
                <input value={form.websiteUrl} onChange={e => setForm({...form, websiteUrl: e.target.value})} placeholder="https://" className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Logo URL</label>
                <input value={form.logoUrl} onChange={e => setForm({...form, logoUrl: e.target.value})} placeholder="https://..." className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
              <button onClick={handleSave} disabled={saving} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${saved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
                {saved ? "✓ Saved!" : saving ? "Saving..." : t("common.save")}
              </button>
            </div>
          )}

          {tab === "language" && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <Globe className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">Language Preferences</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-border rounded-xl p-5 space-y-3">
                  <div>
                    <p className="font-semibold text-foreground">Interface Language</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Language of the seller dashboard</p>
                  </div>
                  <select value={form.defaultLanguage} onChange={e => setForm({...form, defaultLanguage: e.target.value})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                    <option value="fr">🇫🇷 Français</option>
                    <option value="en">🇬🇧 English</option>
                  </select>
                </div>
                <div className="border border-border rounded-xl p-5 space-y-3">
                  <div>
                    <p className="font-semibold text-foreground">Widget Language</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Default language shown to visitors on your widget</p>
                  </div>
                  <select value={form.widgetLanguage} onChange={e => setForm({...form, widgetLanguage: e.target.value})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                    <option value="fr">🇫🇷 Français</option>
                    <option value="en">🇬🇧 English</option>
                  </select>
                </div>
              </div>
              <div className="bg-secondary/50 border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Arabic/Darija support</span> is planned for a future release. The architecture already supports adding new locales.</p>
              </div>
              <button onClick={handleSave} disabled={saving} className={`px-5 py-2.5 rounded-xl font-bold text-sm ${saved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
                {saved ? "✓ Saved!" : saving ? "Saving..." : t("common.save")}
              </button>
            </div>
          )}

          {tab === "shipping" && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <MapPin className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">Shipping Wilayas</h3>
                <span className="ml-auto text-sm text-muted-foreground">{form.shippingWilayas.length} selected</span>
              </div>
              <div className="flex gap-3 mb-3">
                <button onClick={() => setForm({...form, shippingWilayas: [...WILAYAS]})} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-secondary">Select All</button>
                <button onClick={() => setForm({...form, shippingWilayas: []})} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-secondary">Clear All</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-80 overflow-y-auto pr-1">
                {WILAYAS.map(w => (
                  <label key={w} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-all ${form.shippingWilayas.includes(w) ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-secondary"}`}>
                    <input type="checkbox" checked={form.shippingWilayas.includes(w)} onChange={() => toggleWilaya(w)} className="w-3.5 h-3.5 accent-primary" />
                    {w}
                  </label>
                ))}
              </div>
              <button onClick={handleSave} disabled={saving} className={`px-5 py-2.5 rounded-xl font-bold text-sm ${saved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
                {saved ? "✓ Saved!" : saving ? "Saving..." : t("common.save")}
              </button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
