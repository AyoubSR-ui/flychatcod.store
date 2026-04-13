import { AppLayout } from "@/components/AppLayout";
import { Plus, Search, Pencil, Trash2, ToggleLeft, ToggleRight, X, Upload, Link, Package } from "lucide-react";
import { useState, useRef } from "react";
import { useGetProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";

const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

// Preset colors for color variants
const PRESET_COLORS = [
  { name: "Noir", hex: "#000000" }, { name: "Blanc", hex: "#FFFFFF" },
  { name: "Rouge", hex: "#EF4444" }, { name: "Bleu", hex: "#3B82F6" },
  { name: "Vert", hex: "#22C55E" }, { name: "Jaune", hex: "#EAB308" },
  { name: "Rose", hex: "#EC4899" }, { name: "Violet", hex: "#A855F7" },
  { name: "Orange", hex: "#F97316" }, { name: "Gris", hex: "#6B7280" },
  { name: "Marron", hex: "#92400E" }, { name: "Beige", hex: "#D4B896" },
  { name: "Bleu Marine", hex: "#1E3A5F" }, { name: "Or", hex: "#D4AF37" },
  { name: "Argent", hex: "#C0C0C0" }, { name: "Camel", hex: "#C19A6B" },
];

interface VariantGroup { label: string; values: string; type: "text" | "color" }
interface ProductForm {
  name: string; description: string; price: string; stock: string;
  isActive: boolean; imageUrl: string; extraImages: string[];
  variantGroups: VariantGroup[];
}

const empty: ProductForm = {
  name: "", description: "", price: "", stock: "",
  isActive: true, imageUrl: "", extraImages: [],
  variantGroups: [{ label: "Color", values: "", type: "color" }, { label: "Size", values: "", type: "text" }],
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
  if (Object.keys(map).length === 0) return [{ label: "Color", values: "", type: "color" }, { label: "Size", values: "", type: "text" }];
  return Object.entries(map).map(([label, vals]) => ({
    label, values: vals.join(", "),
    type: label.toLowerCase().includes("color") || label.toLowerCase().includes("couleur") ? "color" : "text" as "text" | "color"
  }));
}

// Upload image to Cloudinary via our backend
async function uploadImage(file: File): Promise<string | null> {
  try {
    const token = localStorage.getItem("flychat_token") || "";
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/storage/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) return null;
    const { url } = await res.json();
    return url || null;
  } catch (err) {
    console.error("Upload failed:", err);
    return null;
  }
}
export default function Products() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ProductForm>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageTab, setImageTab] = useState<"url" | "upload">("url");
  const [groupColorHex, setGroupColorHex] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, refetch } = useGetProducts({ search: search || undefined, limit: 50 });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { t } = useI18n();

  const openCreate = () => { setForm(empty); setEditId(null); setNewImageUrl(""); setImageTab("url"); setShowModal(true); };

  const openEdit = (p: any) => {
   const allImages: string[] = p.imageUrls?.length ? p.imageUrls : (p.imageUrl ? [p.imageUrl] : []);
  const primary = allImages[0] || "";
  const extras = allImages.slice(1);
  setForm({
    name: p.name || "",
    description: p.description || "",
    price: p.price?.toString() || "",
    stock: p.stock?.toString() || "",
    isActive: p.isActive ?? true,
    imageUrl: primary,
    extraImages: extras,
    variantGroups: parseVariantGroups(p.variants || []),
  });
    setEditId(p.id); setNewImageUrl(""); setImageTab("url"); setShowModal(true);
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
    imageUrls: allImages,
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

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    const url = await uploadImage(file);
    if (url) {
      if (!form.imageUrl) setForm(f => ({ ...f, imageUrl: url }));
      else setForm(f => ({ ...f, extraImages: [...f.extraImages, url] }));
    }
    setUploading(false);
  };

  const addVariantGroup = () => setForm(f => ({ ...f, variantGroups: [...f.variantGroups, { label: "", values: "", type: "text" }] }));
  const removeVariantGroup = (i: number) => setForm(f => ({ ...f, variantGroups: f.variantGroups.filter((_, idx) => idx !== i) }));
  const updateVariantGroup = (i: number, field: keyof VariantGroup, val: string) => {
    setForm(f => ({ ...f, variantGroups: f.variantGroups.map((g, idx) => idx === i ? { ...g, [field]: val } : g) }));
  };
  const addColorToGroup = (i: number, colorName: string) => {
    const g = form.variantGroups[i];
    const existing = g.values.split(",").map(v => v.trim()).filter(Boolean);
    if (!existing.includes(colorName)) {
      updateVariantGroup(i, "values", [...existing, colorName].join(", "));
    }
  };

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
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No products yet. Add your first product.</td></tr>
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
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">{p.name}</span>
                                {!p.isActive && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">AI Off</span>}
                              </div>
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
                                {colorVariants.slice(0, 5).map((v: string) => {
                                  const preset = PRESET_COLORS.find(c => c.name.toLowerCase() === v.toLowerCase());
                                  const isHex = /^#[0-9A-Fa-f]{6}$/.test(v);
                                  return (preset || isHex) ? (
                                    <span key={v} title={v} className="w-4 h-4 rounded-full border border-border inline-block" style={{ backgroundColor: isHex ? v : preset?.hex }} />
                                  ) : (
                                    <span key={v} className="px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs">{v}</span>
                                  );
                                })}
                                {colorVariants.length > 5 && <span className="text-xs text-muted-foreground">+{colorVariants.length - 5}</span>}
                              </div>
                            )}
                            {sizeVariants.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {sizeVariants.slice(0, 4).map((v: string) => (
                                  <span key={v} className="px-1.5 py-0.5 bg-purple-50 border border-purple-200 text-purple-700 rounded text-xs">{v}</span>
                                ))}
                                {sizeVariants.length > 4 && <span className="text-xs text-muted-foreground">+{sizeVariants.length - 4}</span>}
                              </div>
                            )}
                            {otherVariants.slice(0, 3).map((v: string) => (
                              <span key={v} className="px-1.5 py-0.5 bg-secondary rounded text-xs w-fit">{v}</span>
                            ))}
                            {!colorVariants.length && !sizeVariants.length && !otherVariants.length && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1 items-start">
                            <button onClick={() => handleToggle(p)} className="text-muted-foreground hover:text-primary transition-colors">
                              {p.isActive ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6" />}
                            </button>
                            <span className="text-xs text-muted-foreground">{p.isActive ? "AI uses" : "AI skips"}</span>
                          </div>
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
              {/* Name */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Product Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. جلابية السلطانة"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background resize-none" />
              </div>

              {/* Price & Stock */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Price (DZD) *</label>
                  <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Stock</label>
                  <input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })}
                    placeholder="Empty = unlimited"
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
              </div>

              {/* Media */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block">Product Images</label>

               {/* Tab switch */}
                    <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg border border-border w-fit mb-3">
                      <button onClick={() => setImageTab("url")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${imageTab === "url" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                        <Link className="w-3 h-3" /> URL
                      </button>
                      <button onClick={() => setImageTab("upload")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${imageTab === "upload" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                        <Upload className="w-3 h-3" /> Upload
                      </button>
                    </div>

                {imageTab === "url" ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                        placeholder="Direct image URL ending in .jpg, .png, .webp..."
                        className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                      <p className="text-xs text-muted-foreground mt-1">⚠️ Must be a direct image URL (ending in .jpg, .png, .webp). Product page URLs won't work.</p>
                      {form.imageUrl && <img src={form.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" onError={e => (e.currentTarget.style.display = "none")} />}
                    </div>
                    {form.extraImages.map((url, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <img src={url} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" onError={e => (e.currentTarget.style.display = "none")} />
                        <span className="flex-1 text-xs text-muted-foreground truncate border border-border rounded-xl px-3 py-2 bg-secondary/30">{url}</span>
                        <button onClick={() => setForm(f => ({ ...f, extraImages: f.extraImages.filter((_, idx) => idx !== i) }))} className="p-1.5 hover:bg-red-50 rounded-lg">
                          <X className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && newImageUrl.trim()) { setForm(f => ({ ...f, extraImages: [...f.extraImages, newImageUrl.trim()] })); setNewImageUrl(""); }}}
                        placeholder="Add another image URL..."
                        className="flex-1 border border-border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                      <button onClick={() => { if (newImageUrl.trim()) { setForm(f => ({ ...f, extraImages: [...f.extraImages, newImageUrl.trim()] })); setNewImageUrl(""); }}}
                        disabled={!newImageUrl.trim()}
                        className="px-3 py-2 bg-secondary border border-border rounded-xl text-xs font-bold hover:bg-secondary/80 disabled:opacity-40">
                        + Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                      onChange={async e => {
                        const files = Array.from(e.target.files || []);
                        for (const file of files) await handleFileUpload(file);
                        e.target.value = "";
                      }} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                      className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-50 cursor-pointer">
                      {uploading ? (
                        <div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full" />
                      ) : (
                        <Upload className="w-8 h-8 text-muted-foreground" />
                      )}
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">{uploading ? "Uploading..." : "Click to upload images"}</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP — multiple files supported</p>
                      </div>
                    </button>

                    {/* Show uploaded images */}
                    {(form.imageUrl || form.extraImages.length > 0) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[form.imageUrl, ...form.extraImages].filter(Boolean).map((url, i) => (
                          <div key={i} className="relative group">
                            <img src={url} alt="" className="w-16 h-16 rounded-xl object-cover border border-border" />
                            {i === 0 && <span className="absolute -top-1 -left-1 bg-primary text-white text-[9px] px-1 rounded font-bold">Main</span>}
                            <button onClick={() => {
                              if (i === 0) setForm(f => ({ ...f, imageUrl: f.extraImages[0] || "", extraImages: f.extraImages.slice(1) }));
                              else setForm(f => ({ ...f, extraImages: f.extraImages.filter((_, idx) => idx !== i - 1) }));
                            }} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full hidden group-hover:flex items-center justify-center text-[10px]">×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Variants */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Variants</label>
                  <button onClick={addVariantGroup} className="text-xs text-primary font-bold hover:bg-primary/10 px-2 py-1 rounded-lg">+ Add Group</button>
                </div>
                <div className="space-y-3">
                  {form.variantGroups.map((g, i) => (
                    <div key={i} className="border border-border rounded-xl p-4 space-y-3">
                      <div className="flex gap-2 items-center">
                        <input value={g.label} onChange={e => updateVariantGroup(i, "label", e.target.value)}
                          placeholder="Group name (Color, Size...)"
                          className="w-28 shrink-0 border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background font-medium" />
                        <select value={g.type} onChange={e => updateVariantGroup(i, "type", e.target.value as "text" | "color")}
                          className="border border-border rounded-xl px-3 py-2 text-xs outline-none bg-background">
                          <option value="text">Text</option>
                          <option value="color">Color</option>
                        </select>
                        <button onClick={() => removeVariantGroup(i)} className="p-1.5 hover:bg-red-50 rounded-lg ml-auto shrink-0">
                          <X className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>

                      {g.type === "color" ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            {PRESET_COLORS.map(c => {
                              const selected = g.values.split(",").map(v => v.trim()).includes(c.name);
                              return (
                                <button key={c.name} title={c.name} onClick={() => addColorToGroup(i, c.name)}
                                  className={`w-6 h-6 rounded-full border-2 transition-all ${selected ? "border-primary scale-110 shadow-md" : "border-transparent hover:border-gray-300"}`}
                                  style={{ backgroundColor: c.hex }}>
                                  {c.hex === "#FFFFFF" && <span className="block w-full h-full rounded-full border border-gray-200" />}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={groupColorHex[i] ?? "#000000"}
                              onChange={e => setGroupColorHex(prev => ({ ...prev, [i]: e.target.value }))}
                              className="w-8 h-8 rounded-full cursor-pointer border border-border p-0.5"
                              title="Pick custom color"
                            />
                            <div className="w-6 h-6 rounded-full border border-border shrink-0" style={{ backgroundColor: groupColorHex[i] ?? "#000000" }} />
                            <span className="text-xs text-muted-foreground">Custom hex:</span>
                            <button
                              onClick={() => {
                                const hex = groupColorHex[i] ?? "#000000";
                                const existing = g.values.split(",").map(v => v.trim()).filter(Boolean);
                                if (!existing.includes(hex)) {
                                  updateVariantGroup(i, "values", [...existing, hex].join(", "));
                                }
                              }}
                              className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-lg font-medium hover:bg-primary/20"
                            >
                              + Add
                            </button>
                          </div>
                          <input value={g.values} onChange={e => updateVariantGroup(i, "values", e.target.value)}
                            placeholder="Or type: Rouge, Bleu, #FF0000"
                            className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                          {g.values && (
                            <div className="flex flex-wrap gap-1">
                              {g.values.split(",").map(v => v.trim()).filter(Boolean).map((v, vi) => {
                                const preset = PRESET_COLORS.find(c => c.name.toLowerCase() === v.toLowerCase());
                                const isHex = /^#[0-9A-Fa-f]{6}$/.test(v);
                                return (
                                  <span key={vi} className="flex items-center gap-1 px-2 py-0.5 bg-secondary border border-border rounded text-xs font-medium">
                                    {(preset || isHex) && <span className="w-3 h-3 rounded-full inline-block border border-gray-200" style={{ backgroundColor: isHex ? v : preset?.hex }} />}
                                    {v}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <input value={g.values} onChange={e => updateVariantGroup(i, "values", e.target.value)}
                          placeholder="Values separated by commas (L, XL, XXL)"
                          className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Variant preview */}
                {flattenVariants(form.variantGroups).length > 0 && (
                  <div className="mt-2 p-3 bg-secondary/30 rounded-xl">
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Preview:</p>
                    <div className="flex flex-wrap gap-1">
                      {flattenVariants(form.variantGroups).slice(0, 12).map((v, i) => (
                        <span key={i} className="px-2 py-0.5 bg-background border border-border rounded text-xs font-medium">{v}</span>
                      ))}
                      {flattenVariants(form.variantGroups).length > 12 && (
                        <span className="text-xs text-muted-foreground">+{flattenVariants(form.variantGroups).length - 12} more</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Active toggle */}
              <div className="flex items-start gap-3 p-4 bg-secondary/30 rounded-xl border border-border">
                <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 accent-primary mt-0.5" />
                <div>
                  <label htmlFor="isActive" className="text-sm font-semibold cursor-pointer">Active — AI will suggest this product</label>
                  <p className="text-xs text-muted-foreground mt-0.5">When unchecked, AI will not mention or offer this product to customers.</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border shrink-0 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">{t("common.cancel")}</button>
              <button onClick={handleSubmit} disabled={!form.name || !form.price}
                className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                {editId ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}