"use client";

import { useClerk } from "@clerk/nextjs";
import { PillButton } from "@/components/primitives/pill-button";

type Size = "sm" | "md" | "lg";

interface Props {
  stylistProfileId: string;
  firstName: string;
  signedIn: boolean;
  size?: Size;
}

export function ContinueWithStylistButton({
  stylistProfileId,
  firstName,
  signedIn,
  size = "md",
}: Props) {
  const { openSignUp } = useClerk();
  const target = `/select-plan?stylistId=${stylistProfileId}`;

  if (signedIn) {
    return (
      <PillButton href={target} variant="solid" size={size}>
        Continue with {firstName}
      </PillButton>
    );
  }

  return (
    <PillButton
      variant="solid"
      size={size}
      onClick={() =>
        openSignUp({
          unsafeMetadata: { intentStylistProfileId: stylistProfileId },
          forceRedirectUrl: target,
        })
      }
    >
      Continue with {firstName}
    </PillButton>
  );
}
