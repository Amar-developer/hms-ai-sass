"use client";

import { useParams } from "next/navigation";
import { ErrorLogs } from "@/features/error-logs/ErrorLogs";
import { useShellChrome } from "@/features/shell/AppShell";

export default function ErrorLogsPage() {
  const { apiSession } = useShellChrome();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const selectedId = segments[0] || "";
  return <ErrorLogs apiSession={apiSession} selectedId={selectedId} />;
}
