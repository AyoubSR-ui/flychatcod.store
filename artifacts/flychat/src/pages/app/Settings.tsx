import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { useGetStoreSettings, useUpdateStoreSettings } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";
import { Store, Globe, MapPin, Bot, Check, Truck, Package } from "lucide-react";
import { DocButton } from "@/components/DocButton";
import { authFetch } from "@/lib/auth-fetch";

const TABS = ["profile", "language", "shipping", "autopilot"] as const;

const ALL_WILAYAS = [
  "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar",
  "Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger",
  "Djelfa","Jijel","Sétif","Saïda","Skikda","Sidi Bel Abbès","Annaba","Guelma",
  "Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla","Oran","El Bayadh",
  "Illizi","Bordj Bou Arréridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued",
  "Khenchela","Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent",
  "Ghardaïa","Relizane","El M'Ghair","El Méniaa","Ouled Djellal","Bordj Badji Mokhtar",
  "Béni Abbès","Timimoun","Touggourt","Djanet","In Salah","In Guezzam",
];

const WILAYA_SHIPPING_DEFAULTS: Record<string, { home: number; pickup: number; retour: number }> = {
  "Adrar":               { home: 1400, pickup: 970,  retour: 200 },
  "Chlef":               { home: 750,  pickup: 520,  retour: 200 },
  "Laghouat":            { home: 950,  pickup: 670,  retour: 200 },
  "Oum El Bouaghi":      { home: 800,  pickup: 520,  retour: 200 },
  "Batna":               { home: 800,  pickup: 520,  retour: 200 },
  "Béjaïa":              { home: 800,  pickup: 520,  retour: 200 },
  "Biskra":              { home: 950,  pickup: 670,  retour: 200 },
  "Béchar":              { home: 1050, pickup: 720,  retour: 200 },
  "Blida":               { home: 750,  pickup: 520,  retour: 200 },
  "Bouira":              { home: 800,  pickup: 520,  retour: 200 },
  "Tamanrasset":         { home: 1600, pickup: 1120, retour: 250 },
  "Tébessa":             { home: 850,  pickup: 520,  retour: 200 },
  "Tlemcen":             { home: 700,  pickup: 520,  retour: 200 },
  "Tiaret":              { home: 750,  pickup: 520,  retour: 200 },
  "Tizi Ouzou":          { home: 800,  pickup: 520,  retour: 200 },
  "Alger":               { home: 650,  pickup: 470,  retour: 200 },
  "Djelfa":              { home: 950,  pickup: 670,  retour: 200 },
  "Jijel":               { home: 800,  pickup: 520,  retour: 200 },
  "Sétif":               { home: 800,  pickup: 520,  retour: 200 },
  "Saïda":               { home: 750,  pickup: 570,  retour: 200 },
  "Skikda":              { home: 800,  pickup: 520,  retour: 200 },
  "Sidi Bel Abbès":      { home: 700,  pickup: 520,  retour: 200 },
  "Annaba":              { home: 850,  pickup: 520,  retour: 200 },
  "Guelma":              { home: 850,  pickup: 520,  retour: 200 },
  "Constantine":         { home: 800,  pickup: 520,  retour: 200 },
  "Médéa":               { home: 750,  pickup: 520,  retour: 200 },
  "Mostaganem":          { home: 700,  pickup: 520,  retour: 200 },
  "M'Sila":              { home: 900,  pickup: 570,  retour: 200 },
  "Mascara":             { home: 700,  pickup: 520,  retour: 200 },
  "Ouargla":             { home: 950,  pickup: 720,  retour: 200 },
  "Oran":                { home: 0,    pickup: 0,    retour: 0   },
  "El Bayadh":           { home: 1000, pickup: 670,  retour: 200 },
  "Illizi":              { home: 0,    pickup: 0,    retour: 0   },
  "Bordj Bou Arréridj":  { home: 800,  pickup: 520,  retour: 200 },
  "Boumerdès":           { home: 800,  pickup: 520,  retour: 200 },
  "El Tarf":             { home: 850,  pickup: 520,  retour: 200 },
  "Tindouf":             { home: 0,    pickup: 0,    retour: 0   },
  "Tissemsilt":          { home: 750,  pickup: 520,  retour: 200 },
  "El Oued":             { home: 950,  pickup: 720,  retour: 200 },
  "Khenchela":           { home: 800,  pickup: 520,  retour: 200 },
  "Souk Ahras":          { home: 800,  pickup: 520,  retour: 200 },
  "Tipaza":              { home: 800,  pickup: 520,  retour: 200 },
  "Mila":                { home: 800,  pickup: 520,  retour: 200 },
  "Aïn Defla":           { home: 750,  pickup: 520,  retour: 200 },
  "Naâma":               { home: 1000, pickup: 670,  retour: 200 },
  "Aïn Témouchent":      { home: 650,  pickup: 520,  retour: 200 },
  "Ghardaïa":            { home: 950,  pickup: 670,  retour: 200 },
  "Relizane":            { home: 750,  pickup: 520,  retour: 200 },
  "Timimoun":            { home: 1400, pickup: 970,  retour: 200 },
  "Ouled Djellal":       { home: 950,  pickup: 670,  retour: 200 },
  "Bordj Badji Mokhtar": { home: 0,    pickup: 0,    retour: 0   },
  "Béni Abbès":          { home: 1200, pickup: 970,  retour: 200 },
  "In Salah":            { home: 1600, pickup: 1120, retour: 250 },
  "In Guezzam":          { home: 1600, pickup: 0,    retour: 250 },
  "Touggourt":           { home: 950,  pickup: 720,  retour: 200 },
  "Djanet":              { home: 0,    pickup: 0,    retour: 0   },
  "El M'Ghair":          { home: 950,  pickup: 0,    retour: 200 },
  "El Méniaa":           { home: 950,  pickup: 720,  retour: 200 },
};

