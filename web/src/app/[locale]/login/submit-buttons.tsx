"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Batch 3 — loading/pending feedback consistency.
 *
 * The login page is a server component whose three sign-in forms each post to a
 * server action (signInWithEmail / signInWithGoogle / signInAsGuest). Server
 * actions don't expose an `isPending` to the server component, so the submit
 * buttons used to give NO instant feedback — users couldn't tell their tap
 * registered and could double-submit.
 *
 * `useFormStatus()` reads the enclosing <form>'s submission state on the client,
 * letting us mirror the in-house gold standard (Loader2 spinner + label swap +
 * disabled) the moment the form is pending. `disabled={pending}` also guards
 * against double-submit. These are presentation-only wrappers — they don't
 * change the server action behaviour.
 */
export function LoginSubmitButton({
  children,
  pendingLabel,
  variant,
  className,
  icon,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "outline";
  className?: string;
  icon?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Button>
  );
}
