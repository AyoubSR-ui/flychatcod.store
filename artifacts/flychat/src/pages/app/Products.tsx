import { AppLayout } from "@/components/AppLayout";
import { Plus, Search, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import { useGetProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";

interface ProductForm { name: string; description: string; price: string; stock: string; variants: string; isActive: boolean; imageUrl: string; }
const empty: ProductForm = { name: "", description: "", price: "", stock: "", variants: "", isActive: true, imageUrl: "" };

export default function Products() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ProductForm>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useGetProducts({ search: search || undefined, limit: 50 });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { t } = useI18n();

  const openCreate = () => { setForm(empty); setEditId(null); setShowModal(true); };
  const openEdit = (p: any) => {
    setForm({ name: p.name, description: p.description || "", price: String(p.price), stock: p.stock != null ? String(p.stock) : "", variants: (p.variants || []).join(", "), isActive: p.isActive, imageUrl: p.imageUrl || "" });
    setEditId(p.id); setShowModal(true);
  };

  const handleSubmit = async () => {
    const payload = {
      name: form.name, description: form.description || undefined,
      price: parseFloat(form.price), stock: form.stock ? parseInt(form.stock) : undefined,
      isActive: form.isActive, imageUrl: form.imageUrl || undefined,
      variants: form.variants ? form.variants.split(",").map(v => v.trim()).filter(Boolean) : [],
    };
    if (editId) { await updateProduct.mutateAsync({ id: editId, data: payload as any }); }
    else { await createProduct.mutateAsync({ data: payload as any }); }
    setShowModal(false); refetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await deleteProduct.mutateAsync({ id });
    refetch();
  };

  const handleToggle = async (p: any) => {
    await updateProduct.mutateAsync({ id: p.id, data: { isActive: !p.isActive } });
    refetch();
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
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No products yet. Add your first product to start selling.</td></tr>
                  ) : data?.products.map((p) => (
                    <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-foreground">{p.name}</div>
                        {p.description && <div className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">{p.description}</div>}
                      </td>
                      <td className="px-6 py-4 font-bold text-foreground">DZD {Number(p.price)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{p.stock != null ? p.stock : "∞"}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(p.variants || []).slice(0, 3).map((v: string) => (
                            <span key={v} className="px-2 py-0.5 bg-secondary rounded text-xs font-medium">{v}</span>
                          ))}
                          {(p.variants || []).length > 3 && <span className="text-xs text-muted-foreground">+{(p.variants || []).length - 3}</span>}
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold">{editId ? "Edit Product" : "Add New Product"}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-secondary rounded-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Product Name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Nike Air Max 2024" className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Description</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Price (DZD) *</label>
                  <input type="number" value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Stock</label>
                  <input type="number" value={form.stock} onChange={e => setForm({...form, stock: e.target.value})} placeholder="Leave empty = unlimited" className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Variants (comma separated)</label>
                <input value={form.variants} onChange={e => setForm({...form, variants: e.target.value})} placeholder="e.g. Red, Blue - Size 40, White - Size 42" className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})} className="w-4 h-4 accent-primary" />
                <label htmlFor="isActive" className="text-sm font-medium">Active (visible in order flow)</label>
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">{t("common.cancel")}</button>
              <button onClick={handleSubmit} disabled={!form.name || !form.price} className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                {editId ? t("common.save") : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
