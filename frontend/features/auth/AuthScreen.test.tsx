// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthScreen } from "./AuthScreen";

describe("AuthScreen", () => {
  it("automatically rotates through the application highlights", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <AuthScreen onLogin={vi.fn().mockResolvedValue(undefined)} />,
    );

    expect(
      screen.getByTestId("login-highlight-0").getAttribute("data-active"),
    ).toBe("true");

    act(() => vi.advanceTimersByTime(5000));

    expect(
      screen.getByTestId("login-highlight-1").getAttribute("data-active"),
    ).toBe("true");

    unmount();
    vi.useRealTimers();
  });

  it("submits a username as the login identifier", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onLogin={onLogin} />);

    fireEvent.change(
      screen.getByPlaceholderText("username or name@clinic.com"),
      { target: { value: "front.desk" } },
    );
    fireEvent.change(screen.getByPlaceholderText("Enter password"), {
      target: { value: "SecretPass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(onLogin).toHaveBeenCalledWith({
        identifier: "front.desk",
        password: "SecretPass123",
      }),
    );
  });
});
