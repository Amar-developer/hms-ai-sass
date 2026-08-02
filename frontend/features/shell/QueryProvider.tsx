"use client";

import { useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";

export const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      // Domain hooks opt into freshness only when sharing that data is useful.
      // The global default stays fresh-on-read to avoid blindly caching every
      // clinical and financial request.
      staleTime: 0,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
};

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient(queryClientConfig));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
