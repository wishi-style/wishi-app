import { PageHeader } from "@/components/admin/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadAdminMetrics } from "@/lib/admin/metrics";

export const dynamic = "force-dynamic";

function fmtCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function AdminDashboard() {
  const metrics = await loadAdminMetrics();

  const cards = [
    {
      label: "Active sessions",
      value: metrics.activeSessions.toLocaleString(),
      hint: "ACTIVE + PENDING_END + PENDING_END_APPROVAL",
    },
    {
      label: "MTD revenue",
      value: fmtCurrency(metrics.mtdRevenueCents),
      hint: "Succeeded payments this month",
    },
    {
      label: "Signups (7d)",
      value: metrics.signups7d.toLocaleString(),
      hint: `${metrics.signups30d} in 30d`,
    },
    {
      label: "New subs (30d)",
      value: metrics.newSubscriptions30d.toLocaleString(),
      hint: `${metrics.trialsOutstanding} trials outstanding`,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Platform metrics and activity."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wider">
                {card.label}
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {card.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