const CHANNEL_META = {
  whatsapp:  { labelKey: "settings.autopilot.channel.whatsapp",  color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200", dot: "bg-green-500"  },
  instagram: { labelKey: "settings.autopilot.channel.instagram", color: "text-pink-700",   bg: "bg-pink-50",   border: "border-pink-200",  dot: "bg-pink-500"   },
  messenger: { labelKey: "settings.autopilot.channel.messenger", color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",  dot: "bg-blue-500"   },
  widget:    { labelKey: "settings.autopilot.channel.widget",    color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200",dot: "bg-violet-500" },
} as const;

type Channel = keyof typeof CHANNEL_META;
type AiModes = Record<Channel, "human" | "ai_autopilot">;

interface WilayaPrice { home: number; homeEnabled: boolean; pickup: number; pickupEnabled: boolean; retour: number; }
interface ShippingOptions {
  homeDeliveryEnabled: boolean;
  pickupEnabled: boolean;
  prioritize: "home" | "pickup";
  homeLabel: string;
  pickupLabel: string;
  wilayaPrices: Record<string, WilayaPrice>;
}

const defaultShipping: ShippingOptions = {
  homeDeliveryEnabled: true,
  pickupEnabled: false,
  prioritize: "home",
  homeLabel: "الى البيت",
  pickupLabel: "من الفرع",
  wilayaPrices: {},
};

export default function Settings() {
  const [tab, setTab] = useState<typeof TABS[number]>("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data: store, isLoading, refetch } = useGetStoreSettings();
  const updateStore = useUpdateStoreSettings();
  const { t, language, setLanguage } = useI18n();

  const [form, setForm] = useState({
    name: "", description: "", phone: "", logoUrl: "", websiteUrl: "",
    defaultLanguage: "fr", widgetLanguage: "fr", shippingWilayas: [] as string[],
  });

  const [shipping, setShipping] = useState<ShippingOptions>(defaultShipping);
  const [shippingLoadError, setShippingLoadError] = useState(false);
  const [shippingSaving, setShippingSaving] = useState(false);
  const [shippingSaved, setShippingSaved] = useState(false);
  const [applyAllHome, setApplyAllHome] = useState("");
  const [applyAllPickup, setApplyAllPickup] = useState("");
  const [applyAllRetour, setApplyAllRetour] = useState("");

  const [aiModes, setAiModes] = useState<AiModes>({
    whatsapp: "human", instagram: "human", messenger: "human", widget: "human",
  });
  const [aiModesLoadError, setAiModesLoadError] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  const [applyingChannel, setApplyingChannel] = useState<string | null>(null);
  const [appliedChannel, setAppliedChannel] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [applyingAll, setApplyingAll] = useState(false);
  const [appliedAllCount, setAppliedAllCount] = useState<number | null>(null);

  useEffect(() => {
    if (store) setForm({
      name: store.name || "", description: store.description || "",
      phone: store.phone || "", logoUrl: store.logoUrl || "",
      websiteUrl: store.websiteUrl || "", defaultLanguage: store.defaultLanguage || "fr",
      widgetLanguage: store.widgetLanguage || "fr", shippingWilayas: store.shippingWilayas || [],
    });
  }, [store]);

  const loadShippingOptions = () => {
    setShippingLoadError(false);
    authFetch<Partial<ShippingOptions>>("/api/settings/shipping-options")
      .then(data => { if (data && typeof data === "object") setShipping({ ...defaultShipping, ...data }); })
      .catch(() => setShippingLoadError(true));
  };

  const loadAiModes = () => {
    setAiModesLoadError(false);
    authFetch<Partial<AiModes>>("/api/settings/channels-ai")
      .then(data => { if (data && typeof data === "object") setAiModes(prev => ({ ...prev, ...data })); })
      .catch(() => setAiModesLoadError(true));
  };

  useEffect(() => {
    if (tab === "shipping") loadShippingOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab === "autopilot") loadAiModes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleSave = async () => {
    setSaving(true);
    await updateStore.mutateAsync({ data: form as any });
    if (form.defaultLanguage !== language) setLanguage(form.defaultLanguage as "en" | "fr");
    setSaving(false); setSaved(true); refetch();
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveShipping = async () => {
    setShippingSaving(true);
    try {
      await authFetch("/api/settings/shipping-options", { method: "PATCH", body: JSON.stringify(shipping) });
      await updateStore.mutateAsync({ data: { shippingWilayas: ALL_WILAYAS } as any });
      setShippingSaved(true);
      setTimeout(() => setShippingSaved(false), 2000);
    } catch (err: any) {
      alert(err.message || t("common.load_failed"));
    }
    setShippingSaving(false);
  };

  const handleApplyAiToAll = async (channelKey: string) => {
    const label = channelKey === "all" ? t("settings.autopilot.all_channels_label") : channelKey;
    if (!confirm(t("settings.autopilot.confirm_apply").replace("{channel}", label))) return;
    setApplyingChannel(channelKey);
    try {
      const data = await authFetch<{ updatedCount?: number }>("/api/settings/apply-ai-to-all", {
        method: "POST",
        body: JSON.stringify({ channel: channelKey }),
      });
      setAppliedCount(data.updatedCount || 0);
      setAppliedChannel(channelKey);
      setTimeout(() => setAppliedChannel(null), 5000);
    } catch (err: any) {
      alert(err.message || t("settings.err.apply_ai_failed"));
    } finally {
      setApplyingChannel(null);
    }
  };

  const handleApplyAiToAllConversations = async () => {
    if (!confirm(t("settings.autopilot.confirm_all_conversations"))) return;
    setApplyingAll(true);
    try {
      const data = await authFetch<{ updated?: number }>("/api/settings/apply-ai-to-all-conversations", { method: "POST" });
      setAppliedAllCount(data.updated ?? 0);
      setTimeout(() => setAppliedAllCount(null), 6000);
    } catch (err: any) {
      alert(err.message || t("settings.err.apply_ai_all_failed"));
    } finally {
      setApplyingAll(false);
    }
  };

  const handleSaveAiModes = async () => {
    setAiSaving(true);
    try {
      await authFetch("/api/settings/channels-ai", { method: "PATCH", body: JSON.stringify(aiModes) });
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 2000);
    } catch (err: any) {
      alert(err.message || t("common.load_failed"));
    }
    setAiSaving(false);
  };

  const getWilaya = (w: string): WilayaPrice => ({
    home: shipping.wilayaPrices[w]?.home ?? WILAYA_SHIPPING_DEFAULTS[w]?.home ?? 0,
    homeEnabled: shipping.wilayaPrices[w]?.homeEnabled ?? true,
    pickup: shipping.wilayaPrices[w]?.pickup ?? WILAYA_SHIPPING_DEFAULTS[w]?.pickup ?? 0,
    pickupEnabled: shipping.wilayaPrices[w]?.pickupEnabled ?? true,
    retour: shipping.wilayaPrices[w]?.retour ?? WILAYA_SHIPPING_DEFAULTS[w]?.retour ?? 200,
  });

  const setWilayaPrice = (wilaya: string, field: "home" | "pickup" | "retour", value: number) => {
    setShipping(s => ({
      ...s,
      wilayaPrices: { ...s.wilayaPrices, [wilaya]: { ...getWilaya(wilaya), [field]: value } },
    }));
  };

  const setWilayaEnabled = (wilaya: string, field: "homeEnabled" | "pickupEnabled", value: boolean) => {
    setShipping(s => ({
      ...s,
      wilayaPrices: { ...s.wilayaPrices, [wilaya]: { ...getWilaya(wilaya), [field]: value } },
    }));
  };

  const applyAllPrices = (field: "home" | "pickup" | "retour", value: string) => {
    const num = Number(value);
    if (isNaN(num)) return;
    const updated: Record<string, WilayaPrice> = {};
    ALL_WILAYAS.forEach(w => { updated[w] = { ...getWilaya(w), [field]: num }; });
    setShipping(s => ({ ...s, wilayaPrices: updated }));
  };

  const TAB_LABELS = {
    profile: t("settings.tab.profile"),
    language: t("settings.tab.language"),
    shipping: t("settings.tab.shipping"),
    autopilot: t("settings.tab.autopilot"),
  };

  if (isLoading) return (
    <AppLayout><div className="p-10 flex justify-center"><div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full" /></div></AppLayout>
  );

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.settings")}</h1>
              <DocButton docId="shipping" />
            </div>
            <p className="text-muted-foreground mt-1">{t("settings.subtitle")}</p>
          </div>

          <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl border border-border w-fit">
            {TABS.map(tb => (
              <button key={tb} onClick={() => setTab(tb)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === tb ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {TAB_LABELS[tb]}
              </button>
            ))}
          </div>

          {tab === "profile" && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <Store className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">{t("settings.tab.profile")}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("settings.profile.name_label")}</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("settings.profile.phone_label")}</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("settings.profile.description_label")}</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background resize-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("settings.profile.website_label")}</label>
                <input value={form.websiteUrl} onChange={e => setForm({...form, websiteUrl: e.target.value})} placeholder="https://" className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("settings.profile.logo_label")}</label>
                <input value={form.logoUrl} onChange={e => setForm({...form, logoUrl: e.target.value})} placeholder="https://..." className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
              <button onClick={handleSave} disabled={saving}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${saved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
                {saved ? t("settings.saved_check") : saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          )}

          {tab === "language" && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <Globe className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">{t("settings.language.title")}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-border rounded-xl p-5 space-y-3">
                  <div>
                    <p className="font-semibold text-foreground">{t("settings.language.interface_label")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("settings.language.interface_hint")}</p>
                  </div>
                  <select value={form.defaultLanguage} onChange={e => setForm({...form, defaultLanguage: e.target.value})}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                    <option value="fr">🇫🇷 Français</option>
                    <option value="en">🇬🇧 English</option>
                  </select>
                </div>
                <div className="border border-border rounded-xl p-5 space-y-3">
                  <div>
                    <p className="font-semibold text-foreground">{t("settings.language.widget_label")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("settings.language.widget_hint")}</p>
                  </div>
                  <select value={form.widgetLanguage} onChange={e => setForm({...form, widgetLanguage: e.target.value})}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                    <option value="fr">🇫🇷 Français</option>
                    <option value="en">🇬🇧 English</option>
                  </select>
                </div>
              </div>
              <button onClick={handleSave} disabled={saving}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm ${saved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
                {saved ? t("settings.saved_check") : saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          )}

          {tab === "shipping" && (
            <div className="space-y-5">
              {shippingLoadError && (
                <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm">
                  <span className="text-red-800 font-medium">{t("common.load_failed")}</span>
                  <button onClick={loadShippingOptions} className="text-red-700 font-bold hover:underline">{t("common.retry")}</button>
                </div>
              )}
              {/* ── Shipping Mode Config ── */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <Truck className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="font-bold text-foreground">{t("settings.shipping.title")}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("settings.shipping.desc")}</p>
                  </div>
                </div>

                {/* Prioritize */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block">{t("settings.shipping.prioritize_label")}</label>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={shipping.prioritize === "home"} onChange={() => setShipping(s => ({ ...s, prioritize: "home" }))} className="accent-primary" />
                      <span className="text-sm font-medium">{t("settings.shipping.home_radio")}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={shipping.prioritize === "pickup"} onChange={() => setShipping(s => ({ ...s, prioritize: "pickup" }))} className="accent-primary" />
                      <span className="text-sm font-medium">{t("settings.shipping.pickup_radio")}</span>
                    </label>
                  </div>
                </div>

                {/* Labels */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("settings.shipping.home_label_field")}</label>
                    <input value={shipping.homeLabel} onChange={e => setShipping(s => ({ ...s, homeLabel: e.target.value }))}
                      className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t("settings.shipping.pickup_label_field")}</label>
                      <button onClick={() => setShipping(s => ({ ...s, pickupEnabled: !s.pickupEnabled }))}
                        className={`text-xs px-2 py-1 rounded font-bold ${shipping.pickupEnabled ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                        {shipping.pickupEnabled ? t("settings.shipping.disable_stop_desk") : t("settings.shipping.enable_stop_desk")}
                      </button>
                    </div>
                    <input value={shipping.pickupLabel} onChange={e => setShipping(s => ({ ...s, pickupLabel: e.target.value }))}
                      disabled={!shipping.pickupEnabled}
                      className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background disabled:opacity-50" />
                  </div>
                </div>
              </div>

              {/* ── Per-Wilaya Pricing ── */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <MapPin className="w-5 h-5 text-primary" />
                    <h3 className="font-bold text-foreground">{t("settings.shipping.manage_pricings")}</h3>
                    <span className="ml-auto text-xs text-muted-foreground">{t("settings.shipping.wilaya_count").replace("{n}", String(ALL_WILAYAS.length))}</span>
                  </div>
                  {/* Apply All row */}
                  <div className={`grid gap-3 p-3 bg-secondary/50 rounded-xl border border-border ${shipping.pickupEnabled ? "grid-cols-4" : "grid-cols-3"}`}>
                    <div className="text-sm font-bold text-muted-foreground flex items-center">{t("settings.shipping.apply_to_all")}</div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground shrink-0">DZD</span>
                      <input type="number" min={0} value={applyAllHome} onChange={e => setApplyAllHome(e.target.value)}
                        placeholder={t("settings.shipping.placeholder.home")} className="flex-1 min-w-0 border border-border rounded-lg px-2 py-1.5 text-sm outline-none bg-background" />
                      <button onClick={() => applyAllPrices("home", applyAllHome)} title={t("settings.shipping.apply_all_title")}
                        className="shrink-0 w-8 h-8 flex items-center justify-center bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {shipping.pickupEnabled && (
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-muted-foreground shrink-0">DZD</span>
                        <input type="number" min={0} value={applyAllPickup} onChange={e => setApplyAllPickup(e.target.value)}
                          placeholder={t("settings.shipping.placeholder.pickup")} className="flex-1 min-w-0 border border-border rounded-lg px-2 py-1.5 text-sm outline-none bg-background" />
                        <button onClick={() => applyAllPrices("pickup", applyAllPickup)} title={t("settings.shipping.apply_all_title")}
                          className="shrink-0 w-8 h-8 flex items-center justify-center bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground shrink-0">DZD</span>
                      <input type="number" min={0} value={applyAllRetour} onChange={e => setApplyAllRetour(e.target.value)}
                        placeholder={t("settings.shipping.placeholder.retour")} className="flex-1 min-w-0 border border-border rounded-lg px-2 py-1.5 text-sm outline-none bg-background" />
                      <button onClick={() => applyAllPrices("retour", applyAllRetour)} title={t("settings.shipping.apply_all_title")}
                        className="shrink-0 w-8 h-8 flex items-center justify-center bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table header */}
                <div className={`grid bg-secondary/30 border-b border-border text-xs font-bold text-muted-foreground uppercase px-6 py-3 ${shipping.pickupEnabled ? "grid-cols-4" : "grid-cols-3"}`}>
                  <div>{t("settings.shipping.table.province")}</div>
                  <div>{t("settings.shipping.table.home")}</div>
                  {shipping.pickupEnabled && <div>{t("settings.shipping.table.pickup")}</div>}
                  <div>{t("settings.shipping.table.retour")}</div>
                </div>

                {/* Wilaya rows */}
                <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
                  {ALL_WILAYAS.map((w, idx) => {
                    const wData = getWilaya(w);
                    const homeOn = wData.homeEnabled;
                    const pickupOn = wData.pickupEnabled;
                    return (
                      <div key={w} className={`grid px-6 py-3 items-center hover:bg-secondary/20 transition-colors ${shipping.pickupEnabled ? "grid-cols-4" : "grid-cols-3"}`}>
                        <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5">{idx + 1}</span>
                          {w}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setWilayaEnabled(w, "homeEnabled", !homeOn)}
                            title={homeOn ? t("settings.shipping.toggle_home_off") : t("settings.shipping.toggle_home_on")}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors shrink-0 ${homeOn ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-600 hover:bg-red-200"}`}>
                            {homeOn ? "✓" : "N/A"}
                          </button>
                          <span className="text-xs text-muted-foreground">DZD</span>
                          <input type="number" min={0}
                            value={wData.home}
                            onChange={e => setWilayaPrice(w, "home", Number(e.target.value))}
                            disabled={!homeOn}
                            placeholder="0"
                            className={`w-20 border border-border rounded-lg px-2 py-1.5 text-sm outline-none bg-background focus:ring-2 focus:ring-primary/20 ${!homeOn ? "opacity-40 cursor-not-allowed" : ""}`} />
                        </div>
                        {shipping.pickupEnabled && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setWilayaEnabled(w, "pickupEnabled", !pickupOn)}
                              title={pickupOn ? t("settings.shipping.toggle_pickup_off") : t("settings.shipping.toggle_pickup_on")}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors shrink-0 ${pickupOn ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-600 hover:bg-red-200"}`}>
                              {pickupOn ? "✓" : "N/A"}
                            </button>
                            <span className="text-xs text-muted-foreground">DZD</span>
                            <input type="number" min={0}
                              value={wData.pickup}
                              onChange={e => setWilayaPrice(w, "pickup", Number(e.target.value))}
                              disabled={!pickupOn}
                              placeholder="0"
                              className={`w-20 border border-border rounded-lg px-2 py-1.5 text-sm outline-none bg-background focus:ring-2 focus:ring-primary/20 ${!pickupOn ? "opacity-40 cursor-not-allowed" : ""}`} />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">DZD</span>
                          <input type="number" min={0}
                            value={wData.retour}
                            onChange={e => setWilayaPrice(w, "retour", Number(e.target.value))}
                            placeholder="0"
                            className="w-20 border border-border rounded-lg px-2 py-1.5 text-sm outline-none bg-background focus:ring-2 focus:ring-primary/20" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button onClick={handleSaveShipping} disabled={shippingSaving}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${shippingSaved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
                {shippingSaved ? <><Check className="w-4 h-4" /> {t("aiSettings.saved")}</> : shippingSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          )}

          {tab === "autopilot" && (
            <div className="space-y-5">
              {aiModesLoadError && (
                <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm">
                  <span className="text-red-800 font-medium">{t("common.load_failed")}</span>
                  <button onClick={loadAiModes} className="text-red-700 font-bold hover:underline">{t("common.retry")}</button>
                </div>
              )}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <Bot className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-bold text-foreground">{t("settings.autopilot.title")}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.autopilot.desc")}</p>
                </div>
              </div>
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
                <p><span className="font-bold">{t("adLinks.how_it_works")}</span> {t("settings.autopilot.how_it_works_desc")}</p>
              </div>
              <div className="space-y-3">
                {(Object.entries(CHANNEL_META) as [Channel, typeof CHANNEL_META[Channel]][]).map(([ch, meta]) => {
                  const isAi = aiModes[ch] === "ai_autopilot";
                  const channelLabel = t(meta.labelKey);
                  return (
                    <div key={ch} className={`rounded-xl border transition-all ${isAi ? `${meta.bg} ${meta.border}` : "bg-secondary/30 border-border"}`}>
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <span className={`w-2.5 h-2.5 rounded-full ${isAi ? meta.dot : "bg-gray-300"}`} />
                          <div>
                            <p className={`font-semibold text-sm ${isAi ? meta.color : "text-foreground"}`}>{channelLabel}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{isAi ? t("settings.autopilot.ai_active_desc") : t("settings.autopilot.human_active_desc")}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${!isAi ? "text-foreground" : "text-muted-foreground"}`}>{t("ai.human")}</span>
                          <button onClick={() => setAiModes(prev => ({ ...prev, [ch]: isAi ? "human" : "ai_autopilot" }))}
                            className={`relative w-11 h-6 rounded-full transition-colors ${isAi ? "bg-violet-600" : "bg-gray-200"}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${isAi ? "translate-x-5" : "translate-x-0"}`} />
                          </button>
                          <span className={`text-xs font-medium ${isAi ? "text-violet-700" : "text-muted-foreground"}`}>{t("ai.generated")}</span>
                        </div>
                      </div>
                      {isAi && (
                        <div className="px-4 pb-3 ml-6 flex items-center gap-3">
                          <p className="text-xs text-muted-foreground">
                            {t("settings.autopilot.apply_to_channel").replace("{channel}", channelLabel)}
                          </p>
                          <button
                            onClick={() => handleApplyAiToAll(ch)}
                            disabled={applyingChannel === ch}
                            className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
                          >
                            {applyingChannel === ch ? t("settings.applying") : t("settings.autopilot.apply_now")}
                          </button>
                          {appliedChannel === ch && (
                            <span className="text-xs text-green-600 font-medium">
                              {t("settings.autopilot.done_updated").replace("{n}", String(appliedCount))}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button onClick={handleSaveAiModes} disabled={aiSaving}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${aiSaved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
                {aiSaved ? <><Check className="w-4 h-4" /> {t("aiSettings.saved")}</> : aiSaving ? t("common.saving") : t("common.save")}
              </button>
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("settings.autopilot.apply_all_channels_title")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.autopilot.apply_all_channels_desc")}
                    </p>
                  </div>
                  <button
                    onClick={() => handleApplyAiToAll("all")}
                    disabled={applyingChannel === "all"}
                    className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {applyingChannel === "all" ? t("settings.applying") : t("settings.autopilot.apply_all_channels_btn")}
                  </button>
                </div>
                {appliedChannel === "all" && (
                  <p className="text-xs text-green-600 font-medium mt-2">
                    {t("settings.autopilot.done_all_channels").replace("{n}", String(appliedCount))}
                  </p>
                )}
              </div>

              {/* Apply AI to ALL conversations (including old/closed) */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("settings.autopilot.apply_all_conversations_title")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.autopilot.apply_all_conversations_desc")}
                    </p>
                  </div>
                  <button
                    onClick={handleApplyAiToAllConversations}
                    disabled={applyingAll}
                    className="px-4 py-2 border border-border text-sm font-bold rounded-xl hover:bg-secondary/60 transition-colors disabled:opacity-50 text-foreground"
                  >
                    {applyingAll ? t("settings.applying") : t("settings.autopilot.apply_all_conversations_btn")}
                  </button>
                </div>
                {appliedAllCount !== null && (
                  <p className="text-xs text-green-600 font-medium mt-2">
                    {t("settings.autopilot.ai_enabled_count").replace("{n}", String(appliedAllCount))}
                  </p>
                )}
              </div>
            </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}