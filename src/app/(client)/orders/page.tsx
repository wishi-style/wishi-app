import { unauthorized } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listClientOrders, RETURN_WINDOW_DAYS } from "@/lib/orders/client-orders.service";
import { OrdersList } from "./orders-list";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();
  const { orders } = await listClientOrders(user.id, { take: 50 });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 md:px-10 py-12 md:py-16">
        <header className="mb-8">
          <h1 className="font-display text-3xl md:text-4xl">Your orders</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Direct-sale items you bought through Wishi. Returns are accepted within{" "}
            {RETURN_WINDOW_DAYS} days of arrival. Affiliate purchases live in your
            Closet — only direct-sale orders can be returned through this page.
          </p>
        </header>
        <OrdersList initialOrders={orders} />
      </div>
    </div>
  );
}
