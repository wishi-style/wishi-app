// Per Loveable HEAD: each stylist page renders its own chrome.
// StylistDashboard has an inline custom header; StylistProfile wraps in
// <StylistLayout> (sidebar + header). The route layout adds none, so
// neither stacks twice. Auth is enforced one level up in
// src/app/(stylist)/layout.tsx via requireRole("STYLIST").
export default function StylistChromeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
