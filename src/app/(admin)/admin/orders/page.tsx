import { PageHeader } from "@/components/admin/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default function AdminOrdersPage() {
  return (
    <div>
      <PageHeader
        title="Orders"
        description="Customer-team workflow for direct sales, self-reported orders, and affiliate confirmations."
        actions={<Badge variant="outline">Coming in Phase 9</Badge>}
      />
      <Card>
        <CardHeader>
          <CardTitle>Order queue</CardTitle>
          <CardDescription>
            The list + status workflow ships alongside direct-sale Stripe
            Checkout in Phase 9. Route + admin auth are wired so the
            component can drop in without re-plumbing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex gap-2">
            <Select disabled>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Source: all" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DIRECT_SALE">Direct sale</SelectItem>
                <SelectItem value="SELF_REPORTED">Self-reported</SelectItem>
                <SelectItem value="AFFILIATE_CONFIRMED">Affiliate</SelectItem>
              </SelectContent>
            </Select>
            <Select disabled>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Status: all" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ORDERED">Ordered</SelectItem>
                <SelectItem value="SHIPPED">Shipped</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
                <SelectItem value="RETURNED">Returned</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center text-muted-foreground">
            Order list will populate once the Order model ships in Phase 9.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
