import { OrdersListPage } from "./Orders";

// Its own route (/orders/archived), not a flag on the All Orders list — see
// OrdersListPage's `archived` prop for why this is a one-line wrapper rather
// than a second copy of the whole filter/KPI/table implementation.
export default function OrdersArchived() {
  return <OrdersListPage archived={true} />;
}
