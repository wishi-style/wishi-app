import { PageHeader } from "@/components/admin/page-header";
import { listPromoCodes } from "@/lib/promotions/promo-code.service";
import { PromoCodesTable } from "./promo-codes-table";
import { CreatePromoCodeButton } from "./create-promo-code-button";

export const dynamic = "force-dynamic";

export default async function AdminPromoCodesPage() {
  const codes = await listPromoCodes();
  const active = codes.filter((c) => c.isActive).length;
  return (
    <div>
      <PageHeader
        title="Promo codes"
        description={`${codes.length} total · ${active} active`}
        actions={<CreatePromoCodeButton />}
      />
      <PromoCodesTable codes={codes} />
    </div>
  );
}
