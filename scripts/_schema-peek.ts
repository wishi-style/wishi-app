import { getPool } from "@/../tests/e2e/db";
(async () => {
  // Find the enum type backing budget_by_category.category
  const { rows: cat } = await getPool().query(
    `SELECT pg_type.typname
       FROM information_schema.columns c
       JOIN pg_attribute a ON a.attname = c.column_name
       JOIN pg_class t ON t.oid = a.attrelid AND t.relname = c.table_name
       JOIN pg_type ON pg_type.oid = a.atttypid
      WHERE c.table_name = 'budget_by_category' AND c.column_name='category' LIMIT 1`,
  );
  console.log("budget_by_category.category type:", cat[0]?.typname);
  if (cat[0]?.typname) {
    const { rows: vals } = await getPool().query(
      `SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname=$1) ORDER BY enumsortorder`,
      [cat[0].typname],
    );
    console.log("values:", vals.map((v) => v.enumlabel).join(" | "));
  }
  // Same for top_fit / bottom_fit
  for (const col of ["top_fit", "bottom_fit"]) {
    const { rows: r } = await getPool().query(
      `SELECT pg_type.typname
         FROM information_schema.columns c
         JOIN pg_attribute a ON a.attname = c.column_name
         JOIN pg_class t ON t.oid = a.attrelid AND t.relname = c.table_name
         JOIN pg_type ON pg_type.oid = a.atttypid
        WHERE c.table_name = 'body_profiles' AND c.column_name=$1 LIMIT 1`,
      [col],
    );
    console.log(`body_profiles.${col} type:`, r[0]?.typname);
  }
  // OnboardingStatus values
  const { rows: ob } = await getPool().query(
    `SELECT enumlabel FROM pg_enum e
     JOIN pg_type t ON t.oid=e.enumtypid
     WHERE t.typname ILIKE '%nboarding%' ORDER BY enumsortorder`,
  );
  console.log("onboarding statuses:", ob.map((r) => r.enumlabel).join(" | "));
  await getPool().end();
})();
