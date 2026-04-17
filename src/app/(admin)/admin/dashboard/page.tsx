import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminDashboard() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Platform metrics and activity."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active sessions", hint: "Live view coming in metrics build-out" },
          { label: "MTD revenue", hint: "Tallies from Payment rows" },
          { label: "New signups (7d)", hint: "User.createdAt" },
          { label: "Trial → paid", hint: "First rating conversion" },
        ].map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wider">
                {card.label}
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-tight">—</CardTitle>
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
