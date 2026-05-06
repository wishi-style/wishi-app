// Display-name helpers for surfaces that render a User's name to another user
// (e.g. the stylist dashboard's session list, the ClientDetailPanel header).
//
// Clerk OAuth signups + the guest-quiz claim path both leave `User.firstName`
// and `User.lastName` empty when the third-party provider doesn't share them.
// Falling straight from "no name" to the literal "Client" produces a
// dashboard list of identical "Client" rows that's useless to a stylist —
// fall back to the email handle first so each row is at least distinguishable.

export function clientDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
): string {
  const fullName = [firstName, lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(" ");
  if (fullName) return fullName;

  const handle = emailHandle(email);
  if (handle) {
    return handle.charAt(0).toUpperCase() + handle.slice(1);
  }

  return "Client";
}

export function clientInitials(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
): string {
  const f = firstName?.trim()?.[0] ?? "";
  const l = lastName?.trim()?.[0] ?? "";
  const fromName = `${f}${l}`.toUpperCase();
  if (fromName) return fromName;

  const handle = emailHandle(email);
  if (handle) return handle.charAt(0).toUpperCase();

  return "?";
}

function emailHandle(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  const handle = (at >= 0 ? email.slice(0, at) : email).trim();
  return handle || null;
}
