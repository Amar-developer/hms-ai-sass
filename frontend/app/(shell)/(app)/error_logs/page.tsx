"use client";

import { ErrorLogs } from "@/features/error-logs/ErrorLogs";
import { useShellChrome } from "@/features/shell/AppShell";

export default function ErrorLogsPage() {
  const { apiSession } = useShellChrome();
  return <ErrorLogs apiSession={apiSession} />;
}
