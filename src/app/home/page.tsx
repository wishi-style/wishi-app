import { redirect } from "next/navigation";

// Loveable's App.tsx aliases /home → Index. Mirror with a permanent redirect
// so any in-flight /home links keep resolving to the marketing home page.
export default function HomeAliasPage(): never {
  redirect("/");
}
