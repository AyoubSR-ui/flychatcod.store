import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Plus, Trash2, Link, Package, AlertCircle, CheckCircle2, X } from "lucide-react";
import { DocButton } from "@/components/DocButton";
import { useGetProducts } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";
import { authFetch } from "@/lib/auth-fetch";

export default function AdLinks() {
  const { t } = useI18n();
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [adRef, setAdRef] = useState("");
  const [adName, setAdName] = useState("");
  const [productId, setProductId] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: productsData } = useGetProducts({ limit: 100 });

  const fetchLinks = async () => {
    setLoading(true); setLoadError(false);
    try {
      const data = await authFetch<{ links?: any[] }>("/api/ad-links");
      setLinks(data.links || []);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLinks(); }, []);

  const handleCreate = async () => {
    if (!adRef.trim() || !productId) { setErrorMsg(t("adLinks.err.required")); return; }
    setSaving(true); setErrorMsg("");
    try {
      await authFetch("/api/ad-links", {
        method: "POST",
        body: JSON.stringify({ adRef: adRef.trim(), productId, adName: adName.trim() }),
      });
      setSuccessMsg(t("adLinks.success_created"));
      setShowModal(false); setAdRef(""); setAdName(""); setProductId("");
      fetchLinks();
    } catch (err: any) { setErrorMsg(err.message || "Failed to create link"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("adLinks.confirm_delete"))) return;
    try {
      await authFetch(`/api/ad-links/${id}`, { method: "DELETE" });
    } catch (err: any) {
      alert(err.message || t("common.load_failed"));
    }
    fetchLinks();
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
                  <Link className="w-7 h-7 text-primary" /> {t("adLinks.title")}
                </h1>
                <DocButton docId="ad-links" />
              </div>
              <p className="text-muted-foreground mt-1">{t("adLinks.subtitle")}</p>
            </div>
            <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> {t("adLinks.add_link")}
            </button>
          </div>

          {/* How it works */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-blue-800 text-sm">
            <p className="font-bold mb-2">{t("adLinks.how_it_works")}</p>
            <ol className="space-y-1 text-xs list-decimal list-inside">
              <li>{t("adLinks.how.step1_a")}<strong>{t("adLinks.how.step1_ad_ref")}</strong>{t("adLinks.how.step1_b")}<code>jalabiya_blue</code>{t("adLinks.how.step1_c")}</li>
              <li>{t("adLinks.how.step2_a")}<code>ref=jalabiya_blue</code></li>
              <li>{t("adLinks.how.step3")}</li>
              <li>{t("adLinks.how.step4")}</li>
            </ol>
          </div>

          {successMsg && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm">
              <CheckCircle2 className="w-4 h-4" /> {successMsg}
              <button onClick={() => setSuccessMsg("")} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Links table */}
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>
            ) : loadError ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-red-700 font-medium">{t("common.load_failed")}</p>
                <button onClick={fetchLinks} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">{t("common.retry")}</button>
              </div>
            ) : links.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center mx-auto mb-3">
                  <Link className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground mb-1">{t("adLinks.empty_title")}</p>
                <p className="text-sm text-muted-foreground">{t("adLinks.empty_desc")}</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4 font-medium">{t("adLinks.table.ad_name")}</th>
                    <th className="px-6 py-4 font-medium">{t("adLinks.table.ad_ref")}</th>
                    <th className="px-6 py-4 font-medium">{t("adLinks.table.linked_product")}</th>
                    <th className="px-6 py-4 font-medium text-right">{t("adLinks.table.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {links.map((link) => (
                    <tr key={link.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{link.ad_name || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-6 py-4">
                        <code className="px-2 py-1 bg-secondary rounded text-xs font-mono text-primary">{link.ad_ref}</code>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {link.product_image && <img src={link.product_image} alt="" className="w-8 h-8 rounded-lg object-cover border border-border" />}
                          <span className="font-medium">{link.product_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleDelete(link.id)} className="p-2 rounded-lg border border-border hover:bg-red-50 hover:border-red-200 transition-colors">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold">{t("adLinks.modal.title")}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-secondary rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("adLinks.modal.ad_name_label")}</label>
                <input value={adName} onChange={e => setAdName(e.target.value)} placeholder={t("adLinks.modal.ad_name_placeholder")}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                <p className="text-xs text-muted-foreground mt-1">{t("adLinks.modal.ad_name_hint")}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("adLinks.modal.ad_ref_label")}</label>
                <input value={adRef} onChange={e => setAdRef(e.target.value)} placeholder={t("adLinks.modal.ad_ref_placeholder")}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background font-mono" />
                <p className="text-xs text-muted-foreground mt-1">{t("adLinks.modal.ad_ref_hint_a")}<code>ref=</code>{t("adLinks.modal.ad_ref_hint_b")}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("adLinks.modal.product_label")}</label>
            <select value={productId} onChange={e => setProductId(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
              <option value="">{t("adLinks.modal.select_product")}</option>
              {productsData?.products.map((p: any) => {
                const variants = (p.variants || []) as string[];
                const sizes = variants
                    .filter((v: string) => v.toLowerCase().startsWith("size:"))
                    .map((v: string) => v.split(":").slice(1).join(":").trim());


                  // e.g. "Bleu: Bleu", "Color: Bleu", "Couleur: Rouge"
                  const colorVariants = variants.filter((v: string) => !v.toLowerCase().startsWith("size:"));
                  const colors = colorVariants.map((v: string) => {
                    // Extract the value part after the colon
                    const parts = v.split(":");
                    return parts.length > 1 ? parts.slice(1).join(":").trim() : v.trim();
                  }).filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i); // dedupe

                  const otherVariants: string[] = [];

                if (colors.length === 0 && sizes.length === 0) {
                  // No structured variants — show flat list
                  return [
                    <option key={p.id} value={p.id}>
                      {p.name} — DZD {Number(p.price).toLocaleString()}
                    </option>,
                    ...otherVariants.map((v: string) => (
                      <option key={`${p.id}|${v}`} value={`${p.id}|${v}`}>
                        &nbsp;&nbsp;↳ {p.name} — {v}
                      </option>
                    ))
                  ];
                }

                if (colors.length > 0 && sizes.length === 0) {
                  // Colors only — no sizes
                  return [
                    <option key={p.id} value={p.id}>
                      {p.name} {t("adLinks.opt.all_variants")} — DZD {Number(p.price).toLocaleString()}
                    </option>,
                    ...colors.map((color: string) => (
                      <option key={`${p.id}|Color: ${color}`} value={`${p.id}|Color: ${color}`}>
                        &nbsp;&nbsp;↳ {p.name} — {color}
                      </option>
                    ))
                  ];
                }

                if (colors.length === 0 && sizes.length > 0) {
                  // Sizes only
                  return [
                    <option key={p.id} value={p.id}>
                      {p.name} {t("adLinks.opt.all_sizes")} — DZD {Number(p.price).toLocaleString()}
                    </option>,
                    ...sizes.map((size: string) => (
                      <option key={`${p.id}|Size: ${size}`} value={`${p.id}|Size: ${size}`}>
                        &nbsp;&nbsp;↳ {p.name} — {size}
                      </option>
                    ))
                  ];
                }

                // Both colors and sizes — hierarchical: color → sizes
                return [
                  <option key={p.id} value={p.id}>
                    {p.name} {t("adLinks.opt.all_variants")} — DZD {Number(p.price).toLocaleString()}
                  </option>,
                  ...colors.flatMap((color: string) => [
                    <option key={`${p.id}|Color: ${color}`} value={`${p.id}|Color: ${color}`}
                      style={{ fontWeight: "600" }}>
                      &nbsp;&nbsp;↳ {p.name} — {color} {t("adLinks.opt.all_sizes_lower")}
                    </option>,
                    ...sizes.map((size: string) => (
                      <option key={`${p.id}|Color: ${color}|Size: ${size}`}
                        value={`${p.id}|Color: ${color}|Size: ${size}`}>
                        &nbsp;&nbsp;&nbsp;&nbsp;↳ {p.name} — {color} — {size}
                      </option>
                    ))
                  ])
                ];
              })}
            </select>
              </div>
              {errorMsg && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">{t("common.cancel")}</button>
              <button onClick={handleCreate} disabled={saving || !adRef.trim() || !productId}
                className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                {saving ? t("common.saving") : t("adLinks.create_link")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}