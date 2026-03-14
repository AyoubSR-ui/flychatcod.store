import { AppLayout } from "@/components/AppLayout";
import { Link } from "wouter";
import { Search, Filter, MoreHorizontal, Eye } from "lucide-react";
import { useGetOrders } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";

export default function Orders() {
  const { data: ordersData, isLoading } = useGetOrders({ limit: 50 });
  const { t } = useI18n();

  const getStatusColor = (status: string) => {
    switch(status) {
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
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Orders</h1>
              <p className="text-muted-foreground mt-1">Manage and confirm your Cash on Delivery orders.</p>
            </div>
            <button className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm">
              Create Order
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
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">No orders found.</td></tr>
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
                      <td className="px-6 py-4 font-bold text-foreground">DZD {order.total}</td>
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
