// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Input, SearchableSelect } from "./ui";

describe("Input", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("normalizes a controlled null value to an empty string", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <Input
        aria-label="Nullable input"
        value={null}
        onChange={vi.fn()}
      />,
    );

    expect((screen.getByLabelText("Nullable input") as HTMLInputElement).value).toBe("");
    expect(
      consoleError.mock.calls.some((call) =>
        call.some((value) => String(value).includes("should not be null")),
      ),
    ).toBe(false);
  });
});

describe("SearchableSelect", () => {
  it("keeps long selected labels truncatable and exposes the full label", () => {
    const longLabel = "Main Branch With A Very Long Location Description";

    render(
      <div className="w-36">
        <SearchableSelect
          value="main"
          onChange={vi.fn()}
          options={[{ value: "main", label: longLabel }]}
          searchable={false}
        />
      </div>,
    );

    const label = screen.getByTitle(longLabel);
    expect(label.className).toContain("truncate");
  });
});
