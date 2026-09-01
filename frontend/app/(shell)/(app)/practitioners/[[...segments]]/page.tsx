"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// Doctors now lives at /clinic/practitioners — this stub keeps old
// bookmarks/links working by forwarding straight through.
export default function PractitionersRedirect() {
  const router = useRouter();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  useEffect(() => {
    router.replace(`/clinic/practitioners${segments.length ? `/${segments.join("/")}` : ""}`);
  }, [router, segments.join("/")]);
  return null;
}
