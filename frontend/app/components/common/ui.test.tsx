// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Input } from "./ui";

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
