import { AppLayout } from "@/components/AppLayout";
import { useState } from "react";
import { Copy, Check, MessageSquare, Globe, Palette, Monitor } from "lucide-react";
import { useGetWidgetConfig, useUpdateWidgetConfig } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";

const TABS = ["settings", "preview", "install"] as const;

export default function Widget() {
  const [tab, setTab] = useState<typeof TABS[number]>("settings");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: config, isLoading, refetch } = useGetWidgetConfig();
  const updateConfig = useUpdateWidgetConfig();
  const { t } = useI18n();
  const [form, setForm] = useState({ welcomeMessageEn: "", welcomeMessageFr: "", defaultLanguage: "fr", primaryColor: "#2563eb", position: "bottom-right", isActive: true });

  const handleSave = async () => {
    setSaving(true);
    await updateConfig.mutateAsync({ data: form as any });
    setSaving(false); refetch();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(config?.embedCode || "");
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const previewColor = form.primaryColor || config?.primaryColor || "#2563eb";

  if (isLoading) return <AppLayout><div className="p-10 flex justify-center"><div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.widget")}</h1>
            <p className="text-muted-foreground mt-1">Configure your embeddable chat widget for your website.</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl w-fit border border-border">
            {TABS.map(t2 => (
              <button key={t2} onClick={() => setTab(t2)} className={`px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${tab === t2 ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {t2 === "settings" ? "Settings" : t2 === "preview" ? "Preview" : "Installation"}
              </button>
            ))}
          </div>

          {tab === "settings" && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block">Welcome Message (English)</label>
                  <textarea rows={3} defaultValue={config?.welcomeMessageEn} onChange={e => setForm({...form, welcomeMessageEn: e.target.value})}
                    className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background resize-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block">Welcome Message (Français)</label>
                  <textarea rows={3} defaultValue={config?.welcomeMessageFr} onChange={e => setForm({...form, welcomeMessageFr: e.target.value})}
                    className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background resize-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block flex items-center gap-2"><Globe className="w-3 h-3" /> Default Language</label>
                  <select defaultValue={config?.defaultLanguage} onChange={e => setForm({...form, defaultLanguage: e.target.value})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block flex items-center gap-2"><Palette className="w-3 h-3" /> Primary Color</label>
                  <div className="flex gap-3 items-center">
                    <input type="color" defaultValue={config?.primaryColor || "#2563eb"} onChange={e => setForm({...form, primaryColor: e.target.value})} className="w-12 h-10 rounded-lg border border-border cursor-pointer" />
                    <span className="text-sm font-mono text-muted-foreground">{previewColor}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block">Position</label>
                  <select defaultValue={config?.position} onChange={e => setForm({...form, position: e.target.value})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <input type="checkbox" id="widgetActive" defaultChecked={config?.isActive} onChange={e => setForm({...form, isActive: e.target.checked})} className="w-4 h-4 accent-primary" />
                <label htmlFor="widgetActive" className="text-sm font-medium">Widget is active (visible to visitors)</label>
              </div>

              <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Saving..." : t("common.save")}
              </button>
            </div>
          )}

          {tab === "preview" && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Monitor className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">Widget Preview</h3>
                <span className="text-xs text-muted-foreground">(Approximate visual — not interactive)</span>
              </div>
              <div className="relative bg-gray-100 rounded-2xl h-96 flex items-end justify-end p-6 overflow-hidden">
                <div className="absolute inset-4 opacity-20 pointer-events-none">
                  <div className="h-4 bg-gray-400 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-gray-400 rounded w-1/2 mb-4" />
                  <div className="h-20 bg-gray-300 rounded w-full mb-2" />
                  <div className="h-4 bg-gray-400 rounded w-2/3" />
                </div>
                {/* Chat panel */}
                <div className="flex flex-col items-end gap-3 z-10">
                  <div className="bg-white rounded-2xl shadow-2xl w-72 overflow-hidden border border-gray-200">
                    <div className="p-4 flex items-center gap-3" style={{ backgroundColor: previewColor }}>
                      <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-white font-bold text-sm">AlgerShop Pro</p>
                        <p className="text-white/70 text-xs">Typically replies in minutes</p>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="bg-gray-100 rounded-xl rounded-tl-none p-3 max-w-[80%]">
                        <p className="text-xs text-gray-700">{config?.welcomeMessageFr || form.welcomeMessageFr || "Bonjour! Comment pouvons-nous vous aider?"}</p>
                      </div>
                      <div className="flex gap-2">
                        <button className="text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50">Commander</button>
                        <button className="text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50">Infos</button>
                      </div>
                    </div>
                    <div className="p-3 border-t border-gray-100 flex gap-2 items-center">
                      <input className="flex-1 text-xs bg-gray-50 rounded-full px-4 py-2 border border-gray-200 outline-none" placeholder="Type a message..." />
                      <button className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm" style={{ backgroundColor: previewColor }}>→</button>
                    </div>
                  </div>
                  {/* Bubble */}
                  <div className="w-14 h-14 rounded-full shadow-2xl flex items-center justify-center cursor-pointer" style={{ backgroundColor: previewColor }}>
                    <MessageSquare className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "install" && (
            <div className="space-y-6">
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold text-foreground mb-2">Embed Code</h3>
                <p className="text-sm text-muted-foreground mb-4">Copy and paste this snippet just before the closing <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">&lt;/body&gt;</code> tag on your website.</p>
                <div className="relative bg-gray-950 rounded-xl p-4 font-mono text-xs text-green-400 overflow-x-auto">
                  <pre>{config?.embedCode || `<script>window.FLYCHAT_CONFIG={storeId:"YOUR_STORE_ID"};</script>\n<script src="https://your-domain.com/widget.js"></script>`}</pre>
                  <button onClick={handleCopy} className="absolute top-3 right-3 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white" />}
                  </button>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-foreground">Installation Instructions</h3>
                {[
                  { n: 1, t: "Copy the embed code", d: "Click the copy button above to copy your unique embed snippet." },
                  { n: 2, t: "Open your website's HTML", d: "Access your website's HTML editor, CMS, or theme settings." },
                  { n: 3, t: "Paste before </body>", d: "Paste the code just before the closing </body> tag on every page." },
                  { n: 4, t: "Save and test", d: "Save your changes and visit your site — the chat bubble should appear." },
                ].map(step => (
                  <div key={step.n} className="flex gap-4">
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">{step.n}</div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{step.t}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{step.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
