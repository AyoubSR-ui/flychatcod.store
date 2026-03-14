import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Link } from "wouter";
import { Search, Filter, Eye, X, Plus, Trash2, Loader2, Package } from "lucide-react";
import { useGetOrders, useCreateOrder, getGetOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";

const WILAYAS = [
  "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar",
  "Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger",
  "Djelfa","Jijel","Sétif","Saïda","Skikda","Sidi Bel Abbès","Annaba","Guelma",
  "Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla","Oran","El Bayadh",
  "Illizi","Bordj Bou Arréridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued",
  "Khenchela","Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent",
  "Ghardaïa","Relizane","Timimoun","Bordj Badji Mokhtar","Ouled Djellal","Béni Abbès",
  "In Salah","In Guezzam","Touggourt","Djanet","El M'Ghair","El Méniaa",
];

interface OrderItem {
  productName: string;
  variant: string;
  quantity: number;
  price: number;
}

const defaultItem = (): OrderItem => ({ productName: "", variant: "", quantity: 1, price: 0 });

function CreateOrderModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const createMutation = useCreateOrder();

  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    wilaya: "",
    address: "",
    sellerNote: "",
  });
  const [items, setItems] = useState<OrderItem[]>([defaultItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const updateItem = (idx: number, field: keyof OrderItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems(prev => [...prev, defaultItem()]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.customerName.trim()) errs.customerName = "Customer name is required";
    if (!form.customerPhone.trim()) errs.customerPhone = "Phone number is required";
    if (!form.wilaya) errs.wilaya = "Wilaya is required";
    if (items.length === 0) errs.items = "At least one item is required";
    items.forEach((item, idx) => {
      if (!item.productName.trim()) errs[`item_${idx}_name`] = "Product name required";
      if (item.price <= 0) errs[`item_${idx}_price`] = "Price must be > 0";
      if (item.quantity < 1) errs[`item_${idx}_qty`] = "Quantity must be at least 1";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createMutation.mutate(
      {
        data: {
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          customerEmail: form.customerEmail || undefined,
          wilaya: form.wilaya,
          address: form.address || undefined,
          sellerNote: form.sellerNote || undefined,
          items: items.map(i => ({
            productName: i.productName,
            variant: i.variant || undefined,
            quantity: i.quantity,
            price: i.price,
          })),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
          onClose();
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Create New Order</h2>
              <p className="text-xs text-muted-foreground">Cash on Delivery</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Customer Info */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Customer Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name <span className="text-red-500">*</span></label>
                <input
                  value={form.customerName}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 ${errors.customerName ? "border-red-400" : "border-border"}`}
                  placeholder="Ahmed Benali"
                />
                {errors.customerName && <p className="text-red-500 text-xs mt-1">{errors.customerName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone <span className="text-red-500">*</span></label>
                <input
                  value={form.customerPhone}
                  onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                  className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 ${errors.customerPhone ? "border-red-400" : "border-border"}`}
                  placeholder="0550 123 456"
                />
                {errors.customerPhone && <p className="text-red-500 text-xs mt-1">{errors.customerPhone}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Email <span className="text-muted-foreground text-xs font-normal">(optional)</span></label>
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Wilaya <span className="text-red-500">*</span></label>
                <select
                  value={form.wilaya}
                  onChange={e => setForm(f => ({ ...f, wilaya: e.target.value }))}
                  className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white ${errors.wilaya ? "border-red-400" : "border-border"}`}
                >
                  <option value="">Select wilaya...</option>
                  {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                {errors.wilaya && <p className="text-red-500 text-xs mt-1">{errors.wilaya}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Address / Commune</label>
                <input
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Rue, commune..."
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Seller Note</label>
              <textarea
                value={form.sellerNote}
                onChange={e => setForm(f => ({ ...f, sellerNote: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                placeholder="Internal note about this order..."
              />
            </div>
          </div>

          {/* Order Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Order Items</h3>
              <button
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-primary font-semibold hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>

            {errors.items && <p className="text-red-500 text-xs mb-2">{errors.items}</p>}

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="bg-secondary/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">Item {idx + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input
                        value={item.productName}
                        onChange={e => updateItem(idx, "productName", e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white ${errors[`item_${idx}_name`] ? "border-red-400" : "border-border"}`}
                        placeholder="Product name *"
                      />
                      {errors[`item_${idx}_name`] && <p className="text-red-500 text-xs mt-1">{errors[`item_${idx}_name`]}</p>}
                    </div>
                    <input
                      value={item.variant}
                      onChange={e => updateItem(idx, "variant", e.target.value)}
                      className="px-3 py-2 rounded-xl border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                      placeholder="Variant (color, size...)"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => updateItem(idx, "quantity", Number(e.target.value))}
                        className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white ${errors[`item_${idx}_qty`] ? "border-red-400" : "border-border"}`}
                        placeholder="Qty"
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.price || ""}
                        onChange={e => updateItem(idx, "price", Number(e.target.value))}
                        className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-white ${errors[`item_${idx}_price`] ? "border-red-400" : "border-border"}`}
                        placeholder="Price DZD"
                      />
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    Subtotal: <span className="font-bold text-foreground">DZD {(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="mt-4 flex justify-between items-center bg-primary/5 border border-primary/20 rounded-xl px-5 py-3">
              <span className="font-bold text-foreground">Total (COD)</span>
              <span className="text-xl font-bold text-primary">DZD {total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border shrink-0 flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {createMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
              : "Create Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Orders() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: ordersData, isLoading } = useGetOrders({ limit: 50 });
  const { t } = useI18n();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'awaiting_confirmation': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'confirmed': return 'bg-green-100 text-green-800 border-green-200';
      case 'shipped': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'delivered': return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <AppLayout>
      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} />}

      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Orders</h1>
              <p className="text-muted-foreground mt-1">Manage and confirm your Cash on Delivery orders.</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Order
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm flex flex-col">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search order #, customer, phone..."
                    className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <button className="px-4 py-2.5 border border-border rounded-xl flex items-center gap-2 text-sm font-medium hover:bg-secondary">
                  <Filter className="w-4 h-4" /> Filter
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4 font-medium">Order #</th>
                    <th className="px-6 py-4 font-medium">Customer</th>
                    <th className="px-6 py-4 font-medium">Location</th>
                    <th className="px-6 py-4 font-medium">Total</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr><td colSpan={7} className="px-6 py-8 text-center">{t("common.loading")}</td></tr>
                  ) : ordersData?.orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center">
                            <Package className="w-7 h-7" />
                          </div>
                          <p className="font-medium">No orders yet</p>
                          <button onClick={() => setShowCreate(true)} className="text-primary text-sm font-semibold hover:underline">
                            Create your first order →
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : ordersData?.orders.map((order) => (
                    <tr key={order.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4 font-bold text-foreground">
                        <Link href={`/orders/${order.id}`} className="hover:text-primary hover:underline">{order.orderNumber}</Link>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{order.customerName}</div>
                        <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{order.wilaya}</td>
                      <td className="px-6 py-4 font-bold text-foreground">DZD {Number(order.total).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex border items-center px-2.5 py-1 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                          {t(`status.${order.status}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{format(new Date(order.createdAt), 'MMM dd, yyyy')}</td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/orders/${order.id}`} className="inline-flex p-2 text-muted-foreground hover:text-primary bg-secondary hover:bg-primary/10 rounded-lg transition-colors">
                          <Eye className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-border flex justify-between items-center text-sm text-muted-foreground">
              <span>Showing {ordersData?.orders.length || 0} orders</span>
              <div className="flex gap-2">
                <button className="px-3 py-1 border border-border rounded hover:bg-secondary disabled:opacity-50">Prev</button>
                <button className="px-3 py-1 border border-border rounded hover:bg-secondary disabled:opacity-50">Next</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
