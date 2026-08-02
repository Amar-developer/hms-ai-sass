import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryClientConfig } from "./QueryProvider";

describe("shared application query cache", () => {
  it("does not make every application query globally fresh", () => {
    const client = new QueryClient(queryClientConfig);

    expect(client.getDefaultOptions().queries?.staleTime).toBe(0);
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  it("deduplicates and reuses data when a domain query explicitly opts in", async () => {
    const client = new QueryClient(queryClientConfig);
    const queryFn = vi.fn().mockResolvedValue([{ id: "practitioner-1" }]);
    const options = {
      queryKey: ["practitioners", "tenant-1"] as const,
      queryFn,
      staleTime: 60_000,
    };

    const [first, second] = await Promise.all([
      client.fetchQuery(options),
      client.fetchQuery(options),
    ]);
    const cached = await client.fetchQuery(options);

    expect(first).toEqual(second);
    expect(cached).toEqual(first);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
