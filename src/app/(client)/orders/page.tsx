import { unauthorized } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listClientOrders } from "@/lib/orders/client-orders.service";
import { OrdersList } from "./orders-list";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();
  const { orders } = await listClientOrders(user.id, { take: 50 });

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-10 md:py-16">
        <h1 className="mb-8 font-display text-3xl md:text-4xl">My Orders</h1>
        <OrdersList initialOrders={orders} />
      </main>
    </div>
  );
}
