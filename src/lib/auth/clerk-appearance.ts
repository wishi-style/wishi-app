// Loveable's auth modal styled on top of Clerk's prebuilt <SignIn /> /
// <SignUp />. Clerk owns the flow (session, OAuth, verification, rate
// limiting); this map only restyles the visible chrome to match the
// Wishi cream/warm-beige modal.
//
// Element keys are the stable cl-* names with the prefix dropped. See
// https://clerk.com/docs/customization/appearance-prop/overview.
// `!` Tailwind prefix forces overrides over Clerk's internal CSS-in-JS,
// which uses higher specificity (~`.cl-... + .cl-...` selectors). Without
// it the card stays clamped to Clerk's 25rem default and inputs/buttons
// keep Clerk's compressed sizing.

// Localization is set on <ClerkProvider> in app/layout.tsx — Clerk v7
// no longer accepts a `localization` prop on <SignIn />/<SignUp />.
export const wishiClerkLocalization = {
  signUp: {
    start: {
      title: "Create your account to get started",
      titleCombined: "Create your account to get started",
      subtitle: "",
      subtitleCombined: "",
      actionText: "Already have an account?",
      actionLink: "Sign in",
    },
  },
  signIn: {
    start: {
      title: "Welcome back",
      subtitle: "",
      actionText: "Don't have an account?",
      actionLink: "Sign up",
    },
  },
  formButtonPrimary: "Continue",
};

export const wishiClerkAppearance = {
  layout: {
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
    showOptionalFields: true,
    helpPageUrl: undefined,
    logoPlacement: "outside" as const,
    privacyPageUrl: "/privacy",
    termsPageUrl: "/terms",
  },
  variables: {
    colorPrimary: "hsl(0 0% 0%)",
    colorBackground: "hsl(36 52% 94%)",
    colorInputBackground: "hsl(36 100% 98%)",
    colorInputText: "hsl(0 0% 0%)",
    colorText: "hsl(0 0% 0%)",
    colorTextSecondary: "hsl(28 10% 40%)",
    colorDanger: "hsl(0 68% 29%)",
    colorSuccess: "hsl(0 0% 0%)",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
    fontSize: "0.95rem",
    borderRadius: "0.75rem",
    spacingUnit: "1rem",
  },
  elements: {
    rootBox: "!w-full !flex !justify-center",
    cardBox:
      "!w-full !max-w-[38rem] !shadow-2xl !shadow-black/10 !rounded-2xl !overflow-hidden !border !border-warm-beige",
    card:
      "!bg-cream !border-0 !rounded-none !shadow-none !w-full !max-w-none !px-10 !py-12 sm:!px-14 sm:!py-14 !gap-8",

    header: "!flex !flex-col !gap-2 !text-left",
    headerTitle:
      "![font-family:var(--font-display)] !font-medium !text-[1.625rem] !leading-[1.15] !tracking-tight !text-foreground !whitespace-nowrap",
    headerSubtitle: "!hidden",

    main: "!flex !flex-col !gap-7",

    socialButtonsBlockButton:
      "!border !border-foreground/15 !bg-background hover:!bg-background/70 !text-foreground !rounded-full !h-12 !font-medium !normal-case !shadow-none !transition-colors",
    socialButtonsBlockButtonText: "!text-foreground !font-medium !text-[0.95rem]",
    socialButtonsProviderIcon: "!h-5 !w-5",

    dividerRow: "!flex !items-center !gap-4",
    dividerLine: "!bg-foreground/12 !h-px !flex-1",
    dividerText:
      "!text-dark-taupe !text-[0.7rem] !uppercase !tracking-[0.24em] !font-medium",

    form: "!flex !flex-col !gap-5",
    formFieldRow: "!flex !flex-col !gap-2",
    formFieldLabel: "!text-foreground !text-[0.875rem] !font-medium",
    formFieldInput:
      "!bg-background !border !border-warm-beige !rounded-lg !h-12 !px-4 !text-foreground placeholder:!text-dark-taupe/60 focus:!border-foreground focus:!ring-0 !transition-colors",
    formFieldHintText: "!text-dark-taupe !text-xs !leading-relaxed !mt-1",
    formFieldErrorText: "!text-burgundy !text-xs !mt-1",
    formFieldSuccessText: "!text-foreground !text-xs !mt-1",
    formFieldWarningText: "!text-burgundy !text-xs !mt-1",
    formFieldAction:
      "!text-foreground hover:!text-foreground/80 !underline !underline-offset-2 !text-xs",

    formButtonPrimary:
      "!bg-foreground hover:!bg-foreground/90 !text-background !rounded-full !h-12 !font-medium !normal-case !shadow-none !tracking-wide !mt-2",
    formButtonPrimaryArrow: "!hidden",
    buttonArrowIcon: "!hidden",

    identityPreview:
      "!bg-background !border !border-warm-beige !rounded-lg !px-4 !py-3",
    identityPreviewText: "!text-foreground !text-sm",
    identityPreviewEditButton:
      "!text-foreground hover:!text-foreground/80 !underline !underline-offset-2",

    alert: "!bg-background !border !border-warm-beige !rounded-lg",
    alertText: "!text-foreground !text-sm",

    footer: "!bg-cream !border-t !border-warm-beige/60 !px-10 !py-4 sm:!px-14",
    footerAction: "!text-dark-taupe !text-sm",
    footerActionText: "!text-dark-taupe !text-sm",
    footerActionLink:
      "!text-foreground hover:!text-foreground/80 !underline !underline-offset-2 !font-medium",
    footerPagesLink: "!text-dark-taupe hover:!text-foreground !text-xs",
  },
};
