"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// Scheduling now lives at /clinic/scheduling — this stub keeps old
// bookmarks/links working by forwarding straight through.
export default function SchedulingRedirect() {
  const router = useRouter();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  useEffect(() => {
    router.replace(`/clinic/scheduling${segments.length ? `/${segments.join("/")}` : ""}`);
  }, [router, segments.join("/")]);
  return null;
}
