import { AppLayout } from "@/components/AppLayout";
import { Plus, Search, Pencil, Trash2, ToggleLeft, ToggleRight, Image, X, Package } from "lucide-react";
import { useState } from "react";
import { useGetProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";

interface VariantGroup { label: string; values: string }
interface ProductForm {
  name: string;
  description: string;
  price: string;
  stock: string;
  isActive: boolean;
  imageUrl: string;
  extraImages: string[];
  variantGroups: VariantGroup[];
}

const empty: ProductForm = {
  name: "", description: "", price: "", stock: "",
  isActive: true, imageUrl: "", extraImages: [],
  variantGroups: [{ label: "Color", values: "" }, { label: "Size", values: "" }],
};

function flattenVariants(groups: VariantGroup[]): string[] {
  const result: string[] = [];
  groups.forEach(g => {
    if (!g.values.trim()) return;
    const vals = g.values.split(",").map(v => v.trim()).filter(Boolean);
    vals.forEach(v => result.push(`${g.label}: ${v}`));
  });
  return result;
}

function parseVariantGroups(variants: string[]): VariantGroup[] {
  const map: Record<string, string[]> = {};
  variants.forEach(v => {
    const colon = v.indexOf(":");
    if (colon > -1) {
      const label = v.slice(0, colon).trim();
      const val = v.slice(colon + 1).trim();
      if (!map[label]) map[label] = [];
      map[label].push(val);
    } else {
      if (!map["Variant"]) map["Variant"] = [];
      map["Variant"].push(v);
    }
  });
  if (Object.keys(map).length === 0) return [{ label: "Color", values: "" }, { label: "Size", values: "" }];
  return Object.entries(map).map(([label, vals]) => ({ label, values: vals.join(", ") }));
}

export default function Products() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ProductForm>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [newImageUrl, setNewImageUrl] = useState("");
  const { data, isLoading, refetch } = useGetProducts({ search: search || undefined, limit: 50 });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { t } = useI18n();

  const openCreate = () => { setForm(empty); setEditId(null); setNewImageUrl(""); setShowModal(true); };

  const openEdit = (p: any) => {
    const allImages: string[] = p.imageUrls || (p.imageUrl ? [p.imageUrl] : []);
    const primary = allImages[0] || "";
    const extras = allImages.slice(1);
    setForm({
      name: p.name, description: p.description || "",
      price: String(p.price), stock: p.stock != null ? String(p.stock) : "",
      isActive: p.isActive, imageUrl: primary, extraImages: extras,
      variantGroups: parseVariantGroups(p.variants || []),
    });
    setEditId(p.id); setNewImageUrl(""); setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.price) return;
    const allImages = [form.imageUrl, ...form.extraImages].filter(Boolean);
    const payload = {
      name: form.name,
      description: form.description || undefined,
      price: parseFloat(form.price),
      stock: form.stock ? parseInt(form.stock) : undefined,
      isActive: form.isActive,
      imageUrl: allImages[0] || undefined,
      variants: flattenVariants(form.variantGroups),
    };
    if (editId) await updateProduct.mutateAsync({ id: editId, data: payload as any });
    else await createProduct.mutateAsync({ data: payload as any });
    setShowModal(false); refetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await deleteProduct.mutateAsync({ id }); refetch();
  };

  const handleToggle = async (p: any) => {
    await updateProduct.mutateAsync({ id: p.id, data: { isActive: !p.isActive } }); refetch();
  };

  const addVariantGroup = () => setForm(f => ({ ...f, variantGroups: [...f.variantGroups, { label: "", values: "" }] }));
  const removeVariantGroup = (i: number) => setForm(f => ({ ...f, variantGroups: f.variantGroups.filter((_, idx) => idx !== i) }));
  const updateVariantGroup = (i: number, field: "label" | "values", val: string) => {
    setForm(f => ({ ...f, variantGroups: f.variantGroups.map((g, idx) => idx === i ? { ...g, [field]: val } : g) }));
  };

  const addExtraImage = () => {
    if (!newImageUrl.trim()) return;
    setForm(f => ({ ...f, extraImages: [...f.extraImages, newImageUrl.trim()] }));
    setNewImageUrl("");
  };

  const removeExtraImage = (i: number) => setForm(f => ({ ...f, extraImages: f.extraImages.filter((_, idx) => idx !== i) }));

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.products")}</h1>
              <p className="text-muted-foreground mt-1">Manage your product catalog for chat-to-order flows.</p>
            </div>
            <button onClick={openCreate} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm">
            <div className="p-4 border-b border-border">
              <div className="relative max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder={t("common.search")} value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4 font-medium">Product</th>
                    <th className="px-6 py-4 font-medium">Price</th>
                    <th className="px-6 py-4 font-medium">Stock</th>
                    <th className="px-6 py-4 font-medium">Variants</th>
                    <th className="px-6 py-4 font-medium">Active</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t("common.loading")}</td></tr>
                  ) : data?.products.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No products yet. Add your first product to start selling.</td></tr>
                  ) : data?.products.map((p) => {
                    const colorVariants = (p.variants || []).filter((v: string) => v.startsWith("Color:")).map((v: string) => v.replace("Color:", "").trim());
                    const sizeVariants = (p.variants || []).filter((v: string) => v.startsWith("Size:")).map((v: string) => v.replace("Size:", "").trim());
                    const otherVariants = (p.variants || []).filter((v: string) => !v.startsWith("Color:") && !v.startsWith("Size:"));
                    return (
                      <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-xl object-cover border border-border shrink-0" />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                                <Package className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-foreground">{p.name}</div>
                              {p.description && <div className="text-xs text-muted-foreground truncate max-w-[200px] mt-0.5">{p.description}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-bold text-foreground">DZD {Number(p.price).toLocaleString()}</td>
                        <td className="px-6 py-4 text-muted-foreground">{p.stock != null ? p.stock : "∞"}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            {colorVariants.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {colorVariants.slice(0, 4).map((v: string) => (
                                  <span key={v} className="px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs font-medium">{v}</span>
                                ))}
                                {colorVariants.length > 4 && <span className="text-xs text-muted-foreground">+{colorVariants.length - 4}</span>}
                              </div>
                            )}
                            {sizeVariants.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {sizeVariants.slice(0, 4).map((v: string) => (
                                  <span key={v} className="px-1.5 py-0.5 bg-purple-50 border border-purple-200 text-purple-700 rounded text-xs font-medium">{v}</span>
                                ))}
                                {sizeVariants.length > 4 && <span className="text-xs text-muted-foreground">+{sizeVariants.length - 4}</span>}
                              </div>
                            )}
                            {otherVariants.slice(0, 3).map((v: string) => (
                              <span key={v} className="px-1.5 py-0.5 bg-secondary rounded text-xs font-medium w-fit">{v}</span>
                            ))}
                            {!colorVariants.length && !sizeVariants.length && !otherVariants.length && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <button onClick={() => handleToggle(p)} className="text-muted-foreground hover:text-primary transition-colors">
                            {p.isActive ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6" />}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => openEdit(p)} className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors">
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg border border-border hover:bg-red-50 hover:border-red-200 transition-colors">
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-border flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold">{editId ? "Edit Product" : "Add New Product"}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-secondary rounded-lg"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">

              {/* Basic Info */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Product Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. جلابية السلطانة" className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Price (DZD) *</label>
                  <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Stock</label>
                  <input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} placeholder="Empty = unlimited" className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
              </div>

              {/* Media */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5" /> Media (Image URLs)
                </label>

                {/* Primary image */}
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                      placeholder="Primary image URL (https://...)"
                      className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                    {form.imageUrl && <img src={form.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" onError={e => (e.currentTarget.style.display = "none")} />}
                  </div>

                  {/* Extra images */}
                  {form.extraImages.map((url, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <img src={url} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" onError={e => (e.currentTarget.style.display = "none")} />
                      <span className="flex-1 text-xs text-muted-foreground truncate border border-border rounded-xl px-3 py-2 bg-secondary/30">{url}</span>
                      <button onClick={() => removeExtraImage(i)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"><X className="w-3.5 h-3.5 text-red-500" /></button>
                    </div>
                  ))}

                  {/* Add image */}
                  <div className="flex gap-2">
                    <input value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addExtraImage()}
                      placeholder="Add another image URL..."
                      className="flex-1 border border-border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                    <button onClick={addExtraImage} disabled={!newImageUrl.trim()}
                      className="px-3 py-2 bg-secondary border border-border rounded-xl text-xs font-bold hover:bg-secondary/80 disabled:opacity-40 transition-colors">
                      + Add
                    </button>
                  </div>
                </div>

                {form.extraImages.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">AI will send the primary image when customers ask about this product.</p>
                )}
              </div>

              {/* Variants */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Variants</label>
                  <button onClick={addVariantGroup} className="text-xs text-primary font-bold hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors">+ Add Group</button>
                </div>
                <div className="space-y-2">
                  {form.variantGroups.map((g, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={g.label} onChange={e => updateVariantGroup(i, "label", e.target.value)}
                        placeholder="Group name (Color, Size...)"
                        className="w-28 shrink-0 border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background font-medium" />
                      <input value={g.values} onChange={e => updateVariantGroup(i, "values", e.target.value)}
                        placeholder="Values separated by commas (Red, Blue, Green)"
                        className="flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                      <button onClick={() => removeVariantGroup(i)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                        <X className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Preview */}
                {flattenVariants(form.variantGroups).length > 0 && (
                  <div className="mt-2 p-3 bg-secondary/30 rounded-xl">
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Preview:</p>
                    <div className="flex flex-wrap gap-1">
                      {flattenVariants(form.variantGroups).slice(0, 10).map((v, i) => (
                        <span key={i} className="px-2 py-0.5 bg-background border border-border rounded text-xs font-medium">{v}</span>
                      ))}
                      {flattenVariants(form.variantGroups).length > 10 && (
                        <span className="text-xs text-muted-foreground">+{flattenVariants(form.variantGroups).length - 10} more</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Active */}
              <div className="flex items-center gap-3">
                <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 accent-primary" />
                <label htmlFor="isActive" className="text-sm font-medium">Active (visible in order flow)</label>
              </div>
            </div>

            <div className="p-6 border-t border-border shrink-0 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">{t("common.cancel")}</button>
              <button onClick={handleSubmit} disabled={!form.name || !form.price} className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                {editId ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}