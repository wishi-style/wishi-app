import { redirect } from "next/navigation";

// /admin has no content of its own — every admin surface lives under a named
// child segment (/admin/dashboard, /admin/users, etc). Without this index
// page Next 16 returns 404 for the bare `/admin` URL even though the
// (admin)/layout.tsx requireRole guard would otherwise gate it. Same Next
// pitfall called out in CLAUDE.md for [id] directories with only subroutes.
export default function AdminIndex(): never {
  redirect("/admin/dashboard");
}
