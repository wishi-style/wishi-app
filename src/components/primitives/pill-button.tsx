import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillButtonVariants = cva(
  "inline-flex items-center justify-center rounded-full font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
  {
    variants: {
      variant: {
        solid: "bg-foreground text-background hover:bg-foreground/90",
        outline:
          "border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
        ghost: "bg-transparent text-foreground hover:bg-muted",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-[0.95rem]",
        lg: "h-12 px-8 text-base tracking-wide",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  },
);

type Variants = VariantProps<typeof pillButtonVariants>;

type LinkFormProps = Omit<React.ComponentProps<typeof Link>, "className"> &
  Variants & {
    className?: string;
    href: string;
  };

type ButtonFormProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> &
  Variants & {
    className?: string;
    href?: undefined;
  };

export type PillButtonProps = LinkFormProps | ButtonFormProps;

export function PillButton({
  variant,
  size,
  className,
  ...rest
}: PillButtonProps) {
  const classes = cn(pillButtonVariants({ variant, size }), className);
  if ("href" in rest && rest.href !== undefined) {
    return <Link {...(rest as LinkFormProps)} className={classes} />;
  }
  return <button {...(rest as ButtonFormProps)} className={classes} />;
}

export { pillButtonVariants };
