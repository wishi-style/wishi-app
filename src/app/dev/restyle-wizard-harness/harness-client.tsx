"use client";

import { useState } from "react";
import { RestyleWizard } from "@/components/boards/restyle-wizard";

export function RestyleWizardHarness() {
  const [open, setOpen] = useState(true);
  return (
    <div className="p-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border px-3 py-2 rounded"
        data-testid="reopen"
      >
        Open wizard
      </button>
      <RestyleWizard
        open={open}
        onOpenChange={setOpen}
        products={[
          { id: "p1", name: "Slim Pant", brand: "Rodd & Gunn", imageUrl: null, priceInCents: 7900 },
          { id: "p2", name: "Sneaker", brand: "Prada", imageUrl: null, priceInCents: 92500 },
          { id: "p3", name: "Pump", brand: "Gianvito Rossi", imageUrl: null, priceInCents: 51000 },
        ]}
        onSubmit={async () => {}}
      />
    </div>
  );
}
