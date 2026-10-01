"use client";

import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Submit button that shows a spinner while its form is being saved. */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  pendingText?: ReactNode;
  variant?: Parameters<typeof Button>[0]["variant"];
  size?: Parameters<typeof Button>[0]["size"];
  block?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
