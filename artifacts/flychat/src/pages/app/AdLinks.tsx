import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Plus, Trash2, Link, Package, AlertCircle, CheckCircle2, X } from "lucide-react";
import { useGetProducts } from "@workspace/api-client-react";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

export default function AdLinks() {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [adRef, setAdRef] = useState("");
  const [adName, setAdName] = useState("");
  const [productId, setProductId] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: productsData } = useGetProducts({ limit: 100 });

  const fetchLinks = async () => {
    const token = localStorage.getItem("flychat_token") || "";
    try {
      const res = await fetch(`${API_BASE}/api/ad-links`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setLinks(data.links || []);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLinks(); }, []);

  const handleCreate = async () => {
    if (!adRef.trim() || !productId) { setErrorMsg("Ad ref and product are required."); return; }
    setSaving(true); setErrorMsg("");
    try {
      const token = localStorage.getItem("flychat_token") || "";
      const res = await fetch(`${API_BASE}/api/ad-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ adRef: adRef.trim(), productId, adName: adName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create link");
      setSuccessMsg("Ad link created successfully!");
      setShowModal(false); setAdRef(""); setAdName(""); setProductId("");
      fetchLinks();
    } catch (err: any) { setErrorMsg(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this ad link?")) return;
    const token = localStorage.getItem("flychat_token") || "";
    await fetch(`${API_BASE}/api/ad-links/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchLinks();
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
                <Link className="w-7 h-7 text-primary" /> Ad Product Links
              </h1>
              <p className="text-muted-foreground mt-1">Link your Facebook/Instagram ads to specific products so AI knows which product to focus on.</p>
            </div>
            <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Link
            </button>
          </div>

          {/* How it works */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-blue-800 text-sm">
            <p className="font-bold mb-2">How it works:</p>
            <ol className="space-y-1 text-xs list-decimal list-inside">
              <li>Create a link below — set an <strong>Ad Ref</strong> (e.g. <code>jalabiya_blue</code>) and select the matching product</li>
              <li>In Meta Ads Manager → your ad → URL Parameters → add: <code>ref=jalabiya_blue</code></li>
              <li>When a customer clicks your ad and messages you, FlyChat detects the ref automatically</li>
              <li>AI focuses on that specific product and starts the order flow immediately</li>
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
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : links.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center mx-auto mb-3">
                  <Link className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground mb-1">No ad links yet</p>
                <p className="text-sm text-muted-foreground">Create your first link to start routing ad traffic to specific products.</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4 font-medium">Ad Name</th>
                    <th className="px-6 py-4 font-medium">Ad Ref (URL parameter)</th>
                    <th className="px-6 py-4 font-medium">Linked Product</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
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
              <h3 className="text-lg font-bold">Add Ad Product Link</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-secondary rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Ad Name (optional)</label>
                <input value={adName} onChange={e => setAdName(e.target.value)} placeholder="e.g. Jalabiya Blue Summer Campaign"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                <p className="text-xs text-muted-foreground mt-1">Just for your reference.</p>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Ad Ref *</label>
                <input value={adRef} onChange={e => setAdRef(e.target.value)} placeholder="e.g. jalabiya_blue"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background font-mono" />
                <p className="text-xs text-muted-foreground mt-1">This must match the <code>ref=</code> value in your Meta ad URL parameters. Use lowercase, no spaces.</p>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Linked Product *</label>
            <select value={productId} onChange={e => setProductId(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
              <option value="">Select a product...</option>
              {productsData?.products.map((p: any) => {
                const variants = (p.variants || []) as string[];
                const colors = variants
                  .filter((v: string) => v.toLowerCase().startsWith("color:"))
                  .map((v: string) => v.split(":").slice(1).join(":").trim());
                const sizes = variants
                  .filter((v: string) => v.toLowerCase().startsWith("size:"))
                  .map((v: string) => v.split(":").slice(1).join(":").trim());
                const otherVariants = variants.filter((v: string) =>
                  !v.toLowerCase().startsWith("color:") && !v.toLowerCase().startsWith("size:")
                );

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
                      {p.name} (All variants) — DZD {Number(p.price).toLocaleString()}
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
                      {p.name} (All sizes) — DZD {Number(p.price).toLocaleString()}
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
                    {p.name} (All variants) — DZD {Number(p.price).toLocaleString()}
                  </option>,
                  ...colors.flatMap((color: string) => [
                    <option key={`${p.id}|Color: ${color}`} value={`${p.id}|Color: ${color}`}
                      style={{ fontWeight: "600" }}>
                      &nbsp;&nbsp;↳ {p.name} — {color} (all sizes)
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
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !adRef.trim() || !productId}
                className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Saving..." : "Create Link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}