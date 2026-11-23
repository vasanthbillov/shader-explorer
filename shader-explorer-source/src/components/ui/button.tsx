import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));
const variants = cva("button", {
  variants: {
    variant: {
      default: "button-primary",
      secondary: "button-secondary",
      ghost: "button-ghost",
      danger: "button-danger",
    },
    size: { default: "", sm: "button-sm", icon: "button-icon" },
  },
  defaultVariants: { variant: "secondary", size: "default" },
});
export function Button({
  className,
  variant,
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variants>) {
  return (
    <button className={cn(variants({ variant, size }), className)} {...props} />
  );
}
