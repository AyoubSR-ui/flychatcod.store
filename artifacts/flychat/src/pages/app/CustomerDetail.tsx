import { AppLayout } from "@/components/AppLayout";
import { Link, useParams } from "wouter";
import { ArrowLeft, Phone, Mail, MapPin, MessageSquare, ShoppingBag, StickyNote } from "lucide-react";
import { useGetCustomer } from "@workspace/api-client-react";
import { format } from "date-fns";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading } = useGetCustomer(id!);

  if (isLoading) return <AppLayout><div className="p-10 flex justify-center"><div className="w-8 h-8 animate-spin border-4 border-primary border-t-transparent rounded-full" /></div></AppLayout>;
  if (!customer) return <AppLayout><div className="p-10 text-center text-muted-foreground">Customer not found.</div></AppLayout>;

  const statusColors: Record<string, string> = {
    confirmed: "bg-green-100 text-green-800", new: "bg-blue-100 text-blue-800",
    shipped: "bg-purple-100 text-purple-800", delivered: "bg-teal-100 text-teal-800",
    cancelled: "bg-red-100 text-red-800", awaiting_confirmation: "bg-yellow-100 text-yellow-800",
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Link href="/customers" className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground">{customer.name}</h1>
              <p className="text-muted-foreground text-sm">Customer profile</p>
            </div>
            {customer.isRepeat && (
              <span className="ml-auto px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">Repeat Customer</span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Info Card */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-4 pb-4 border-b border-border">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center font-bold text-primary text-2xl">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-bold text-foreground text-lg">{customer.name}</h2>
                  <p className="text-sm text-muted-foreground">{customer.totalOrders} orders total</p>
                </div>
              </div>
              {customer.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span>{customer.email}</span>
                </div>
              )}
              {customer.wilaya && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span>{customer.wilaya}</span>
                </div>
              )}
              {customer.notes && (
                <div className="flex items-start gap-3 text-sm pt-2 border-t border-border">
                  <StickyNote className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <p className="text-muted-foreground">{customer.notes}</p>
                </div>
              )}
            </div>

            {/* Orders & Conversations */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-foreground">Orders ({(customer as any).orders?.length || 0})</h3>
                </div>
                <div className="divide-y divide-border/50">
                  {!(customer as any).orders?.length ? (
                    <p className="px-6 py-8 text-center text-muted-foreground text-sm">No orders yet</p>
                  ) : (customer as any).orders.map((order: any) => (
                    <div key={order.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <Link href={`/orders/${order.id}`} className="font-semibold text-foreground hover:text-primary">{order.orderNumber}</Link>
                        <p className="text-xs text-muted-foreground mt-0.5">DZD {order.total} · {format(new Date(order.createdAt), 'MMM dd, yyyy')}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusColors[order.status] || "bg-gray-100 text-gray-800"}`}>
                        {order.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl shadow-sm">
                <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-foreground">Conversations ({(customer as any).conversations?.length || 0})</h3>
                </div>
                <div className="divide-y divide-border/50">
                  {!(customer as any).conversations?.length ? (
                    <p className="px-6 py-8 text-center text-muted-foreground text-sm">No conversations yet</p>
                  ) : (customer as any).conversations.map((conv: any) => (
                    <div key={conv.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <Link href={`/inbox`} className="font-semibold text-foreground hover:text-primary text-sm">
                          {conv.lastMessage || "No messages"}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(conv.updatedAt), 'MMM dd, yyyy')}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        conv.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>{conv.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
