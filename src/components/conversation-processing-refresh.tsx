"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ConversationProcessingRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!active || pending) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, 3000);
    return () => window.clearInterval(timer);
  }, [active, pending, router]);
  return null;
}
