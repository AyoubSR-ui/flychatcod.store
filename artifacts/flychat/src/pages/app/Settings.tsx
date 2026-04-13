import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { useGetStoreSettings, useUpdateStoreSettings } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";
import { Store, Globe, MapPin, Bot, Check, Truck, Package } from "lucide-react";

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

const CHANNEL_META = {
  whatsapp:  { label: "WhatsApp",           color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200", dot: "bg-green-500"  },
  instagram: { label: "Instagram DMs",      color: "text-pink-700",   bg: "bg-pink-50",   border: "border-pink-200",  dot: "bg-pink-500"   },
  messenger: { label: "Facebook Messenger", color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",  dot: "bg-blue-500"   },
  widget:    { label: "Website Widget",     color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200",dot: "bg-violet-500" },
} as const;

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

type Channel = keyof typeof CHANNEL_META;
type AiModes = Record<Channel, "human" | "ai_autopilot">;

interface WilayaPrice { home: number; homeEnabled: boolean; pickup: number; pickupEnabled: boolean; }
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
  const [shippingSaving, setShippingSaving] = useState(false);
  const [shippingSaved, setShippingSaved] = useState(false);
  const [applyAllHome, setApplyAllHome] = useState("");
  const [applyAllPickup, setApplyAllPickup] = useState("");

  const [aiModes, setAiModes] = useState<AiModes>({
    whatsapp: "human", instagram: "human", messenger: "human", widget: "human",
  });
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);

  useEffect(() => {
    if (store) setForm({
      name: store.name || "", description: store.description || "",
      phone: store.phone || "", logoUrl: store.logoUrl || "",
      websiteUrl: store.websiteUrl || "", defaultLanguage: store.defaultLanguage || "fr",
      widgetLanguage: store.widgetLanguage || "fr", shippingWilayas: store.shippingWilayas || [],
    });
  }, [store]);

  useEffect(() => {
    if (tab !== "shipping") return;
    const token = localStorage.getItem("flychat_token") || "";
    fetch(`${API_BASE}/api/settings/shipping-options`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data && typeof data === "object") setShipping({ ...defaultShipping, ...data }); })
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    if (tab !== "autopilot") return;
    const token = localStorage.getItem("flychat_token") || "";
    fetch(`${API_BASE}/api/settings/channels-ai`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data && typeof data === "object") setAiModes(prev => ({ ...prev, ...data })); })
      .catch(console.error);
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
    const token = localStorage.getItem("flychat_token") || "";
    try {
      await fetch(`${API_BASE}/api/settings/shipping-options`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(shipping),
      });
      await updateStore.mutateAsync({ data: { shippingWilayas: ALL_WILAYAS } as any });
      setShippingSaved(true);
      setTimeout(() => setShippingSaved(false), 2000);
    } catch {}
    setShippingSaving(false);
  };

  const handleSaveAiModes = async () => {
    setAiSaving(true);
    const token = localStorage.getItem("flychat_token") || "";
    await fetch(`${API_BASE}/api/settings/channels-ai`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(aiModes),
    });
    setAiSaving(false); setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
  };

  const getWilaya = (w: string) => ({
    home: shipping.wilayaPrices[w]?.home ?? 0,
    homeEnabled: shipping.wilayaPrices[w]?.homeEnabled ?? true,
    pickup: shipping.wilayaPrices[w]?.pickup ?? 0,
    pickupEnabled: shipping.wilayaPrices[w]?.pickupEnabled ?? true,
  });

  const setWilayaPrice = (wilaya: string, field: "home" | "pickup", value: number) => {
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

  const applyAllPrices = (field: "home" | "pickup", value: string) => {
    const num = Number(value);
    if (isNaN(num)) return;
    const updated: Record<string, WilayaPrice> = {};
    ALL_WILAYAS.forEach(w => { updated[w] = { ...getWilaya(w), [field]: num }; });
    setShipping(s => ({ ...s, wilayaPrices: updated }));
  };

  const TAB_LABELS = { profile: "Store Profile", language: "Language", shipping: "Shipping", autopilot: "Autopilot" };

  if (isLoading) return (
    <AppLayout><div className="p-10 flex justify-center"><div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full" /></div></AppLayout>
  );

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.settings")}</h1>
            <p className="text-muted-foreground mt-1">Configure your store profile and preferences.</p>
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
              <button onClick={handleSave} disabled={saving}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${saved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
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
                  <select value={form.defaultLanguage} onChange={e => setForm({...form, defaultLanguage: e.target.value})}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                    <option value="fr">🇫🇷 Français</option>
                    <option value="en">🇬🇧 English</option>
                  </select>
                </div>
                <div className="border border-border rounded-xl p-5 space-y-3">
                  <div>
                    <p className="font-semibold text-foreground">Widget Language</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Default language shown to visitors</p>
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
                {saved ? "✓ Saved!" : saving ? "Saving..." : t("common.save")}
              </button>
            </div>
          )}

          {tab === "shipping" && (
            <div className="space-y-5">
              {/* ── Shipping Mode Config ── */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <Truck className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="font-bold text-foreground">Shipping Options</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">AI agent will present these options when collecting orders.</p>
                  </div>
                </div>

                {/* Prioritize */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block">Prioritize Shipping Mode By</label>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={shipping.prioritize === "home"} onChange={() => setShipping(s => ({ ...s, prioritize: "home" }))} className="accent-primary" />
                      <span className="text-sm font-medium">الى البيت (Home)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={shipping.prioritize === "pickup"} onChange={() => setShipping(s => ({ ...s, prioritize: "pickup" }))} className="accent-primary" />
                      <span className="text-sm font-medium">من الفرع (Pickup)</span>
                    </label>
                  </div>
                </div>

                {/* Labels */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Door Delivery Label</label>
                    <input value={shipping.homeLabel} onChange={e => setShipping(s => ({ ...s, homeLabel: e.target.value }))}
                      className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Stop Desk Label</label>
                      <button onClick={() => setShipping(s => ({ ...s, pickupEnabled: !s.pickupEnabled }))}
                        className={`text-xs px-2 py-1 rounded font-bold ${shipping.pickupEnabled ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                        {shipping.pickupEnabled ? "Disable Stop Desk" : "Enable Stop Desk"}
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
                    <h3 className="font-bold text-foreground">Manage Pricings</h3>
                    <span className="ml-auto text-xs text-muted-foreground">{ALL_WILAYAS.length} wilayas</span>
                  </div>
                  {/* Apply All row */}
                  <div className="grid grid-cols-3 gap-4 p-3 bg-secondary/50 rounded-xl border border-border">
                    <div className="text-sm font-bold text-muted-foreground flex items-center">Apply to All</div>
                    <div className="flex gap-2 items-center">
                      <input type="number" min={0} value={applyAllHome} onChange={e => setApplyAllHome(e.target.value)}
                        placeholder="0" className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm outline-none bg-background" />
                      <button onClick={() => { applyAllPrices("home", applyAllHome); }}
                        className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 whitespace-nowrap">Apply All</button>
                    </div>
                    {shipping.pickupEnabled && (
                      <div className="flex gap-2 items-center">
                        <input type="number" min={0} value={applyAllPickup} onChange={e => setApplyAllPickup(e.target.value)}
                          placeholder="0" className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm outline-none bg-background" />
                        <button onClick={() => applyAllPrices("pickup", applyAllPickup)}
                          className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 whitespace-nowrap">Apply All</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Table header */}
                <div className={`grid bg-secondary/30 border-b border-border text-xs font-bold text-muted-foreground uppercase px-6 py-3 ${shipping.pickupEnabled ? "grid-cols-3" : "grid-cols-2"}`}>
                  <div>Province</div>
                  <div>Door Delivery Price</div>
                  {shipping.pickupEnabled && <div>Stop Desk Price</div>}
                </div>

                {/* Wilaya rows */}
                <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
                  {ALL_WILAYAS.map((w, idx) => {
                    const homeOn = shipping.wilayaPrices[w]?.homeEnabled ?? true;
                    const pickupOn = shipping.wilayaPrices[w]?.pickupEnabled ?? true;
                    return (
                      <div key={w} className={`grid px-6 py-3 items-center hover:bg-secondary/20 transition-colors ${shipping.pickupEnabled ? "grid-cols-3" : "grid-cols-2"}`}>
                        <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5">{idx + 1}</span>
                          {w}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setWilayaEnabled(w, "homeEnabled", !homeOn)}
                            title={homeOn ? "Click to disable home delivery for this wilaya" : "Click to enable home delivery for this wilaya"}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors shrink-0 ${homeOn ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-600 hover:bg-red-200"}`}>
                            {homeOn ? "✓" : "N/A"}
                          </button>
                          <span className="text-xs text-muted-foreground">DZD</span>
                          <input type="number" min={0}
                            value={shipping.wilayaPrices[w]?.home ?? ""}
                            onChange={e => setWilayaPrice(w, "home", Number(e.target.value))}
                            disabled={!homeOn}
                            placeholder="0"
                            className={`w-24 border border-border rounded-lg px-3 py-1.5 text-sm outline-none bg-background focus:ring-2 focus:ring-primary/20 ${!homeOn ? "opacity-40 cursor-not-allowed" : ""}`} />
                        </div>
                        {shipping.pickupEnabled && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setWilayaEnabled(w, "pickupEnabled", !pickupOn)}
                              title={pickupOn ? "Click to disable stop desk for this wilaya" : "Click to enable stop desk for this wilaya"}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors shrink-0 ${pickupOn ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-600 hover:bg-red-200"}`}>
                              {pickupOn ? "✓" : "N/A"}
                            </button>
                            <span className="text-xs text-muted-foreground">DZD</span>
                            <input type="number" min={0}
                              value={shipping.wilayaPrices[w]?.pickup ?? ""}
                              onChange={e => setWilayaPrice(w, "pickup", Number(e.target.value))}
                              disabled={!pickupOn}
                              placeholder="0"
                              className={`w-24 border border-border rounded-lg px-3 py-1.5 text-sm outline-none bg-background focus:ring-2 focus:ring-primary/20 ${!pickupOn ? "opacity-40 cursor-not-allowed" : ""}`} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button onClick={handleSaveShipping} disabled={shippingSaving}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${shippingSaved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
                {shippingSaved ? <><Check className="w-4 h-4" /> Saved!</> : shippingSaving ? "Saving..." : t("common.save")}
              </button>
            </div>
          )}

          {tab === "autopilot" && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <Bot className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-bold text-foreground">Channel Autopilot</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Set the default mode for new conversations on each channel.</p>
                </div>
              </div>
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
                <p><span className="font-bold">How it works:</span> When a new message arrives on a channel, the conversation starts in the mode you set here.</p>
              </div>
              <div className="space-y-3">
                {(Object.entries(CHANNEL_META) as [Channel, typeof CHANNEL_META[Channel]][]).map(([ch, meta]) => {
                  const isAi = aiModes[ch] === "ai_autopilot";
                  return (
                    <div key={ch} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isAi ? `${meta.bg} ${meta.border}` : "bg-secondary/30 border-border"}`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${isAi ? meta.dot : "bg-gray-300"}`} />
                        <div>
                          <p className={`font-semibold text-sm ${isAi ? meta.color : "text-foreground"}`}>{meta.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{isAi ? "AI handles new messages automatically" : "Agent handles new messages manually"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${!isAi ? "text-foreground" : "text-muted-foreground"}`}>Human</span>
                        <button onClick={() => setAiModes(prev => ({ ...prev, [ch]: isAi ? "human" : "ai_autopilot" }))}
                          className={`relative w-11 h-6 rounded-full transition-colors ${isAi ? "bg-violet-600" : "bg-gray-200"}`}>
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${isAi ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                        <span className={`text-xs font-medium ${isAi ? "text-violet-700" : "text-muted-foreground"}`}>AI</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={handleSaveAiModes} disabled={aiSaving}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${aiSaved ? "bg-green-500 text-white" : "bg-primary text-white hover:bg-primary/90"} disabled:opacity-50`}>
                {aiSaved ? <><Check className="w-4 h-4" /> Saved!</> : aiSaving ? "Saving..." : t("common.save")}
              </button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}