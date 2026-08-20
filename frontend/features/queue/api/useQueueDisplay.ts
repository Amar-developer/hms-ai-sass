import { fetchDisplayMode } from "./queue.api";
import { type ApiSession } from "@/lib/api";
import { useState, useEffect } from "react";

export function useQueueDisplay(
  session: ApiSession,
  displayMode = "reception",
  refreshKey: string,
) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!session) return;
      if (alive) {
        setRows([]);
        setLoading(true);
      }
      try {
        const rows = await fetchDisplayMode(session, displayMode);
        if (alive) setRows(rows);
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [session?.email, session?.tenantId, displayMode, refreshKey]);

  return { rows, loading };
}
