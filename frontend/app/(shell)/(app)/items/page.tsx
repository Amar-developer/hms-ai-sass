"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Items now lives at /clinic/items — this stub keeps old bookmarks/links
// working by forwarding straight through.
export default function ItemsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/clinic/items");
  }, [router]);
  return null;
}
