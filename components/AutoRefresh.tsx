"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-runs the server component on an interval so live stats stay fresh. */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}
